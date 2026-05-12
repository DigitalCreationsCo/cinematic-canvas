import { PipelineEvent } from "#shared/types/pipeline.types.js";
import { JobControlPlane } from "#shared/services/job-control-plane.js";
import { WorkflowOperator } from "#pipeline/workflow-service.js";

export const PipelineEventHandler = {
  async handleJobCompletion(
    jobId: string,
    jobControlPlane: JobControlPlane,
    workflowOperator: WorkflowOperator,
    publishPipelineEvent: (eventPayload: PipelineEvent) => Promise<string>,
  ) {
    const jobRecord = await jobControlPlane.getJob(jobId);
    if (!jobRecord || jobRecord.state !== "COMPLETED") {
      console.warn(`[Pipeline] Job ${jobId} not found or not yet COMPLETED – ignoring.`);
      return;
    }

    const isWorkflowResuming = !!jobRecord.workflowId;

    if (isWorkflowResuming) {
      console.log(
        {
          jobId,
          jobType: jobRecord.type,
          projectId: jobRecord.projectId,
        },
        "[Pipeline] Workflow job completed – resuming pipeline.",
      );
      await workflowOperator.resumePipeline(jobRecord);
    } else {
      // On-demand job (canvas-triggered, outside a workflow run).
      // Worker already emitted FULL_STATE; emit WORKFLOW_COMPLETED
      // so the client can re-enable its UI.
      console.log(
        { jobId, projectId: jobRecord.projectId },
        "[Pipeline] On-demand job completed – emitting WORKFLOW_COMPLETED.",
      );
      publishPipelineEvent({
        type: "WORKFLOW_COMPLETED",
        projectId: jobRecord.projectId,
        worldId: jobRecord.worldId,
        teamId: jobRecord.teamId,
        userId: jobRecord.userId,
        timestamp: new Date().toISOString(),
      });
    }
  },

  async handleJobFailure(
    jobId: string,
    jobControlPlane: JobControlPlane,
    publishPipelineEvent: (eventPayload: PipelineEvent) => Promise<string>,
  ) {
    const jobRecord = await jobControlPlane.getJob(jobId);
    if (!jobRecord || (jobRecord.state !== "FAILED" && jobRecord.state !== "FATAL")) {
      console.warn(`[Pipeline] Job ${jobId} not found or not in a failed state – ignoring.`);
      return;
    }

    // ── Silent Killer: RAI / Safety permanent errors ────
    // These must NEVER be retried indefinitely; mark FATAL
    // and surface an intervention event immediately.
    const isPermanentRaiError = jobRecord.state === "FATAL" && jobRecord.recoveryContext?.reason === "PERMANENT_ERROR";

    if (isPermanentRaiError) {
      console.warn({ job: jobRecord }, "[Pipeline] RAI/Safety permanent error detected – emitting intervention.");
      await jobControlPlane.updateJobSafe(jobId, jobRecord.attempts.currentAttempt, {
        state: "FATAL",
        error: jobRecord.error,
        attempts: {
          ...jobRecord.attempts,
          currentAttempt: jobRecord.attempts.currentAttempt + 1,
        },
        updatedAt: new Date(),
      });

      publishPipelineEvent({
        type: "LLM_INTERVENTION_NEEDED",
        projectId: jobRecord.projectId,
        worldId: jobRecord.worldId,
        teamId: jobRecord.teamId,
        userId: jobRecord.userId,
        payload: {
          type: "lm_intervention",
          error: jobRecord.error || "Generation failed due to safety guidelines violation.",
          functionName: jobRecord.type,
          nodeName: jobRecord.type,
          attemptCount: jobRecord.attempts.currentAttempt,
          jobType: jobRecord.type,
          jobId,
          params: jobRecord.result?.prompt,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // ── Normal retry / exhausted-retry path ────────────
    const {
      attempts: { currentAttempt, maxRetries },
    } = jobRecord;
    const nextAttemptCount = currentAttempt + 1;
    const isMaxRetriesExhausted = nextAttemptCount > maxRetries;

    await jobControlPlane.updateJobSafe(jobId, currentAttempt, {
      state: isMaxRetriesExhausted ? "FATAL" : "FAILED",
      error: jobRecord.error,
      attempts: {
        ...jobRecord.attempts,
        currentAttempt: nextAttemptCount,
      },
      updatedAt: new Date(),
    });

    console.warn(
      `[Pipeline] Job ${jobId}: ${isMaxRetriesExhausted ? "max retries exhausted → FATAL" : "marked for retry"}.`,
    );

    if (isMaxRetriesExhausted) {
      publishPipelineEvent({
        type: "WORKFLOW_FAILED",
        projectId: jobRecord.projectId,
        worldId: jobRecord.worldId,
        teamId: jobRecord.teamId,
        userId: jobRecord.userId,
        payload: {
          error: jobRecord.error || `Job ${jobId} (${jobRecord.type}) permanently failed.`,
        },
        timestamp: new Date().toISOString(),
      });
    }
  },
};
