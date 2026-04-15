// src/shared/services/job-control-plane.ts
// ─────────────────────────────────────────────────────────────────────────────
// CHANGES:
//   createJob             — emits JobEvent with userId, teamId, metadata
//   cancelJob             — returns typed result; guards against RUNNING state;
//                           fetches job before update to build full metadata
//   listActiveJobs        — NEW: returns only non-terminal jobs for a project
//   cancelPendingJobsByWorkflow — NEW: bulk-cancel all PENDING jobs tied to a
//                           workflowId; called by pipeline service on STOP_PIPELINE
// ─────────────────────────────────────────────────────────────────────────────
import { PoolManager } from "./pool-manager.js";
import { db, schema } from "../db/index.js";
import { eq, and, sql, desc, count, isNull, inArray } from "drizzle-orm";
import { createHash } from 'crypto';
import { Job, InsertJob, JobState, JobEvent, JobType, RetryStrategy, AttemptMetadata, AnyJob, ACTIVE_JOB_STATES, buildJobEventMetadata } from "../types/job.types.js";
import { IncrementAttemptHook } from "../types/pipeline.types.js";
import { jobs } from "../db/schema.js";
import { reviveDates } from "../utils/utils.js";
import { z } from "zod";
import { AssetKey } from "../types/assets.types.js";

// ─── Cancel result ────────────────────────────────────────────────────────────

export type CancelJobResult =
    | { success: true }
    | { success: false; reason: "NOT_FOUND" | "RUNNING" | "ALREADY_TERMINAL" | "CONCURRENT_UPDATE" };

/**
 * Manages the lifecycle and persistence of background jobs.
 * Handles atomic state transitions, concurrency limits, and data serialization.
 */
export class JobControlPlane {

    /**
     * @param poolManager - The managed connection pool with circuit-breaking capabilities.
     * @param publishJobEvent - Callback to broadcast job state changes to the system.
     */
    constructor(
        private poolManager: PoolManager,
        private publishJobEvent: (evt: JobEvent) => Promise<any>,
    ) { }

    /**
    * Namespace identifier for jobs that are scoped to a specific asset
    */
    uniqueKey = (entityId: string, suffix: string): string => {
        return `${entityId}-${suffix}`;
    };

    private hashTo32BitInt(input: string): number {
        const hash = createHash('md5').update(input).digest('hex');
        return Int32Array.from([parseInt(hash.substring(0, 8), 16)])[0];
    }

    private hashTo64BitInt(uuid: string): bigint {
        const hash = createHash('sha256').update(uuid).digest('hex');
        const hex64 = hash.substring(0, 16);
        return BigInt(`0x${hex64}`) - (BigInt(1) << BigInt(63));
    }

    async createJob(values: z.input<typeof InsertJob>): Promise<Job> {

        const insert = InsertJob.parse(values);
        const [job] = await db.insert(jobs).values(insert).returning();

        console.info({ job }, `Job created`);

        await this.publishJobEvent({
            type: "JOB_DISPATCHED",
            projectId: job.projectId,
            userId: job.userId,
            teamId: job.teamId,
            metadata: buildJobEventMetadata(job as Job),
        });

        return Job.parse(job);
    }

    async getJob(jobId: string): Promise<Job | null> {

        const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
        if (!row) return null;

        if (row && row.result) {
            row.result = reviveDates(row.result);
        }

        return Job.parse(row);
    }

    async getLatestJob(projectId: string, type: JobType, uniqueKey?: string) {
        const conditions = [
            eq(jobs.projectId, projectId),
            eq(jobs.type, type)
        ];

        if (uniqueKey) {
            conditions.push(eq(jobs.uniqueKey, uniqueKey));
        } else {
            conditions.push(sql`${jobs.uniqueKey} IS NULL`);
        }

        const [row] = await db.select()
            .from(jobs)
            .where(and(...conditions))
            .orderBy(desc(jobs.createdAt))
            .limit(1);

        if (!row) return null;
        if (row.result) {
            row.result = reviveDates(row.result);
        }

        return Job.parse(row);
    }

