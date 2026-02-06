import * as dotenv from "dotenv";
dotenv.config();
import { StateGraph, END, START, NodeInterrupt, Command, interrupt, Send } from "@langchain/langgraph";
import { IncrementAttemptHook, JobEvent, Job, JobType, RecoveryConfig, AnyJob } from "../shared/types/job.types.js";
import {
    AssetKey,
    LlmRetryInterruptValue,
} from "../shared/types/index.js";
import { JobControlPlane } from "../shared/services/job-control-plane.js";
import { WorkflowFatalError } from "../shared/utils/errors.js";



export type JobPayload<T extends JobType> =
    Extract<AnyJob, { type: T; }>[ 'payload' ] extends undefined
    ? [ payload?: undefined ]
    : [ payload: Extract<AnyJob, { type: T; }>[ 'payload' ] ];

export type BatchJobs<T extends JobType> = (
    Pick<Extract<AnyJob, { type: T; }>, "type" | "uniqueKey" | "assetKey">
    & { payload: JobPayload<T>[ 0 ]; }
)[];

export class Dispatcher {

    constructor(
        private jobControlPlane: JobControlPlane,
        private projectId: string,
        private MAX_PARALLEL_JOBS: number,
    ) { }

    async ensureJob<T extends JobType>(
        nodeName: string,
        jobType: T,
        assetKey: AssetKey,
        ...payloadArg: JobPayload<T>
    ): Promise<Extract<AnyJob, { type: T; }> | undefined> {
        try {
        const [ payload ] = payloadArg;
        const existing = await this.jobControlPlane.getLatestJob(this.projectId, jobType, nodeName);
        if (!existing) {
            return this.createInitialJob(nodeName, jobType, assetKey, payload);
        }

        if (existing.state === 'COMPLETED') {
            return existing as Extract<AnyJob, { type: T; }>;
        }

        if (existing.state === "RUNNING") {
            this.interruptAndWait(nodeName, existing);
        }
        
        if (existing.state === "PENDING") {
            await this.jobControlPlane.requeueJob(existing.id, { newState: "PENDING", currentAttempt: existing.attempts.currentAttempt, retryStrategy: "STALE_RECOVERY" });
        }

        if (existing.state === 'FAILED') {
            return this.handleRetriableFailure(nodeName, jobType, assetKey, payload, existing);
        // // 6. Option 2 "Way Through": If we are here, retries are exhausted.
        // throw new Error(`Job ${job.id} failed and exhausted all ${job.maxRetries} retries. To reset, a new job record with the same uniqueKey must be created.`);
        }

        if (existing.state === "FATAL") {
            return this.handleFatalFailure(nodeName, jobType, assetKey, payload, existing);
        }

            throw new Error(`[ensureJob] Unhandled job state: ${existing.state}`);
        } catch (error) {
            console.error({ error, nodeName, jobType, functionName: 'ensureJob' }, 'An error occurred');
            throw error;
        }
    }

