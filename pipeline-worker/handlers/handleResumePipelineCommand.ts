import { PipelineCommand, PipelineEvent } from "../../shared/pubsub-types";
import { GraphState } from "../../shared/pipeline-types";
import { CinematicVideoWorkflow } from "../../pipeline/graph";
import { CheckpointerManager } from "../../pipeline/checkpointer-manager";
import { RunnableConfig } from "@langchain/core/runnables";
import { checkAndPublishInterruptFromSnapshot, checkAndPublishInterruptFromStream } from "../helpers/interrupts";

export async function handleResumePipelineCommand(
    command: Extract<PipelineCommand, { type: "RESUME_PIPELINE"; }>,
    publishPipelineEvent: (event: PipelineEvent) => Promise<void>,
    checkpointerManager: CheckpointerManager,
) {
    const { projectId } = command;
    console.log(`[handleResumePipelineCommand] Resuming pipeline for projectId: ${projectId}`);

    const bucketName = process.env.GCP_BUCKET_NAME;
    if (!bucketName) {
        throw new Error("GCP_BUCKET_NAME environment variable not set.");
    }

    const runnableConfig: RunnableConfig = {
        configurable: { thread_id: projectId },
    };

    const checkpointer = await checkpointerManager.getCheckpointer();
    if (!checkpointer) {
        throw new Error("Checkpointer not initialized");
    }

    const existingCheckpoint = await checkpointerManager.loadCheckpoint(runnableConfig);
    if (!existingCheckpoint) {
        console.warn(`No checkpoint found to resume for projectId: ${projectId}`);
        // Optionally send a FAILURE event back to client
        await publishPipelineEvent({
            type: "WORKFLOW_FAILED",
            projectId,
            payload: { error: "No existing pipeline found to resume." },
            timestamp: new Date().toISOString(),
        });
        return;
    }

    const workflow = new CinematicVideoWorkflow(process.env.GCP_PROJECT_ID!, projectId, bucketName);
    workflow.publishEvent = publishPipelineEvent;
    const compiledGraph = workflow.graph.compile({ checkpointer });

    console.log(`Pipeline for projectId: ${projectId} resuming.`);

    try {
        const stream = await compiledGraph.stream(null, { ...runnableConfig, streamMode: [ "values" ] });

        for await (const step of stream) {
            console.debug('[handleResumePipelineCommand] stream step');
            const [ _, state ] = Object.values(step);

            await publishPipelineEvent({
                type: "FULL_STATE",
                projectId,
                payload: { state: state as GraphState },
                timestamp: new Date().toISOString(),
            });

            await checkAndPublishInterruptFromStream(projectId, state as GraphState, publishPipelineEvent);
        }
    } catch (err) {
        console.error('[handleResumePipelineCommand] Error during stream execution:', err);
    } finally {
        await checkAndPublishInterruptFromSnapshot(projectId, compiledGraph, runnableConfig, publishPipelineEvent);
    }
}