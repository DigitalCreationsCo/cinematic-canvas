import { JobControlPlane } from "../shared/services/job-control-plane.js";
import { AttemptMetadata, JobRecord, IncrementAttemptHook, RetryStrategy } from "../shared/types/job.types.js";

export function createIncrementAttemptHook(
    jobControlPlane: JobControlPlane
): IncrementAttemptHook {

    return async function incrementAttempt(
        failedJob: JobRecord,
        error: string,
        strategy: RetryStrategy
    ): Promise<JobRecord | null> {

        const prev = failedJob.attempts;

        const updatedAttempts: AttemptMetadata = {
            currentAttempt: prev.currentAttempt,   // Caller resets this when creating the successor
            totalAttempts: prev.totalAttempts + 1, // THE increment. Monotonic. Never resets.
            maxRetries: prev.maxRetries,
            lastAttemptAt: new Date(),
            failureHistory: [
                ...prev.failureHistory,
                {
                    attempt: prev.currentAttempt,
                    totalAttempts: prev.totalAttempts,  // Snapshot BEFORE increment — "this is where we were"
                    error,
                    timestamp: new Date(),
                    strategy,
                },
            ],
        };

        // Persist to the existing (FATAL) job record so the history is never lost,
        // even if the successor job is never created (e.g. ceiling hit, manual stop).
        const updated = await jobControlPlane.patchAttempts(failedJob.id, updatedAttempts);

        console.log(`[incrementAttempt] Attempt advanced`, {
            jobId: failedJob.id,
            previousTotal: prev.totalAttempts,
            newTotal: updatedAttempts.totalAttempts,
            strategy,
        });

        return updated;
    };
}