    async ensureBatchJobs<T extends JobType>(
        nodeName: string,
        jobs: BatchJobs<T>,
    ): Promise<Extract<AnyJob, { type: T; }>[]> {
        let completedJobs: Extract<AnyJob, { type: T; }>[] = [];
        const missingJobs: typeof jobs = [];
        const failedJobs: { id: string; attempts: number; maxRetries: number; error: string; }[] = [];
        let runningCount = 0;

        // 1. Check status of all requested jobs using 'getLatestJob' for logical addressing
        for (const jobRequest of jobs) {
            // For batch jobs, we treat the 'id' field as the uniqueKey (the logical address)
            const job = await this.jobControlPlane.getLatestJob(this.projectId, jobRequest.type, jobRequest.uniqueKey);

            if (!job) {
                missingJobs.push(jobRequest);
            } else if (job.state === 'COMPLETED') {
                completedJobs.push(job as Extract<AnyJob, { type: T; }>);
            } else if (job.state === 'FAILED') {
                failedJobs.push({ id: job.id, attempts: job.attempts.currentAttempt, maxRetries: job.attempts.maxRetries, error: job.error || "Unknown error" });
            } else {
                // PENDING or RUNNING
                runningCount++;
            }
        }

        // 2. Handle Aggregated Failures
        if (failedJobs.length > 0) {
            const errorMsg = `${failedJobs.length} jobs failed in batch: ${failedJobs.map(f => f.id).join(', ')}`;
            console.error(`[${nodeName}] ${errorMsg}`);

            const interruptValue: LlmRetryInterruptValue = {
                type: "llm_retry_exhausted",
                error: errorMsg,
                errorDetails: { failedJobs },
                functionName: "ensureBatchJobs",
                nodeName: nodeName,
                projectId: this.projectId,
                attempts: failedJobs[ 0 ].attempts,
                maxRetries: failedJobs[ 0 ].maxRetries,
                lastAttemptTimestamp: new Date().toISOString(),
            };

            interrupt(interruptValue);
        }

        // 3. Throttling & Creation
        const slotsAvailable = this.MAX_PARALLEL_JOBS - runningCount;

        if (missingJobs.length > 0) {
            // Only start as many as we have slots for
            const jobsToStart = missingJobs.slice(0, slotsAvailable);

            if (jobsToStart.length > 0) {
                console.log(`[${nodeName}] Starting ${jobsToStart.length} new jobs (Throttling: ${runningCount}/${this.MAX_PARALLEL_JOBS} active)`);

                for (const jobRequest of jobsToStart) {
                    await this.jobControlPlane.createJob({
                        ...jobRequest,
                        projectId: this.projectId,
                        uniqueKey: jobRequest.uniqueKey,
                    });
                    runningCount++;
                }
            }
        }

        // 4. Wait if any are running or if we still have missing jobs (queued)
        const notCompletedCount = missingJobs.length;

        if (notCompletedCount > 0) {
            console.log(`[${nodeName}] Waiting for ${notCompletedCount} jobs (${runningCount} running, ${jobs.length - completedJobs.length - runningCount} pending start)...`);
            const interruptValue: LlmRetryInterruptValue = {
                type: "waiting_for_batch",
                error: `Waiting for ${notCompletedCount} batch jobs to complete`,
                errorDetails: { pendingJobs: notCompletedCount },
                functionName: "ensureBatchJobs",
                nodeName: nodeName,
                projectId: this.projectId,
                attempts: 1,
                maxRetries: this.getRecoveryConfig(jobs[ 0 ].type).maxRetries,
                lastAttemptTimestamp: new Date().toISOString(),
            };
            interrupt(interruptValue);
        }

        return completedJobs;
    }

    private async createInitialJob<T extends JobType>(
        nodeName: string,
        jobType: T,
        assetKey: AssetKey,
        payload: any
    ): Promise<never> {
        const job = await this.jobControlPlane.createJob({
            type: jobType,
            projectId: this.projectId,
            uniqueKey: nodeName,
            assetKey,
            payload,
            state: "PENDING",
            attempts: {
                currentAttempt: 1,
                totalAttempts: 1,
                maxRetries: this.getRecoveryConfig(jobType).maxRetries,
                lastAttemptAt: new Date(),
                failureHistory: [],
            },
        });

        console.log(`[${nodeName}] Initial job created`, { jobId: job.id });
        this.interruptAndWait(nodeName, job);
    }