    async refreshJob(job: Job): Promise<Job> {
        const latest = await this.getLatestJob(
            job.projectId,
            job.type,
            job.uniqueKey ?? undefined
        );

        if (!latest) {
            throw new Error(`JobConsistencyError: Job ${job.id} no longer exists or has been purged.`);
        }

        if (latest.state === 'CANCELLED' || latest.state === 'FAILED') {
            console.warn({ jobId: job.id, newState: latest.state }, `Job is ${latest.state}. Data may be stale`);
        }

        return latest;
    }

    async claimJob<T extends JobType>(jobId: string): Promise<[Extract<AnyJob, { type: T }>, string] | null> {

        return await db.transaction(async (tx) => {

            const jobKey = this.hashTo64BitInt(jobId);

            const lockResult = await tx.execute(
                sql`SELECT pg_try_advisory_xact_lock(${jobKey}) as locked`
            );

            if (!lockResult.rows[0]?.locked) return null;

            const limit = parseInt(process.env.MAX_CONCURRENT_JOBS_PER_WORKFLOW || "10", 10);

            const [jobResult, countResult] = await Promise.all([
                tx
                    .select({ projectId: jobs.projectId })
                    .from(jobs)
                    .where(eq(jobs.id, jobId))
                    .limit(1),
                tx
                    .select({ count: sql<number>`count(*)` })
                    .from(jobs)
                    .where(and(
                        eq(jobs.projectId, sql`(SELECT project_id FROM jobs WHERE id = ${jobId})`),
                        eq(jobs.state, "RUNNING")
                    ))
            ]);

            if (jobResult.length === 0) return null;

            const [{ count }] = countResult;
            if (count >= limit) return null;

            const claimTime = new Date();

            const [claimedJob] = await tx
                .update(jobs)
                .set({
                    state: "RUNNING",
                    updatedAt: claimTime
                })
                // Guard: only claim PENDING jobs — prevents claiming a job that
                // was cancelled between JOB_DISPATCHED and the worker picking it up.
                .where(and(eq(jobs.id, jobId), eq(jobs.state, "PENDING")))
                .returning();

            if (!claimedJob) return null;

            const revivedJob = reviveDates(claimedJob);

            return [revivedJob as Extract<AnyJob, { type: T }>, claimTime.toISOString()];
        });
    }

    /**
  * Resets a job to CREATED state and dispatches a notification.
  * Includes audit logging to track whether this was a recovery or a retry.
  * * @param jobId - The ID of the job to requeue.
  * @param currentAttempt - The current attempt for optimistic locking.
  * @param context - The monitor context (e.g., 'STALE_RECOVERY' or 'BACKOFF_RETRY').
  */
    async requeueJob(jobId: string) {
        try {
            const claimTime = new Date();
            const [result] = await db.update(jobs)
                .set({
                    state: "PENDING",
                    updatedAt: claimTime
                })
                .where(and(eq(jobs.id, jobId), eq(jobs.state, "FAILED")))
                .returning();

            const auditLog = result
                ? `[${new Date().toISOString()}] Job ${jobId} requeued to PENDING.`
                : '';

            if (result) {
                console.info({ functionName: this.requeueJob.name, auditLog, job: result }, `Job requeued.`);
            } else {
                console.warn({ functionName: this.requeueJob.name, auditLog: auditLog.trim(), job: result }, `Race condition avoided: Job already updated by worker.`);
            }
        } catch (error) {
            console.error({ functionName: this.requeueJob.name, error: error }, `Failed to requeue job`);
        }
    }

    // async requeueJob(jobId: string, params: { newState: JobState; currentAttempt: number; retryStrategy: RetryStrategy; }): Promise<void> {
    //     try {
    //         const auditLog = ` [Monitor] Action: ${params.retryStrategy} at ${new Date().toISOString()}`;

