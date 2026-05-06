import { db } from "../db/index.js";
import { jobs } from "../db/schema.js";
import { and, eq, sql } from "drizzle-orm";
import { JobControlPlane } from "./job-control-plane.js";
import { AttemptMetadata } from "../types/job.constants.js";



export class JobLifecycleMonitor {

    private static instance: JobLifecycleMonitor;
    private isRunning: boolean = false;
    private timeout: NodeJS.Timeout | null = null;

    private constructor(private jobControlPlane: JobControlPlane) { }

    public static getInstance(controlPlane: JobControlPlane): JobLifecycleMonitor {
        if (!JobLifecycleMonitor.instance) {
            JobLifecycleMonitor.instance = new JobLifecycleMonitor(controlPlane);
        }
        return JobLifecycleMonitor.instance;
    }

    public start(frequencyMs: number = 60000) {
        console.log({ functionName: this.start.name }, `Starting monitor...`);
        if (this.isRunning) return;
        this.isRunning = true;
        this.scheduleNextCycle(frequencyMs);
    }

    private scheduleNextCycle(frequencyMs: number) {
        if (!this.isRunning) return;
        this.timeout = setTimeout(() => this.maintenanceCycle(frequencyMs), frequencyMs);
    }

    private async maintenanceCycle(frequencyMs: number) {

        console.log({ functionName: this.maintenanceCycle.name, isRunning: this.isRunning }, `Cycle`);

        try {
            const [staleResult, retryResult] = await Promise.allSettled([
                this.processStaleJobs(),
                this.processRetryableJobs()
            ]);
            if (staleResult.status === "rejected") {
                console.error({ functionName: this.maintenanceCycle.name, task: "processStaleJobs", error: staleResult.reason }, "Cycle task failed");
            }
            if (retryResult.status === "rejected") {
                console.error({ functionName: this.maintenanceCycle.name, task: "processRetryableJobs", error: retryResult.reason }, "Cycle task failed");
            }
        } catch (error) {
            console.error({ functionName: this.maintenanceCycle.name, error }, "Maintenance cycle fatal error");
        } finally {
            this.scheduleNextCycle(frequencyMs);
        }
    }

    /**
     * RECOVERY: Finds jobs stuck in RUNNING state.
     */
    private async processStaleJobs() {

        console.log({ functionName: this.processStaleJobs.name }, `Processing Stale Jobs`);
        const records = await db.select({ id: jobs.id, attempts: jobs.attempts })
            .from(jobs)
            .where(and(
                eq(jobs.state, "RUNNING"),
                sql`updated_at < NOW() - INTERVAL '15 minutes'`
            ));

        for (const r of records) {
            try {
                const attempts = AttemptMetadata.parse(r.attempts);

                if (attempts.currentAttempt >= attempts.maxRetries) {
                    console.warn({
                        functionName: this.processStaleJobs.name,
                        jobId: r.id,
                        currentAttempt: attempts.currentAttempt,
                        maxRetries: attempts.maxRetries
                    }, "Failing Stale Job (Retries Exhausted)");

                    await this.jobControlPlane.updateJobState(
                        r.id,
                        "FAILED",
                        undefined,
                        "Job execution timed out and retries exhausted"
                    );
                } else {
                    console.log({
                        functionName: this.processStaleJobs.name,
                        jobId: r.id,
                        currentAttempt: attempts.currentAttempt,
                        maxRetries: attempts.maxRetries
                    }, "Recovering Stale Job (Retrying)");

                    await this.jobControlPlane.requeueJob(r.id);
                }
            } catch (err) {
                console.error({ functionName: this.processStaleJobs.name, jobId: r.id, error: err }, "Failed to process stale job; skipping");
            }
        }
    }

    /**
     * RETRY: Finds jobs in FAILED state that have passed their backoff period.
     */
    private async processRetryableJobs() {

        console.log({ functionName: this.processRetryableJobs.name }, `Processing Retryable Jobs`);
        const records = await db.select({ id: jobs.id, attempts: jobs.attempts })
            .from(jobs)
            .where(and(
                eq(jobs.state, "FAILED"),
                // Backoff logic: 2^(attempt-1) minutes delay
                sql`updated_at < NOW() - (POWER(2, GREATEST((attempts->>'currentAttempt')::numeric - 1, 0)) * INTERVAL '1 minute')`)
            );

        for (const r of records) {
            try {
                const attempts = AttemptMetadata.parse(r.attempts);
                await this.jobControlPlane.requeueJob(r.id);
            } catch (err) {
                console.error({ functionName: this.processRetryableJobs.name, jobId: r.id, error: err }, "Failed to requeue retryable job; skipping");
            }
        }
    }

    public stop() {
        console.log({ functionName: this.stop.name }, `Stopping...`);
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        this.isRunning = false;
    }
}