    private async handleRetriableFailure<T extends JobType>(
        nodeName: string,
        jobType: T,
        assetKey: AssetKey,
        payload: any,
        job: Job
    ): Promise<never> {
        const { currentAttempt, maxRetries } = job.attempts;

        // Branch A: retries still available — re-queue in place
        if (currentAttempt < maxRetries) {
            console.log(`[${nodeName}] Retriable failure — requeueing in place`, {
                jobId: job.id,
                attempt: `${currentAttempt}/${maxRetries}`,
            });

            await this.jobControlPlane.requeueJob(job.id, {
                newState: "PENDING",
                currentAttempt: currentAttempt + 1,
                retryStrategy: "BACKOFF_RETRY",
            });

            // Re-fetch so interruptAndWait sees the updated record
            const requeued = await this.jobControlPlane.getJob(job.id);
            if (!requeued) {
                throw new Error(`Job ${job.id} not found after requeue`);
            }
            this.interruptAndWait(nodeName, requeued);
        }

        // Branch B: retries exhausted — treat as fatal, recover via successor
        console.log(`[${nodeName}] Retries exhausted on job record — escalating`, {
            jobId: job.id,
            currentAttempt,
            maxRetries,
            totalAttempts: job.attempts.totalAttempts,
        });

        // Mark this record as FATAL so the state machine is consistent
        await this.jobControlPlane.updateJobState(job.id, "FATAL", {
            reason: "RETRY_EXHAUSTED",
            triggeredBy: "DISPATCHER",
        });

        const fatalJob = await this.jobControlPlane.getJob(job.id);
        if (!fatalJob) {
            throw new Error(`Job ${job.id} not found after marking as fatal`);
        }

        return this.handleFatalFailure(nodeName, jobType, assetKey, payload, fatalJob);
    }

    // This is THE recovery gate. It calls incrementAttempt (the hook) to
    // advance the monotonic counter, then decides: auto-recover or throw.
    private async handleFatalFailure<T extends JobType>(
        nodeName: string,
        jobType: T,
        assetKey: AssetKey,
        payload: any,
        fatalJob: Job
    ): Promise<never> {
        const config = this.getRecoveryConfig(jobType);

        // ── BUG 1 guard: idempotency check ──────────────────────────────────────
        // Re-read the FATAL record from the DB right now. If its totalAttempts
        // is higher than what we were handed, the hook already ran on a previous
        // entry into this method (race: graph resumed between patchAttempts and
        // createJob). In that case we skip the hook entirely and look for the
        // successor that the previous entry should have created.
        const freshFatalJob = await this.jobControlPlane.getJob(fatalJob.id);
        if (!freshFatalJob) {
            throw new Error(`Job ${fatalJob.id} not found after marking as fatal`);
        }

        if (freshFatalJob.attempts.totalAttempts > fatalJob.attempts.totalAttempts) {
            // Hook already ran. A successor may or may not have been created yet.
            // Look for it via the same logical address.
            const successor = await this.jobControlPlane.getLatestJob(
                this.projectId, jobType, nodeName
            );

            // If the successor exists and is not this same FATAL record, wait on it.
            // If it doesn't exist yet (or IS this record — true race edge),
            // interrupt on the fresh FATAL job; the next resume will find the successor.
            if (successor && successor.id !== freshFatalJob.id) {
                this.interruptAndWait(nodeName, successor);
            }
            this.interruptAndWait(nodeName, freshFatalJob);
        }

        // ── BUG 3 fix: three-level error extraction ─────────────────────────────
        // 1. failureHistory (populated by previous hook calls)
        // 2. job.error      (written by the worker when it sets FATAL)
        // 3. hardcoded fallback
        const error =
            freshFatalJob.attempts.failureHistory.at(-1)?.error ??
            freshFatalJob.error ??
            "unknown fatal error";

        // ── Create the hook and call it — this is where totalAttempts actually increments ──────
        const increment = this.jobControlPlane.createIncrementAttemptHook(freshFatalJob);
        const advanced = await increment(error, "SUCCESSOR_RECOVERY");
        if (!advanced) {
            throw new Error(`Job ${freshFatalJob.id} not found after marking as fatal`);
        }

        // ── Check lifetime ceiling ──────────────────────────────────────────────
        if (advanced.attempts.totalAttempts > config.maxTotalAttempts) {
            
            // commented out because it blocked the execution
            // throw new WorkflowFatalError(
            //     `[${nodeName}] Job exhausted all ${config.maxTotalAttempts} lifetime attempts. ` +
            //     config.recoveryInstructions,
            //     {
            //         jobId: freshFatalJob.id,
            //         nodeName,
            //         totalAttempts: advanced.attempts.totalAttempts,
            //         failureHistory: advanced.attempts.failureHistory,
            //     }
            // );
        }

        // ── Auto-recovery disabled — require manual intervention ───────────────
        if (!config.allowAutoRecovery) {
            throw new WorkflowFatalError(
                `[${nodeName}] Auto-recovery is disabled for ${jobType}. ` +
                config.recoveryInstructions,
                {
                    jobId: freshFatalJob.id,
                    nodeName,
                    totalAttempts: advanced.attempts.totalAttempts,
                }
            );
        }

        // ── Auto-recovery: create successor job ─────────────────────────────────
        console.log(`[${nodeName}] Auto-recovery — creating successor job`, {
            previousJobId: freshFatalJob.id,
            totalAttempts: advanced.attempts.totalAttempts,
        });

        const successor = await this.jobControlPlane.createJob({
            type: jobType,
            projectId: this.projectId,
            uniqueKey: nodeName,
            assetKey,
            payload,
            state: "PENDING",
            attempts: {
                currentAttempt: 1,                                          // Fresh lifecycle
                totalAttempts: advanced.attempts.totalAttempts,            // Inherited — monotonic
                maxRetries: config.maxRetries,                          // Fresh per-record retry budget
                lastAttemptAt: new Date(),
                failureHistory: advanced.attempts.failureHistory,          // Full history carried forward
            },
            recoveryContext: {
                reason: "RETRY_EXHAUSTED",
                triggeredBy: "DISPATCHER",
                previousJobId: freshFatalJob.id,
            },
        });

        console.log(`[${nodeName}] Successor created`, {
            successorId: successor.id,
            previousJobId: freshFatalJob.id,
            totalAttempts: successor.attempts.totalAttempts,
        });

        this.interruptAndWait(nodeName, successor);
    }