    //         const result = await this.updateJobSafeAndIncrementAttempt(jobId, params.currentAttempt, {
    //             state: params.newState,
    //             error: sql<string>`COALESCE(${jobs.error}, '') || ${auditLog}` as any,
    //         });

    //         if (result) {
    //             await this.publishJobEvent({
    //                 type: "JOB_DISPATCHED",
    //                 jobId: result.id,
    //                 projectId: result.projectId,
    //             });
    //             console.log({ functionName: this.requeueJob.name, auditLog: auditLog.trim(), job: result }, `Requeued with new attempt`);
    //         } else {
    //             console.warn({ functionName: this.requeueJob.name, auditLog: auditLog.trim(), job: result }, `Race condition avoided: Job already updated by worker.`);
    //         }
    //     } catch (error) {
    //         console.error({ functionName: this.requeueJob.name, error: error }, `Failed to requeue job`);
    //     }
    // }

    async updateJobState(jobId: string, state: JobState, meta?: Record<string, any>, error?: string) {

        const jsonSafeResult = meta
            ? JSON.parse(JSON.stringify(meta))
            : null;
        const [updatedJob] = await db.update(jobs)
            .set({
                state: state,
                result: jsonSafeResult,
                error: error,
                updatedAt: new Date(),
            })
            .where(eq(jobs.id, jobId))
            .returning();
        console.log({ jobId, state, meta }, `Updated job`);

        return Job.parse(updatedJob);
    }

    async updateJobSafe<T extends JobType>(
        jobId: string,
        currentAttempt: number,
        updates?: Partial<Extract<Job, { type: T; }>>,
    ): Promise<Extract<AnyJob, { type: T; }>> {

        const [result] = await db.update(jobs)
            .set({
                ...updates,
                updatedAt: new Date(),
            })
            .where(and(
                eq(jobs.id, jobId),
                sql`${jobs.attempts} #>> '{currentAttempt}' = ${currentAttempt.toString()}`))
            .returning();

        if (!result) {
            console.error({ functionName: this.updateJobSafe.name, jobId, currentAttempt }, `LockError: Job ${jobId} was not updated. It was possibly updated by another process.`);
            throw Error(`Job ${jobId} was not updated`);
        }

        return Job.parse(result) as Extract<AnyJob, { type: T; }>;
    }

    async updateJobSafeAndIncrementAttempt(
        jobId: string,
        currentAttempt: number,
        updates?: Partial<typeof jobs.$inferInsert>
    ) {
        const { attempts, ...rest } = updates || {};

        return await db.transaction(async (tx) => {
            const jobKey = this.hashTo64BitInt(jobId);

            const lockResult = await tx.execute(
                sql`SELECT pg_try_advisory_xact_lock(${jobKey}) as locked`
            );

            if (!lockResult.rows[0]?.locked) {
                console.warn({ functionName: this.updateJobSafeAndIncrementAttempt.name, jobId, currentAttempt }, `LockError: Failed to acquire advisory lock for job update. Job may be updated by another process.`);
                throw Error(`Failed to acquire lock for job ${jobId}`);
            }

            const [currentJob] = await tx.select({ attempts: jobs.attempts })
                .from(jobs)
                .where(eq(jobs.id, jobId));

            if (!currentJob) {
                console.warn({ functionName: this.updateJobSafeAndIncrementAttempt.name, jobId, currentAttempt }, `LockError: Job ${jobId} not found or purged.`);
                throw Error(`Job ${jobId} not found`);
            }

            const attemptsData = AttemptMetadata.parse(currentJob.attempts);

            if (attemptsData.currentAttempt !== currentAttempt) {
                console.warn({ functionName: this.updateJobSafeAndIncrementAttempt.name, jobId, currentAttempt, actual: attemptsData.currentAttempt }, `LockError: Optimistic lock failed.`);
                throw Error(`Optimistic lock failed for job ${jobId}`);
            }

            const newAttempts = {
                ...attemptsData,
                currentAttempt: attemptsData.currentAttempt + 1,
                totalAttempts: attemptsData.totalAttempts + 1
            };

            const [result] = await tx.update(jobs)
                .set({
                    ...rest,
                    attempts: newAttempts as any,
                    updatedAt: new Date(),
                })
                .where(eq(jobs.id, jobId))
                .returning();

            if (!result) {
                console.warn({ functionName: this.updateJobSafeAndIncrementAttempt.name, jobId, currentAttempt }, `LockError: Job ${jobId} was not updated. It was possibly updated by another process.`);
                throw Error(`Job ${jobId} was not updated`);
            }

            return Job.parse(result);
        });
    }

