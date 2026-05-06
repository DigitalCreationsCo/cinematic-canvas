import { createBuilder } from "#shared/mocks/mock-db.js";
import { createMockJob } from "#shared/mocks/mock-jobs.js";

import { JobControlPlane } from "#shared/services/job-control-plane.js";
import { PoolManager } from "#shared/services/pool-manager.js";
import { Job, JobType } from "#shared/types/job.types.js";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "#shared/db/index.ts";

describe("JobControlPlane", () => {
  let jobControlPlane: JobControlPlane;
  let mockPoolManager: Partial<PoolManager>;
  let mockPublishJobEvent: ReturnType<typeof vi.fn>;

  const baseJobMock = createMockJob({
    type: "ENHANCE_STORYBOARD",
    state: "PENDING",
    payload: { foo: "bar" },
    result: null,
    attempts: { currentAttempt: 0, totalAttempts: 0, failureHistory: [] },
    maxRetries: 3,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockPoolManager = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    mockPublishJobEvent = vi.fn().mockResolvedValue(undefined);
    jobControlPlane = new JobControlPlane(mockPoolManager as PoolManager, mockPublishJobEvent);
    process.env.MAX_CONCURRENT_JOBS_PER_WORKFLOW = "5";
  });

  afterEach(() => {
    delete process.env.MAX_CONCURRENT_JOBS_PER_WORKFLOW;
  });

  // ─── Core Operations ─────────────────────────────────────────────────────

  describe.runIf(process.env.CI === "true")("createJob", () => {
    it("should create a job and publish an event with metadata", async () => {
      vi.mocked(db.insert).mockReturnValue(createBuilder([baseJobMock]) as any);

      const jobData = createMockJob({
        payload: { foo: "bar" },
        maxRetries: 3,
      });

      const result = await jobControlPlane.createJob(jobData);

      expect(result.id).toBe("test-job-id");
      expect(mockPublishJobEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "JOB_DISPATCHED",
          metadata: expect.objectContaining({
            jobId: "test-job-id",
            jobType: "DATA_SYNC",
          }),
        }),
      );
    });
  });

  describe.runIf(process.env.CI === "true")("Queries (getJob, getLatestJob, listJobs, listActiveJobs)", () => {
    it("getJob should return a job if found", async () => {
      vi.mocked(db.select).mockReturnValue(createBuilder([baseJobMock]));
      const job = await jobControlPlane.getJob("test-job-id");
      expect(job?.id).toBe("test-job-id");
    });

    it("getJob should return null if not found", async () => {
      vi.mocked(db.select).mockReturnValue(createBuilder([]));
      const job = await jobControlPlane.getJob("nonexistent");
      expect(job).toBeNull();
    });

    it("getLatestJob should return the latest job for a project and type", async () => {
      vi.mocked(db.select).mockReturnValue(createBuilder([baseJobMock]));
      const job = await jobControlPlane.getLatestJob("test-project", "DATA_SYNC");
      expect(job?.id).toBe("test-job-id");
    });

    it("listJobs should list all jobs for project", async () => {
      vi.mocked(db.select).mockReturnValue(createBuilder([baseJobMock, baseJobMock]));
      const jobs = await jobControlPlane.listJobs("test-project");
      expect(jobs.length).toBe(2);
    });

    it("listActiveJobs should return lightweight non-terminal job records", async () => {
      const activeJobRecord = {
        id: "active-job-1",
        type: "DATA_SYNC",
        state: "RUNNING",
        projectId: "test-project",
        userId: "user-1",
        teamId: "team-1",
        workflowId: null,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(db.select).mockReturnValue(createBuilder([activeJobRecord]));

      const jobs = await jobControlPlane.listActiveJobs("test-project");
      expect(jobs.length).toBe(1);
      expect(jobs[0].state).toBe("RUNNING");
    });
  });

  describe("updateJobState", () => {
    it("should update job state and result payload", async () => {
      vi.mocked(db.update).mockReturnValue(createBuilder([{ ...baseJobMock, state: "COMPLETED" }]));

      await jobControlPlane.updateJobState("test-job-id", "COMPLETED", { resultData: true }, "No Error");
      expect(vi.mocked(db.update)).toHaveBeenCalled();
    });
  });

  describe("cancelJob", () => {
    it("should cancel PENDING job and publish event returning success: true", async () => {
      vi.mocked(db.update).mockReturnValue(createBuilder([{ ...baseJobMock, state: "CANCELLED" }]));

      const result = await jobControlPlane.cancelJob("test-job-id", "test-project", "user", "team");
      expect(result).toEqual({ success: true });
      expect(mockPublishJobEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "JOB_CANCELLED",
        }),
      );
    });

    it("should return NOT_FOUND if job does not exist", async () => {
      vi.mocked(db.update).mockReturnValue(createBuilder([]));
      vi.mocked(db.select).mockReturnValue(createBuilder([]));

      const result = await jobControlPlane.cancelJob("missing-id", "test-project", "user", "team");
      expect(result).toEqual({ success: false, reason: "NOT_FOUND" });
    });

    it("should return RUNNING if job is currently claimed by worker", async () => {
      vi.mocked(db.update).mockReturnValue(createBuilder([]));
      vi.mocked(db.select).mockReturnValue(createBuilder([{ state: "RUNNING" }]));

      const result = await jobControlPlane.cancelJob("test-job-id", "test-project", "user", "team");
      expect(result).toEqual({ success: false, reason: "RUNNING" });
    });
  });

  describe("cancelPendingJobsByWorkflow", () => {
    it("should cancel all pending jobs for workflow and publish events", async () => {
      vi.mocked(db.update).mockReturnValue(
        createBuilder([
          { id: "job-1", type: "DATA_SYNC" as JobType, workflowId: "wf-1" },
          { id: "job-2", type: "DATA_SYNC" as JobType, workflowId: "wf-1" },
        ]),
      );

      await jobControlPlane.cancelPendingJobsByWorkflow("wf-1", "test-project", "user", "team");
      expect(mockPublishJobEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe("uniqueKey", () => {
    it("should generate uniqueKey correctly", () => {
      const key = jobControlPlane.uniqueKey("proj", "suffix");
      expect(key).toBe("proj-suffix");
    });
  });

  // ─── Safety Patterns & Advisory Locks ────────────────────────────────────

  describe("Safety Patterns & Hooks", () => {
    it("refreshJob should throw if job is missing", async () => {
      vi.spyOn(jobControlPlane, "getLatestJob").mockResolvedValue(null);
      await expect(jobControlPlane.refreshJob(baseJobMock as Job)).rejects.toThrow("JobConsistencyError");
    });

    it("hook should prevent updates if currentAttempt has drifted (Optimistic Locking)", async () => {
      const hook = jobControlPlane.createIncrementAttemptHook(baseJobMock as Job);

      const dbVersion = { ...baseJobMock, attempts: { ...baseJobMock.attempts, currentAttempt: 2 } };
      vi.spyOn(jobControlPlane, "getLatestJob").mockResolvedValue(dbVersion as Job);

      vi.spyOn(jobControlPlane, "updateJobSafe").mockRejectedValue(new Error("OptimisticLockError"));

      await expect(hook("error", "STALE_RECOVERY")).rejects.toThrow("OptimisticLockError");
    });

    it("hook should successfully increment when state is consistent", async () => {
      vi.spyOn(jobControlPlane, "getLatestJob").mockResolvedValue(baseJobMock as Job);
      vi.spyOn(jobControlPlane, "updateJobSafe").mockImplementation(
        async (id, ver, up) => ({ ...baseJobMock, ...up }) as any,
      );

      const hook = jobControlPlane.createIncrementAttemptHook(baseJobMock as Job);
      const result = await hook("timeout", "BACKOFF_RETRY");

      expect(result!.attempts.totalAttempts).toBe(1);
      expect(result!.attempts.failureHistory[0].error).toBe("timeout");
    });
  });

  describe.runIf(process.env.CI === "true")("Advisory Lock Reacquisition (updateJobSafeAndIncrementAttempt)", () => {
    it("should successfully update job when advisory lock is acquired", async () => {
      const mockJob = createMockJob({
        attempts: { currentAttempt: 1, totalAttempts: 1 },
      });
      await vi.mocked(db.transaction)(async (tx: any) => {
        tx.execute.mockResolvedValue({ rows: [{ locked: true }] });
        tx.select.mockReturnValue(createBuilder([mockJob]));
      });

      const result = await jobControlPlane.updateJobSafeAndIncrementAttempt(mockJob.id, 1, { state: "COMPLETED" });

      expect(vi.mocked(db.transaction)).toHaveBeenCalled();
      expect(result.id).toEqual("test-job-id");
    });

    it("should throw error when advisory lock cannot be acquired", async () => {
      await db.transaction((tx: any) => {
        return vi.mocked(tx.execute).mockResolvedValue({ rows: [{ locked: false }] });
      });

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(
        jobControlPlane.updateJobSafeAndIncrementAttempt("test-job-id", 1, { state: "COMPLETED" }),
      ).rejects.toThrow("Failed to acquire lock for job test-job-id");

      consoleSpy.mockRestore();
    });

    it("should throw error when optimistic lock fails (currentAttempt mismatch)", async () => {
      await vi.mocked(db.transaction)(async (tx: any) => {
        tx.execute.mockResolvedValue({ rows: [{ locked: true }] });
        tx.select.mockReturnValue(createBuilder([{ attempts: { currentAttempt: 99 } }]));
      });

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(jobControlPlane.updateJobSafeAndIncrementAttempt("test-job-id", 1, {})).rejects.toThrow(
        "Optimistic lock failed for job test-job-id",
      );

      consoleSpy.mockRestore();
    });
  });

  // ─── Stress & Concurrency ────────────────────────────────────────────────

  describe("Stress & Concurrency", () => {
    it("should handle rapid sequential increments without state drift", async () => {
      let dbState = { ...baseJobMock } as Job;

      vi.spyOn(jobControlPlane, "getLatestJob").mockImplementation(async () => dbState);
      vi.spyOn(jobControlPlane, "updateJobSafe").mockImplementation(async (id, ver, updates) => {
        dbState = { ...dbState, ...updates } as any;
        return dbState;
      });

      const increment = jobControlPlane.createIncrementAttemptHook(dbState);

      for (let i = 0; i < 5; i++) {
        await increment(`Error ${i}`, "BACKOFF_RETRY");
      }

      expect(dbState.attempts.totalAttempts).toBe(5);
      expect(dbState.attempts.failureHistory.length).toBe(5);
      expect(dbState.attempts.failureHistory[4].error).toBe("Error 4");
    });

    it("should fail safely when multiple hooks compete for the same version", async () => {
      vi.spyOn(jobControlPlane, "getLatestJob").mockResolvedValue(baseJobMock as Job);

      const updateSpy = vi
        .spyOn(jobControlPlane, "updateJobSafe")
        .mockResolvedValueOnce({ ...baseJobMock, attempts: { ...baseJobMock.attempts, totalAttempts: 1 } } as any)
        .mockRejectedValueOnce(new Error("OptimisticLockError"));

      const increment = jobControlPlane.createIncrementAttemptHook(baseJobMock as Job);

      await expect(increment("Err 1", "BACKOFF_RETRY")).resolves.toBeDefined();
      await expect(increment("Err 2", "BACKOFF_RETRY")).rejects.toThrow("OptimisticLockError");

      expect(updateSpy).toHaveBeenCalledTimes(2);
    });
  });
});