    private interruptAndWait(nodeName: string, job: Job): never {

        const value: LlmRetryInterruptValue = {
            type: "waiting_for_job",
            error: "waiting_for_job",
            errorDetails: {
                jobId: job.id,
                logicalKey: nodeName,
                state: job.state,
                currentAttempt: job.attempts.currentAttempt,
                totalAttempts: job.attempts.totalAttempts,
            },
            functionName: "ensureJob",
            nodeName,
            projectId: this.projectId,
            attempts: job.attempts.totalAttempts,  // Metrics see the monotonic values
            maxRetries: job.attempts.maxRetries,
            lastAttemptTimestamp: job.attempts.lastAttemptAt.toISOString(),
        };

        interrupt(value); 
        throw new Error("unreachable"); 
    }

    private getRecoveryConfig(jobType: JobType): RecoveryConfig {
        const baseConfig = {
            maxRetries: 2,
            maxTotalAttempts: 6,
            allowAutoRecovery: true,
            recoveryInstructions: "",
        };
        const configs = {
            GENERATE_SCENE_FRAMES: {
                maxRetries: 3,
                maxTotalAttempts: 12,   // Up to 4 successor jobs × 3 retries each
                allowAutoRecovery: true,
                recoveryInstructions:
                    "Frame generation failed permanently. Review prompt content and API status, then re-trigger the workflow.",
            },
            PROCESS_AUDIO_TO_SCENES: {
                maxRetries: 2,
                maxTotalAttempts: 6,
                allowAutoRecovery: true,
                recoveryInstructions:
                    "Verify input audio file and re-trigger.",
            },
        } as Record<JobType, RecoveryConfig>;
        return configs[ jobType ] || baseConfig;
    }
}