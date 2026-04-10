import { PoolManager } from "./pool-manager.js";
import { db, schema } from "../db/index.js";
import { eq, and, sql, desc, count, isNull } from "drizzle-orm";
import { createHash } from 'crypto';
import { Job, InsertJob, JobState, JobEvent, JobType, RetryStrategy, AttemptMetadata, AnyJob } from "../types/job.types.js";
import { IncrementAttemptHook, } from "../types/pipeline.types.js";
import { jobs } from "../db/schema.js";
import { reviveDates } from "../utils/utils.js";
import { z } from "zod";
import { AssetKey } from "../types/assets.types.js";



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

    /**
     * Maps a UUID string to a signed 32-bit integer for Postgres advisory locking.
     * @param input - The UUID or string to hash.
     * @returns A 32-bit integer.
     * Risk: MD5 hashes to 128-bit; forcing it into 32-bit (Int32Array) has a non-negligible collision risk in a high-scale system.
     * Improvement: Use pg_advisory_xact_lock(bigint) (64-bit) instead. Use hashTo64BitInt function and a single 64-bit key to reduce the collision space by $2^{32}$.
     */
    private hashTo32BitInt(input: string): number {
        const hash = createHash('md5').update(input).digest('hex');
        return Int32Array.from([parseInt(hash.substring(0, 8), 16)])[0];
    }

    /**
     * Converts a UUID (or any string) into a 64-bit BigInt for Postgres Advisory Locks.
     * Postgres requires a signed 64-bit integer.
     */
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
            jobId: job.id,
            projectId: job.projectId,
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

    /**
   * Returns the most-recently-created job matching (projectId, jobType, uniqueKey). 
   * ORDERING CONTRACT — the dispatcher depends on this:
   *   When multiple job records share the same uniqueKey (e.g. a FATAL job
   *   and its successor), this method MUST return the one with the highest
   *   createdAt. Implement as: ORDER BY created_at DESC LIMIT 1.
   *   If this contract is violated, successor jobs are invisible and the
   *   graph will re-enter the FATAL recovery path indefinitely.
   */
    async getLatestJob(projectId: string, type: JobType, uniqueKey?: string) {
        const conditions = [
            eq(jobs.projectId, projectId),
            eq(jobs.type, type)
        ];

        if (uniqueKey) {
            conditions.push(eq(jobs.uniqueKey, uniqueKey));
        } else {
            // For singleton jobs, ensure we aren't matching a batch job
            conditions.push(sql`${jobs.uniqueKey} IS NULL`);
        }

        const [row] = await db.select()
            .from(jobs)
            .where(and(...conditions))
            .orderBy(desc(jobs.createdAt)) // Matches optimized composite index
            .limit(1);

        if (!row) return null;
        if (row.result) {
            row.result = reviveDates(row.result);
        }

        return Job.parse(row);
    }

    /**
     * Synchronizes a local job object with the current state in the database.
     * Used to prevent stale data in long-running threads.
     */
    async refreshJob(job: Job): Promise<Job> {
        const latest = await this.getLatestJob(
            job.projectId,
            job.type,
            job.uniqueKey ?? undefined
        );

        if (!latest) {
            throw new Error(`JobConsistencyError: Job ${job.id} no longer exists or has been purged.`);
        }

        // Technical Excellence: Log if we detect a state drift during refresh
        if (latest.state === 'CANCELLED' || latest.state === 'FAILED') {
            console.warn({ jobId: job.id, newState: latest.state }, `Job is ${latest.state}. Data may be stale`);
        }

        return latest;
    }


    /**
     * Claims a job when only the jobId is known. 
     * @param jobId - Unique ID of the job to claim.
     * @returns A tuple of [Job, string (ISO timestamp)] or null.
     */
    async claimJob(jobId: string): Promise<[AnyJob, string] | null> {

        return await db.transaction(async (tx) => {

            const jobKey = this.hashTo64BitInt(jobId);

            // Acquire advisory lock and fetch job in one query
            const lockResult = await tx.execute(
                sql`SELECT pg_try_advisory_xact_lock(${jobKey}) as locked`
            );

            if (!lockResult.rows[0]?.locked) return null;

            // Fetch job and check concurrent jobs in parallel
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

            // Claim the job
            const claimTime = new Date();

            const [claimedJob] = await tx
                .update(jobs)
                .set({
                    state: "RUNNING",
                    updatedAt: claimTime
                })
                .where(and(eq(jobs.id, jobId), eq(jobs.state, "PENDING")))
                .returning();

            if (!claimedJob) return null;

            const revivedJob = reviveDates(claimedJob);

            return [revivedJob as AnyJob, claimTime.toISOString()];
        });
    }

    /**
     * Resets a job to CREATED state and dispatches a notification.
     * Includes audit logging to track whether this was a recovery or a retry.
     * * @param jobId - The ID of the job to requeue.
     * @param currentAttempt - The current attempt for optimistic locking.
     * @param context - The monitor context (e.g., 'STALE_RECOVERY' or 'BACKOFF_RETRY').
     */
    async requeueJob(jobId: string, params: { newState: JobState; currentAttempt: number; retryStrategy: RetryStrategy; }): Promise<void> {
        try {
            const auditLog = ` [Monitor] Action: ${params.retryStrategy} at ${new Date().toISOString()}`;

            const result = await this.updateJobSafeAndIncrementAttempt(jobId, params.currentAttempt, {
                state: params.newState,
                error: sql<string>`COALESCE(${jobs.error}, '') || ${auditLog}` as any,
            });

            if (result) {
                await this.publishJobEvent({
                    type: "JOB_DISPATCHED",
                    jobId: result.id,
                    projectId: result.projectId,
                });
                console.log({ functionName: this.requeueJob.name, auditLog: auditLog.trim(), job: result }, `Requeued with new attempt`);
            } else {
                console.warn({ functionName: this.requeueJob.name, auditLog: auditLog.trim(), job: result }, `Race condition avoided: Job already updated by worker.`);
            }
        } catch (error) {
            console.error({ functionName: this.requeueJob.name, error: error }, `Failed to requeue job`);
        }
    }

    async updateJobState(jobId: string, state: JobState, meta?: Record<string, any>, error?: string) {

        const jsonSafeResult = meta
            ? JSON.parse(JSON.stringify(meta))
            : null;
        const [updatedJob] = await db.update(jobs)
            .set({
                state: state,
                result: jsonSafeResult, // Pass the object directly for jsonb
                error: error,
                updatedAt: new Date(),
            })
            .where(eq(jobs.id, jobId))
            .returning();
        console.log({ jobId, state, meta }, `Updated job`);

        return Job.parse(updatedJob);
    }

    /**
     * Updates job data using an Optimistic Locking pattern via the 'attempt' column.
     * Ensures that a worker cannot overwrite a job that has been retried or cancelled elsewhere.
     * * @param jobId - ID of the job to update.
     * @param currentAttempt - The version (attempt count) the worker expects to update.
     * @param updates - Partial job data to apply.
     * @throws {Error} If the job attempt has changed, indicating a concurrent modification.
     * @returns The updated Job.
     */
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

    /**
     * Updates job data using an Optimistic Locking pattern via the 'attempt' column.
     * Ensures that a worker cannot overwrite a job that has been retried or cancelled elsewhere.
     * * @param jobId - ID of the job to update.
     * @param currentAttempt - The version (attempt count) the worker expects to update.
     * @param updates - Partial job data to apply.
     * @throws {Error} If the job attempt has changed, indicating a concurrent modification.
     * @returns The updated Job.
     */
    async updateJobSafeAndIncrementAttempt(
        jobId: string,
        currentAttempt: number,
        updates?: Partial<typeof jobs.$inferInsert>
    ) {
        // Remove 'attempt' from updates if it was passed in to prevent double-increment
        const { attempts, ...rest } = updates || {};

        // Reacquire advisory lock before critical update to prevent race conditions
        return await db.transaction(async (tx) => {
            const jobKey = this.hashTo64BitInt(jobId);

            // Acquire advisory lock for this update operation
            const lockResult = await tx.execute(
                sql`SELECT pg_try_advisory_xact_lock(${jobKey}) as locked`
            );

            if (!lockResult.rows[0]?.locked) {
                console.warn({ functionName: this.updateJobSafeAndIncrementAttempt.name, jobId, currentAttempt }, `LockError: Failed to acquire advisory lock for job update. Job may be updated by another process.`);
                throw Error(`Failed to acquire lock for job ${jobId}`);
            }

            // Perform the update within the locked transaction
            const [currentJob] = await tx.select({ attempts: jobs.attempts })
                .from(jobs)
                .where(eq(jobs.id, jobId));

            if (!currentJob) {
                console.warn({ functionName: this.updateJobSafeAndIncrementAttempt.name, jobId, currentAttempt }, `LockError: Job ${jobId} not found or purged.`);
                throw Error(`Job ${jobId} not found`);
            }

            const attempts = AttemptMetadata.parse(currentJob.attempts);

            if (attempts.currentAttempt !== currentAttempt) {
                console.warn({ functionName: this.updateJobSafeAndIncrementAttempt.name, jobId, currentAttempt, actual: attempts.currentAttempt }, `LockError: Optimistic lock failed.`);
                throw Error(`Optimistic lock failed for job ${jobId}`);
            }

            const newAttempts = {
                ...attempts,
                currentAttempt: attempts.currentAttempt + 1,
                totalAttempts: attempts.totalAttempts + 1
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

    async cancelJob(jobId: string, projectId: string): Promise<void> {
        await this.updateJobState(jobId, "CANCELLED");
        await this.publishJobEvent({ type: "JOB_CANCELLED", projectId, jobId });
    }

    createIncrementAttemptHook = (initialJob: Job): IncrementAttemptHook => {
        let currentJob = initialJob;

        return async (error: string, strategy: RetryStrategy): Promise<Job> => {
            try {
                // 1. Sync with DB to get the latest attempt counts and state
                currentJob = await this.refreshJob(currentJob);

                const prev = currentJob.attempts;

                // 2. Prepare the payload
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

                // 3. Atomically update and return
                // We use the 'currentAttempt' in the WHERE clause as an optimistic lock
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