    async patchAttempts(jobId: string, attempts: AttemptMetadata) {
        const [result] = await db.update(jobs)
            .set({
                attempts: sql`${jobs.attempts} || ${attempts}`,
                updatedAt: new Date(),
            })
            .where(eq(jobs.id, jobId))
            .returning();

        if (!result) {
            console.warn({ functionName: this.patchAttempts.name, jobId }, `LockError: Job ${jobId} was not updated. It was possibly updated by another process.`);
            throw Error(`Job ${jobId} was not updated`);
        }

        return Job.parse(result);
    }

    async listJobs(projectId: string): Promise<Job[]> {
        const rows = await db
            .select()
            .from(jobs)
            .where(eq(jobs.projectId, projectId))
            .orderBy(desc(jobs.createdAt));

        return rows.map((row) => Job.parse(row));
    }

    /**
     * Returns only non-terminal (PENDING | RUNNING) jobs for a project.
     * Used by the REST endpoint that hydrates the client job store on connect.
     *
     * The partial select deliberately strips heavy columns (payload, result,
     * attempts, recoveryContext) — the client only needs identity + state info.
     */
    async listActiveJobs(projectId: string): Promise<ActiveJobRecord[]> {
        const rows = await db
            .select({
                id: jobs.id,
                type: jobs.type,
                state: jobs.state,
                projectId: jobs.projectId,
                userId: jobs.userId,
                teamId: jobs.teamId,
                workflowId: jobs.workflowId,
                error: jobs.error,
                createdAt: jobs.createdAt,
                updatedAt: jobs.updatedAt,
            })
            .from(jobs)
            .where(and(
                eq(jobs.projectId, projectId),
                inArray(jobs.state, ACTIVE_JOB_STATES as unknown as JobState[])
            ))
            .orderBy(desc(jobs.createdAt));

        return rows as ActiveJobRecord[];
    }

    /**
     * Cancels a single job by ID.
     *
     * Rules:
     *   - Only PENDING jobs may be cancelled. RUNNING jobs have already been
     *     claimed by a worker — interrupting them mid-flight is unsafe and is
     *     not supported. The caller should display an error to the user.
     *   - Uses a conditional UPDATE (WHERE state = 'PENDING') so concurrent
     *     claim races are handled atomically without an extra read.
     *
     * @returns A typed result object so callers can craft appropriate responses.
     */
    async cancelJob(
        jobId: string,
        projectId: string,
        userId: string,
        teamId: string,
    ): Promise<CancelJobResult> {

        // ── Atomic conditional update — only succeeds if state = PENDING ──────
        const [cancelled] = await db
            .update(jobs)
            .set({ state: "CANCELLED", updatedAt: new Date() })
            .where(and(
                eq(jobs.id, jobId),
                eq(jobs.projectId, projectId),
                eq(jobs.state, "PENDING"),
            ))
            .returning();

        if (cancelled) {
            await this.publishJobEvent({
                type: "JOB_CANCELLED",
                projectId,
                userId,
                teamId,
                metadata: buildJobEventMetadata(cancelled as Job),
            });
            return { success: true };
        }

        // ── Update did not match — determine why ──────────────────────────────
        const [existing] = await db
            .select({ state: jobs.state })
            .from(jobs)
            .where(and(eq(jobs.id, jobId), eq(jobs.projectId, projectId)))
            .limit(1);

        if (!existing) return { success: false, reason: "NOT_FOUND" };
        if (existing.state === "RUNNING") return { success: false, reason: "RUNNING" };
        // COMPLETED, FAILED, FATAL, CANCELLED
        return { success: false, reason: "ALREADY_TERMINAL" };
    }

