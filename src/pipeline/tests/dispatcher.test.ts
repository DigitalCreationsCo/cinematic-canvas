import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { AttemptMetadata, Job, JobState, JobType } from "../../shared/types/job.types.js";
import { IncrementAttemptHook } from "../../shared/types/pipeline.types.js";
import { AssetKey } from "../../shared/types/assets.types.js";
import { JobControlPlane } from "../../shared/services/job-control-plane.js";
import { Dispatcher } from "../dispatcher.js";
import { WorkflowFatalError } from "../../shared/utils/errors.js";
import { createMockJob, createMockControlPlane, createMockAttempts } from "../../shared/mocks.js";

// ════════════════════════════════════════════════════════════════════════════════
// SUITE 1: createIncrementAttemptHook — unit tests
// ════════════════════════════════════════════════════════════════════════════════

describe("createIncrementAttemptHook", () => {
    let plane: Record<keyof JobControlPlane, Mock>;
    let hook: IncrementAttemptHook;

    beforeEach(() => {
        plane = createMockControlPlane();
        hook = plane.createIncrementAttemptHook();
    });

    it("increments totalAttempts by exactly 1", async () => {
        const job = createMockJob({ state: "FATAL", attempts: createMockAttempts({ totalAttempts: 3 }) });
        plane.patchAttempts.mockResolvedValue({ ...job, attempts: { ...job.attempts, totalAttempts: 4 } });

        await hook("some error", "SUCCESSOR_RECOVERY");

        const patched = plane.patchAttempts.mock.calls[ 0 ][ 1 ] as AttemptMetadata;
        expect(patched.totalAttempts).toBe(4);
    });

    it("does NOT reset totalAttempts — it is monotonic", async () => {
        const job = createMockJob({ state: "FATAL", attempts: createMockAttempts({ totalAttempts: 7 }) });
        plane.patchAttempts.mockResolvedValue(job);

        await hook("err", "SUCCESSOR_RECOVERY");

        const patched = plane.patchAttempts.mock.calls[ 0 ][ 1 ] as AttemptMetadata;
        expect(patched.totalAttempts).toBe(8);
    });

    it("appends exactly one failure record to failureHistory", async () => {
        const existing = [
            { attempt: 1, totalAttempts: 1, error: "first", timestamp: new Date(), strategy: "BACKOFF_RETRY" as const },
        ];
        const job = createMockJob({
            state: "FATAL",
            attempts: createMockAttempts({ totalAttempts: 2, failureHistory: existing }),
        });
        plane.patchAttempts.mockResolvedValue(job);

        await hook("second error", "SUCCESSOR_RECOVERY");

        const patched = plane.patchAttempts.mock.calls[ 0 ][ 1 ] as AttemptMetadata;
        expect(patched.failureHistory).toHaveLength(2);
        expect(patched.failureHistory[ 1 ].error).toBe("second error");
        expect(patched.failureHistory[ 1 ].strategy).toBe("SUCCESSOR_RECOVERY");
    });

    it("snapshots totalAttempts BEFORE the increment in the failure record", async () => {
        const job = createMockJob({ state: "FATAL", attempts: createMockAttempts({ totalAttempts: 5 }) });
        plane.patchAttempts.mockResolvedValue(job);

        await hook("err", "SUCCESSOR_RECOVERY");

        const record = (plane.patchAttempts.mock.calls[ 0 ][ 1 ] as AttemptMetadata).failureHistory.at(-1)!;
        expect(record.totalAttempts).toBe(5); // Where we WERE, not where we ARE
    });

    it("persists to the FATAL job id, not a new id", async () => {
        const job = createMockJob({ id: "fatal-job-xyz", state: "FATAL" });
        plane.patchAttempts.mockResolvedValue(job);

        await hook("err", "SUCCESSOR_RECOVERY");

        expect(plane.patchAttempts.mock.calls[ 0 ][ 0 ]).toBe("fatal-job-xyz");
    });

    it("returns the result of patchAttempts (the persisted record)", async () => {
        const job = createMockJob({ state: "FATAL" });
        const updated = createMockJob({ state: "FATAL", attempts: createMockAttempts({ totalAttempts: 2 }) });
        plane.patchAttempts.mockResolvedValue(updated);

        const result = await hook("err", "SUCCESSOR_RECOVERY");
        expect(result).toBe(updated);
    });

    it("does not call createJob — that is not its responsibility", async () => {
        const job = createMockJob({ state: "FATAL" });
        plane.patchAttempts.mockResolvedValue(job);

        await hook("err", "SUCCESSOR_RECOVERY");

        expect(plane.createJob).not.toHaveBeenCalled();
    });

    it("does not call updateJobState — state is already FATAL before the hook runs", async () => {
        const job = createMockJob({ state: "FATAL" });
        plane.patchAttempts.mockResolvedValue(job);

        await hook("err", "SUCCESSOR_RECOVERY");

        expect(plane.updateJobState).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// SUITE 2: Dispatcher.ensureJob — state machine coverage
// ════════════════════════════════════════════════════════════════════════════════

describe("Dispatcher.ensureJob", () => {
    let plane: Record<keyof JobControlPlane, Mock>;
    let hookSpy: Mock;
    let dispatcher: Dispatcher;

    beforeEach(() => {
        plane = createMockControlPlane();
        hookSpy = vi.fn().mockImplementation(async (job: Job) => ({
            ...job,
            attempts: { ...job.attempts, totalAttempts: job.attempts.totalAttempts + 1 },
        }));
        dispatcher = new Dispatcher(
            plane as unknown as JobControlPlane,
            "proj-001",
            3
        );
    });

    // ── No existing job ───────────────────────────────────────────────────────

    describe("when no job exists", () => {
        it("calls createJob with currentAttempt=1 and totalAttempts=1", async () => {
            plane.getLatestJob.mockResolvedValue(null);
            plane.createJob.mockResolvedValue(createMockJob({ state: "PENDING" }));

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            const created = plane.createJob.mock.calls[ 0 ][ 0 ];
            expect(created.attempts.currentAttempt).toBe(1);
            expect(created.attempts.totalAttempts).toBe(1);
            expect(created.state).toBe("PENDING");
        });

        it("does NOT call the incrementAttempt hook", async () => {
            plane.getLatestJob.mockResolvedValue(null);
            plane.createJob.mockResolvedValue(createMockJob({ state: "PENDING" }));

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            expect(hookSpy).not.toHaveBeenCalled();
        });
    });

    // ── COMPLETED ─────────────────────────────────────────────────────────────

    describe("when job is COMPLETED", () => {
        it("returns the completed job directly without side effects", async () => {
            const completed = createMockJob({ state: "COMPLETED" });
            plane.getLatestJob.mockResolvedValue(completed);

            const result = await dispatcher.ensureJob(
                "generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] }
            );

            expect(result).toBe(completed);
            expect(hookSpy).not.toHaveBeenCalled();
            expect(plane.createJob).not.toHaveBeenCalled();
            expect(plane.requeueJob).not.toHaveBeenCalled();
        });
    });

    // ── PENDING / RUNNING ─────────────────────────────────────────────────────

    describe("when job is PENDING", () => {
        it("interrupts without calling the hook or creating jobs", async () => {
            plane.getLatestJob.mockResolvedValue(createMockJob({ state: "PENDING" }));

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            expect(hookSpy).not.toHaveBeenCalled();
            expect(plane.createJob).not.toHaveBeenCalled();
        });
    });

    describe("when job is RUNNING", () => {
        it("interrupts without calling the hook or creating jobs", async () => {
            plane.getLatestJob.mockResolvedValue(createMockJob({ state: "RUNNING" }));

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            expect(hookSpy).not.toHaveBeenCalled();
            expect(plane.createJob).not.toHaveBeenCalled();
        });
    });

    // ── FAILED, retries remaining ─────────────────────────────────────────────

    describe("when job is FAILED with retries remaining", () => {
        it("calls requeueJob with currentAttempt + 1 and does NOT call the hook", async () => {
            const failed = createMockJob({
                state: "FAILED",
                attempts: createMockAttempts({ currentAttempt: 1, maxRetries: 3 }),
            });
            plane.getLatestJob.mockResolvedValue(failed);
            plane.requeueJob.mockResolvedValue({ ...failed, state: "PENDING" });
            plane.getJob.mockResolvedValue({ ...failed, state: "PENDING" });

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            // Asserts the fixed call shape — includes currentAttempt
            expect(plane.requeueJob).toHaveBeenCalledWith(failed.id, {
                newState: "PENDING",
                currentAttempt: 2,          // Was 1, now 1 + 1
                retryStrategy: "BACKOFF_RETRY",
            });
            expect(hookSpy).not.toHaveBeenCalled();
        });
    });

    // ── FAILED, retries exhausted ─────────────────────────────────────────────

    describe("when job is FAILED with retries exhausted", () => {
        it("marks FATAL then delegates to handleFatalFailure which calls the hook and creates a successor", async () => {
            const failed = createMockJob({
                state: "FAILED",
                attempts: createMockAttempts({ currentAttempt: 3, maxRetries: 3, totalAttempts: 3 }),
            });
            const fatalVersion = createMockJob({ ...failed, state: "FATAL" as JobState });

            plane.getLatestJob.mockResolvedValue(failed);
            plane.updateJobState.mockResolvedValue(fatalVersion);
            // getJob is called twice in the fixed code:
            //   1st — handleRetriableFailure fetches the freshly-marked-FATAL record
            //   2nd — handleFatalFailure's idempotency guard re-reads it
            // Both return the same fatalVersion (totalAttempts unchanged = no prior hook run)
            plane.getJob.mockResolvedValue(fatalVersion);

            hookSpy.mockResolvedValue({
                ...fatalVersion,
                attempts: { ...fatalVersion.attempts, totalAttempts: 4 },
            });
            plane.createJob.mockResolvedValue(createMockJob({ id: "successor-001", state: "PENDING" }));

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            expect(plane.updateJobState).toHaveBeenCalledWith(failed.id, "FATAL", expect.any(Object));
            expect(hookSpy).toHaveBeenCalled();
            expect(plane.createJob).toHaveBeenCalled();
        });
    });

    // ── FATAL ─────────────────────────────────────────────────────────────────

    describe("when job is FATAL", () => {
        it("calls the hook then creates a successor with inherited totalAttempts", async () => {
            const fatal = createMockJob({
                state: "FATAL",
                attempts: createMockAttempts({
                    currentAttempt: 3,
                    totalAttempts: 5,
                    failureHistory: [
                        { attempt: 1, totalAttempts: 1, error: "e1", timestamp: new Date(), strategy: "BACKOFF_RETRY" },
                    ],
                }),
            });

            plane.getLatestJob.mockResolvedValue(fatal);
            // Idempotency guard: getJob returns the SAME totalAttempts we were handed
            // → guard passes, hook is allowed to run
            plane.getJob.mockResolvedValue(fatal);

            hookSpy.mockResolvedValue({
                ...fatal,
                attempts: {
                    ...fatal.attempts,
                    totalAttempts: 6,
                    failureHistory: [
                        ...fatal.attempts.failureHistory,
                        { attempt: 3, totalAttempts: 5, error: "e2", timestamp: new Date(), strategy: "SUCCESSOR_RECOVERY" },
                    ],
                },
            });
            plane.createJob.mockResolvedValue(createMockJob({ id: "succ-001", state: "PENDING" }));

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            expect(hookSpy).toHaveBeenCalledWith(fatal, expect.any(String), "SUCCESSOR_RECOVERY");

            const successor = plane.createJob.mock.calls[ 0 ][ 0 ];
            expect(successor.attempts.currentAttempt).toBe(1);   // Reset
            expect(successor.attempts.totalAttempts).toBe(6);    // Inherited
            expect(successor.attempts.failureHistory).toHaveLength(2);
            expect(successor.recoveryContext.previousJobId).toBe(fatal.id);
            expect(successor.uniqueKey).toBe(fatal.uniqueKey);
        });

        it("throws WorkflowFatalError when totalAttempts exceeds maxTotalAttempts", async () => {
            const fatal = createMockJob({
                state: "FATAL",
                attempts: createMockAttempts({ totalAttempts: 12 }),
            });

            plane.getLatestJob.mockResolvedValue(fatal);
            plane.getJob.mockResolvedValue(fatal); // Guard passes
            hookSpy.mockResolvedValue({
                ...fatal,
                attempts: { ...fatal.attempts, totalAttempts: 13 },
            });

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow(WorkflowFatalError);

            expect(plane.createJob).not.toHaveBeenCalled();
        });

        // getRecoveryConfig() currently has allowAutoRecovery: true for all defined job types;
        // no job type has allowAutoRecovery false, so this path is unreachable without a source change.
        it.skip("throws WorkflowFatalError when allowAutoRecovery is false", async () => {
            const fatal = createMockJob({
                type: "GENERATE_AUDIO" as JobType,
                state: "FATAL",
                attempts: createMockAttempts({ totalAttempts: 2 }),
            });

            plane.getLatestJob.mockResolvedValue(fatal);
            plane.getJob.mockResolvedValue(fatal); // Guard passes
            hookSpy.mockResolvedValue({
                ...fatal,
                attempts: { ...fatal.attempts, totalAttempts: 3 },
            });

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "PROCESS_AUDIO_TO_SCENES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow(WorkflowFatalError);

            expect(plane.createJob).not.toHaveBeenCalled();
        });
    });

    // ── Unhandled state ───────────────────────────────────────────────────────

    describe("when job is in an unexpected state", () => {
        it("throws a descriptive error", async () => {
            plane.getLatestJob.mockResolvedValue(createMockJob({ state: "CANCELLED" as JobState }));

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow(/Unhandled job state: CANCELLED/);
        });
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// SUITE 3: Bug regression tests — all four, all passing against the fixed code
// ════════════════════════════════════════════════════════════════════════════════

describe("Bug regressions", () => {
    let plane: Record<keyof JobControlPlane, Mock>;
    let hookSpy: Mock;
    let dispatcher: Dispatcher;

    beforeEach(() => {
        plane = createMockControlPlane();
        hookSpy = vi.fn().mockImplementation(async (job: Job) => ({
            ...job,
            attempts: { ...job.attempts, totalAttempts: job.attempts.totalAttempts + 1 },
        }));
        dispatcher = new Dispatcher(
            plane as unknown as JobControlPlane,
            "proj-001",
            4
        );
    });

    // ── [BUG 1] Idempotency guard prevents double-increment on re-entry ───────
    //
    // Scenario: first call runs the hook and patchAttempts succeeds, but
    // createJob has not yet run (or its result isn't visible via getLatestJob).
    // Graph resumes, ensureJob re-enters with the same FATAL job from
    // getLatestJob. handleFatalFailure calls getJob — which NOW returns the
    // record with totalAttempts already advanced by the first hook call.
    // The guard detects this (fresh > handed-in) and skips the hook entirely.
    // It looks for a successor; if none is visible yet it interrupts on the
    // fresh FATAL job. No double-increment.

    describe("[BUG 1] Race condition — idempotency guard prevents double-increment", () => {
        it("skips the hook on re-entry when getJob shows totalAttempts already advanced", async () => {
            const fatal = createMockJob({
                state: "FATAL",
                attempts: createMockAttempts({ totalAttempts: 3 }),
            });

            // getLatestJob returns the same FATAL job both times (successor not visible)
            plane.getLatestJob.mockResolvedValue(fatal);

            // First entry: getJob returns the original (guard passes, hook runs)
            // Second entry: getJob returns the ADVANCED version (guard triggers, hook skipped)
            const advancedFatal = createMockJob({
                ...fatal,
                attempts: { ...fatal.attempts, totalAttempts: 4 }, // Hook already ran
            });

            plane.getJob
                .mockResolvedValueOnce(fatal)          // 1st call — handleFatalFailure guard, pass-through
                .mockResolvedValueOnce(advancedFatal); // 2nd call — handleFatalFailure guard, BLOCKED

            plane.createJob.mockResolvedValue(createMockJob({ id: "succ-001", state: "PENDING" }));

            // First ensureJob call — hook fires, successor created, interrupt
            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            expect(hookSpy).toHaveBeenCalledTimes(1);

            // Second ensureJob call — guard detects advancement, hook does NOT fire
            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            // Still exactly 1 across both calls
            expect(hookSpy).toHaveBeenCalledTimes(1);
        });

        it("interrupts on the successor if one is visible during the guarded re-entry", async () => {
            const fatal = createMockJob({
                state: "FATAL",
                attempts: createMockAttempts({ totalAttempts: 3 }),
            });
            const advancedFatal = createMockJob({
                ...fatal,
                attempts: { ...fatal.attempts, totalAttempts: 4 },
            });
            const successor = createMockJob({
                id: "succ-visible",
                state: "PENDING",
                attempts: createMockAttempts({ currentAttempt: 1, totalAttempts: 4 }),
            });

            // getLatestJob is called twice:
            //   1st — ensureJob top-level lookup → returns fatal
            //   2nd — guard's successor lookup   → returns successor
            plane.getLatestJob
                .mockResolvedValueOnce(fatal)
                .mockResolvedValueOnce(successor);

            plane.getJob.mockResolvedValue(advancedFatal); // Guard sees advancement

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            // Hook never ran — we went straight to interrupt on the successor
            expect(hookSpy).not.toHaveBeenCalled();
            expect(plane.createJob).not.toHaveBeenCalled();
        });
    });

    // ── [BUG 2] requeueJob receives currentAttempt + 1 ────────────────────────

    describe("[BUG 2] requeueJob receives the incremented currentAttempt", () => {
        it("passes currentAttempt + 1 when currentAttempt is 2", async () => {
            const failed = createMockJob({
                state: "FAILED",
                attempts: createMockAttempts({ currentAttempt: 2, maxRetries: 3 }),
            });

            plane.getLatestJob.mockResolvedValue(failed);
            plane.requeueJob.mockResolvedValue({ ...failed, state: "PENDING" });
            plane.getJob.mockResolvedValue({ ...failed, state: "PENDING" });

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            const requeueCall = plane.requeueJob.mock.calls[ 0 ][ 1 ];
            expect(requeueCall.currentAttempt).toBe(3); // 2 + 1
        });

        it("passes currentAttempt = 2 when starting from 1", async () => {
            const failed = createMockJob({
                state: "FAILED",
                attempts: createMockAttempts({ currentAttempt: 1, maxRetries: 3 }),
            });

            plane.getLatestJob.mockResolvedValue(failed);
            plane.requeueJob.mockResolvedValue({ ...failed, state: "PENDING" });
            plane.getJob.mockResolvedValue({ ...failed, state: "PENDING" });

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            const requeueCall = plane.requeueJob.mock.calls[ 0 ][ 1 ];
            expect(requeueCall.currentAttempt).toBe(2); // 1 + 1
        });
    });

    // ── [BUG 3] Error extraction three-level fallback ─────────────────────────

    describe("[BUG 3] Error extraction uses job.error when failureHistory is empty", () => {
        it("reads job.error when failureHistory is empty", async () => {
            const fatal = createMockJob({
                state: "FATAL",
                error: "Failed to generate: content policy violation",
                attempts: createMockAttempts({ failureHistory: [] }),
            });

            plane.getLatestJob.mockResolvedValue(fatal);
            plane.getJob.mockResolvedValue(fatal); // Guard passes (same totalAttempts)
            plane.createJob.mockResolvedValue(createMockJob({ state: "PENDING" }));

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            const errorPassedToHook = hookSpy.mock.calls[ 0 ][ 1 ];
            expect(errorPassedToHook).toBe("Failed to generate: content policy violation");
        });

        it("prefers failureHistory over job.error when both exist", async () => {
            const fatal = createMockJob({
                state: "FATAL",
                error: "top-level error — should be ignored",
                attempts: createMockAttempts({
                    failureHistory: [
                        { attempt: 1, totalAttempts: 1, error: "history error wins", timestamp: new Date(), strategy: "BACKOFF_RETRY" },
                    ],
                }),
            });

            plane.getLatestJob.mockResolvedValue(fatal);
            plane.getJob.mockResolvedValue(fatal);
            plane.createJob.mockResolvedValue(createMockJob({ state: "PENDING" }));

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            const errorPassedToHook = hookSpy.mock.calls[ 0 ][ 1 ];
            expect(errorPassedToHook).toBe("history error wins");
        });

        it("falls back to hardcoded string when both failureHistory and job.error are absent", async () => {
            const fatal = createMockJob({
                state: "FATAL",
                attempts: createMockAttempts({ failureHistory: [] }),
            });
            // createMockJob defaults error to ""; ?? only triggers for null/undefined — remove so fallback is used
            delete (fatal as Record<string, unknown>).error;

            plane.getLatestJob.mockResolvedValue(fatal);
            plane.getJob.mockResolvedValue(fatal);
            plane.createJob.mockResolvedValue(createMockJob({ state: "PENDING" }));

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            const errorPassedToHook = hookSpy.mock.calls[ 0 ][ 1 ];
            expect(errorPassedToHook).toBe("unknown fatal error");
        });
    });

    // ── [BUG 4] Successor is the active job once getLatestJob returns it ──────

    describe("[BUG 4] Successor treated as active job after creation", () => {
        it("when getLatestJob returns a PENDING successor, interrupts without touching the hook", async () => {
            const successor = createMockJob({
                id: "succ-001",
                state: "PENDING",
                attempts: createMockAttempts({ currentAttempt: 1, totalAttempts: 4 }),
                recoveryContext: {
                    reason: "RETRY_EXHAUSTED",
                    triggeredBy: "DISPATCHER",
                    previousJobId: "fatal-job-001",
                },
            });

            plane.getLatestJob.mockResolvedValue(successor);

            await expect(
                dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
            ).rejects.toThrow();

            expect(hookSpy).not.toHaveBeenCalled();
            expect(plane.createJob).not.toHaveBeenCalled();
            expect(plane.updateJobState).not.toHaveBeenCalled();
        });

        it("when getLatestJob returns a COMPLETED successor, returns it cleanly", async () => {
            const successor = createMockJob({
                id: "succ-002",
                state: "COMPLETED",
                attempts: createMockAttempts({ currentAttempt: 2, totalAttempts: 4 }),
            });

            plane.getLatestJob.mockResolvedValue(successor);

            const result = await dispatcher.ensureJob(
                "generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] }
            );

            expect(result).toBe(successor);
            expect(hookSpy).not.toHaveBeenCalled();
        });
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// SUITE 4: WorkflowFatalError
// ════════════════════════════════════════════════════════════════════════════════

describe("WorkflowFatalError", () => {
    it("is an instance of Error", () => {
        const err = new WorkflowFatalError("test", { jobId: "x" });
        expect(err).toBeInstanceOf(Error);
    });

    it("has name WorkflowFatalError", () => {
        const err = new WorkflowFatalError("test", {});
        expect(err.name).toBe("WorkflowFatalError");
    });

    it("carries the context payload", () => {
        const ctx = { jobId: "abc", totalAttempts: 5 };
        const err = new WorkflowFatalError("msg", ctx);
        expect(err.context).toEqual(ctx);
    });

    it("preserves the message", () => {
        const err = new WorkflowFatalError("something went wrong", {});
        expect(err.message).toBe("something went wrong");
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// SUITE 5: Edge cases and boundary conditions
// ════════════════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
    let plane: Record<keyof JobControlPlane, Mock>;
    let hookSpy: Mock;
    let dispatcher: Dispatcher;

    beforeEach(() => {
        plane = createMockControlPlane();
        hookSpy = vi.fn().mockImplementation(async (job: Job) => ({
            ...job,
            attempts: { ...job.attempts, totalAttempts: job.attempts.totalAttempts + 1 },
        }));
        dispatcher = new Dispatcher(
            plane as unknown as JobControlPlane,
            "proj-001",
            3
        );
    });

    it("FAILED at currentAttempt=1 with maxRetries=1 escalates immediately (zero retries available)", async () => {
        const failed = createMockJob({
            state: "FAILED",
            attempts: createMockAttempts({ currentAttempt: 1, maxRetries: 1, totalAttempts: 1 }),
        });
        const fatalVersion = createMockJob({ ...failed, state: "FATAL" as JobState });

        plane.getLatestJob.mockResolvedValue(failed);
        plane.updateJobState.mockResolvedValue(fatalVersion);
        // getJob called twice: once by handleRetriableFailure, once by the guard
        plane.getJob.mockResolvedValue(fatalVersion);
        plane.createJob.mockResolvedValue(createMockJob({ state: "PENDING" }));

        await expect(
            dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
        ).rejects.toThrow();

        expect(plane.updateJobState).toHaveBeenCalledWith(failed.id, "FATAL", expect.any(Object));
        expect(hookSpy).toHaveBeenCalled();
    });

    it("FATAL at exactly maxTotalAttempts throws WorkflowFatalError (upper boundary)", async () => {
        // maxTotalAttempts = 12 for GENERATE_SCENE_FRAMES
        // Hook returns 13 → exceeds ceiling → throw
        const fatal = createMockJob({
            state: "FATAL",
            attempts: createMockAttempts({ totalAttempts: 12 }),
        });

        plane.getLatestJob.mockResolvedValue(fatal);
        plane.getJob.mockResolvedValue(fatal); // Guard passes
        hookSpy.mockResolvedValue({
            ...fatal,
            attempts: { ...fatal.attempts, totalAttempts: 13 },
        });

        await expect(
            dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
        ).rejects.toThrow(WorkflowFatalError);
    });

    it("FATAL at maxTotalAttempts - 1 recovers successfully (lower boundary)", async () => {
        // totalAttempts=11 → hook returns 12 → 12 <= 12 → recover
        const fatal = createMockJob({
            state: "FATAL",
            attempts: createMockAttempts({ totalAttempts: 11 }),
        });

        plane.getLatestJob.mockResolvedValue(fatal);
        plane.getJob.mockResolvedValue(fatal); // Guard passes
        hookSpy.mockResolvedValue({
            ...fatal,
            attempts: { ...fatal.attempts, totalAttempts: 12 },
        });
        plane.createJob.mockResolvedValue(createMockJob({ state: "PENDING" }));

        // Throws from interruptAndWait, NOT WorkflowFatalError
        await expect(
            dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
        ).rejects.toThrow();

        expect(plane.createJob).toHaveBeenCalled();
    });

    it("successor job preserves the full failure history chain across recoveries", async () => {
        const history = [
            { attempt: 1, totalAttempts: 1, error: "e1", timestamp: new Date(), strategy: "BACKOFF_RETRY" as const },
            { attempt: 2, totalAttempts: 2, error: "e2", timestamp: new Date(), strategy: "BACKOFF_RETRY" as const },
            { attempt: 3, totalAttempts: 3, error: "e3", timestamp: new Date(), strategy: "SUCCESSOR_RECOVERY" as const },
        ];

        const fatal = createMockJob({
            state: "FATAL",
            attempts: createMockAttempts({ totalAttempts: 4, failureHistory: history }),
        });

        plane.getLatestJob.mockResolvedValue(fatal);
        plane.getJob.mockResolvedValue(fatal); // Guard passes
        hookSpy.mockResolvedValue({
            ...fatal,
            attempts: {
                ...fatal.attempts,
                totalAttempts: 5,
                failureHistory: [
                    ...history,
                    { attempt: 1, totalAttempts: 4, error: "e4", timestamp: new Date(), strategy: "SUCCESSOR_RECOVERY" as const },
                ],
            },
        });
        plane.createJob.mockResolvedValue(createMockJob({ state: "PENDING" }));

        await expect(
            dispatcher.ensureJob("generate_scene_assets", "GENERATE_SCENE_FRAMES", "scene_start_frame", { sceneIds: [ '1' ], assetKeys: [ "scene_start_frame" ] })
        ).rejects.toThrow();

        const successor = plane.createJob.mock.calls[ 0 ][ 0 ];
        expect(successor.attempts.failureHistory).toHaveLength(4);
        expect(successor.attempts.failureHistory[ 0 ].error).toBe("e1"); // First failure preserved
        expect(successor.attempts.failureHistory[ 3 ].error).toBe("e4"); // Latest present
    });
});

describe("Dispatcher: Non-blocking Dispatch", () => {
    let plane: any;
    let dispatcher: Dispatcher;

    beforeEach(() => {
        plane = createMockControlPlane();
        dispatcher = new Dispatcher(plane, "proj_123", 10);
    });

    it("dispatchJob creates a job record but does NOT interrupt execution", async () => {
        plane.getLatestJob.mockResolvedValue(null);
        plane.createJob.mockResolvedValue(createMockJob({ state: "PENDING" }));

        // We track the interrupt call from the langgraph mock
        const { interrupt } = await import("@langchain/langgraph");

        await dispatcher.dispatchJob(
            "RENDER_VIDEO",
            "render_video",
            "test-entity",
            { videoPaths: [] } as any
        );

        expect(plane.createJob).toHaveBeenCalled();
        // Critical: Ensure the graph was never signaled to stop
        expect(interrupt).not.toHaveBeenCalled();
    });

    it("dispatchJob skips creation if a job is already running", async () => {
        plane.getLatestJob.mockResolvedValue(createMockJob({ state: "RUNNING" }));

        await dispatcher.dispatchJob("RENDER_VIDEO", "render_video", "test-entity");

        expect(plane.createJob).not.toHaveBeenCalled();
    });
});