    /**
     * Cancels all PENDING jobs associated with a specific workflow run.
     * Called by the pipeline service when it handles STOP_PIPELINE, ensuring
     * that agentic-workflow-owned jobs are cleaned up alongside the graph.
     *
     * RUNNING jobs are deliberately left alone — they have already been claimed
     * by a worker and will complete or fail on their own.
     *
     * @param workflowId  The workflow that is being stopped.
     * @param projectId   Scopes the update to avoid cross-project accidents.
     * @param userId      Forwarded to the JOB_CANCELLED events.
     * @param teamId      Forwarded to the JOB_CANCELLED events.
     */
    async cancelPendingJobsByWorkflow(
        workflowId: string,
        projectId: string,
        userId: string,
        teamId: string,
    ): Promise<void> {
        const cancelled = await db
            .update(jobs)
            .set({ state: "CANCELLED", updatedAt: new Date() })
            .where(and(
                eq(jobs.projectId, projectId),
                eq(jobs.workflowId, workflowId),
                eq(jobs.state, "PENDING"),
            ))
            .returning({
                id: jobs.id,
                type: jobs.type,
                workflowId: jobs.workflowId,
            });

        if (cancelled.length === 0) return;

        console.info(
            { workflowId, projectId, count: cancelled.length },
            `[JobControlPlane] Cancelled ${cancelled.length} PENDING job(s) for stopped workflow.`
        );

        // Publish individual events concurrently — each SSE client needs to
        // see every cancellation so its job list stays accurate.
        await Promise.all(cancelled.map((job) =>
            this.publishJobEvent({
                type: "JOB_CANCELLED",
                projectId,
                userId,
                teamId,
                metadata: {
                    jobId: job.id,
                    jobType: job.type as JobType,
                    workflowId: job.workflowId ?? undefined,
                },
            })
        ));
    }

    createIncrementAttemptHook = (initialJob: Job): IncrementAttemptHook => {
        let currentJob = initialJob;

        return async (error: string, strategy: RetryStrategy): Promise<Job> => {
            try {
                currentJob = await this.refreshJob(currentJob);

                const prev = currentJob.attempts;

                const updatedMetadata: AttemptMetadata = {
                    ...prev,
                    totalAttempts: prev.totalAttempts + 1,
                    lastAttemptAt: new Date(),
                    failureHistory: [
                        ...(prev.failureHistory || []),
                        {
                            attempt: prev.currentAttempt,
                            totalAttempts: prev.totalAttempts + 1,
                            error,
                            timestamp: new Date(),
                            strategy,
                        },
                    ],
                };

                const result = await this.updateJobSafe(
                    currentJob.id,
                    prev.currentAttempt,
                    { attempts: updatedMetadata } as any
                );

                currentJob = result;
                return result;
            } catch (err) {
                console.error({ jobId: currentJob.id, err }, `Increment hook failed safety checks`);
                throw err;
            }
        };
    };
}

// ─── Lightweight record returned by listActiveJobs ────────────────────────────
// Deliberately a plain type (not a Zod parse) — listActiveJobs is on the hot
// path for the cached REST endpoint and doesn't need full validation overhead.

export type ActiveJobRecord = {
    id: string;
    type: string;
    state: string;
    projectId: string;
    userId: string;
    teamId: string;
    workflowId: string | null;
    error: string;
    createdAt: Date;
    updatedAt: Date;
};