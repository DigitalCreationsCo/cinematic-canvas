import { describe, it, expect, vi, beforeEach, type Mocked } from "vitest";
import * as langgraph from "@langchain/langgraph";
import { Dispatcher, BatchJobs } from "#pipeline/dispatcher.js";
import { JobControlPlane } from "#shared/services/job-control-plane.js";
import { createMockJob } from "#shared/mocks/mock-jobs.js";
import { createMockJobControlPlane } from "#shared/mocks/mock-job-control-plane.js";
import { createMockAttempts } from "#shared/mocks/mock-attempts.js";
import { generateId } from "#shared/utils/id.js";

// Custom error to catch LangGraph interrupts
class InterruptSignal extends Error {}

vi.mock("@langchain/langgraph", async () => {
  const actual = await vi.importActual("@langchain/langgraph");
  return {
    ...actual,
    interrupt: vi.fn().mockImplementation((val) => {
      const err = new InterruptSignal();
      (err as any).data = val;
      throw err;
    }),
  };
});

describe("Dispatcher: Full System Test", () => {
  let plane: Mocked<JobControlPlane>;
  let dispatcher: Dispatcher;

  // Standard Test Context
  const projectId = generateId();
  const teamId = generateId();
  const userId = generateId();
  const workflowId = generateId();
  const nodeName = "test-node";

  const standardArgs = {
    workflowId,
    nodeName,
    jobType: "GENERATE_SCENE_FRAMES" as const,
    assetKey: "scene_start_frame" as const,
    entityId: "entity-456",
    teamId,
    userId,
    payload: { prompt: "test" } as any,
    priority: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    plane = createMockJobControlPlane() as any;
    // Initialized with 3 slots for batch testing
    dispatcher = new Dispatcher(plane, 3, projectId);
  });

  describe("ensureJob Lifecycle & Timing", () => {
    it("returns COMPLETED job immediately", async () => {
      const job = createMockJob({ state: "COMPLETED" });
      plane.getLatestJob.mockResolvedValue(job);

      const result = await dispatcher.ensureJob(standardArgs);

      expect(result).toBe(job);
      expect(plane.createJob).not.toHaveBeenCalled();
    });

    it("interrupts if job is RUNNING", async () => {
      plane.getLatestJob.mockResolvedValue(createMockJob({ state: "RUNNING" }));

      await expect(dispatcher.ensureJob(standardArgs)).rejects.toThrow(InterruptSignal);
      expect(langgraph.interrupt).toHaveBeenCalled();
    });

    it("requeues PENDING job if older than 120 seconds", async () => {
      const staleTime = new Date(Date.now() - 121000); // Exceeds 120000ms threshold
      const staleJob = createMockJob({ state: "PENDING", updatedAt: staleTime });
      plane.getLatestJob.mockResolvedValue(staleJob);

      await expect(dispatcher.ensureJob(standardArgs)).rejects.toThrow(InterruptSignal);

      expect(plane.requeueJob).toHaveBeenCalledWith(staleJob.id);
    });

    it("does NOT requeue fresh PENDING jobs", async () => {
      const freshJob = createMockJob({ state: "PENDING", updatedAt: new Date() });
      plane.getLatestJob.mockResolvedValue(freshJob);

      await expect(dispatcher.ensureJob(standardArgs)).rejects.toThrow(InterruptSignal);

      expect(plane.requeueJob).not.toHaveBeenCalled();
    });
  });

  describe("Recovery & Successor Logic", () => {
    it("should escalate to FATAL and create a successor when retries are exhausted", async () => {
      const exhausted = createMockJob({
        state: "FAILED",
        attempts: createMockAttempts({ currentAttempt: 3, maxRetries: 3 }),
      });
      plane.getLatestJob.mockResolvedValueOnce(exhausted);
      plane.getJob.mockResolvedValue({ ...exhausted, state: "FATAL" });

      const advancedJob = {
        ...exhausted,
        attempts: { ...exhausted.attempts, totalAttempts: 4 },
      };
      const mockHook = vi.fn().mockResolvedValue(advancedJob);
      plane.createIncrementAttemptHook.mockReturnValue(mockHook);
      plane.createJob.mockResolvedValue(createMockJob());

      try {
        await dispatcher.ensureJob({
          workflowId,
          nodeName: "node-name",
          jobType: "GENERATE_SCENE_FRAMES",
          assetKey: "scene_start_frame",
          entityId: "scene-id",
          teamId,
          userId,
          payload: {} as any,
        });
      } catch (e) {}

      expect(plane.updateJobState).toHaveBeenCalledWith(exhausted.id, "FATAL", expect.anything());
      expect(plane.createIncrementAttemptHook).toHaveBeenCalled();
      expect(mockHook).toHaveBeenCalledWith(expect.any(String), "SUCCESSOR_RECOVERY");
      expect(plane.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          state: "PENDING",
          attempts: expect.objectContaining({
            totalAttempts: 4,
            currentAttempt: 1,
          }),
        }),
      );
      expect(langgraph.interrupt).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "waiting_for_job",
        }),
      );
    });

    it("interrupts with max_lifetime_exceeded if totalAttempts >= 12", async () => {
      const hitLimit = createMockJob({
        state: "FATAL",
        attempts: createMockAttempts({ totalAttempts: 12 }),
      });
      plane.getLatestJob.mockResolvedValue(hitLimit);
      plane.getJob.mockResolvedValue(hitLimit);

      plane.createIncrementAttemptHook.mockReturnValue(
        vi.fn().mockResolvedValue({
          ...hitLimit,
          attempts: { ...hitLimit.attempts, totalAttempts: 13 },
        }),
      );

      await expect(dispatcher.ensureJob(standardArgs)).rejects.toThrow(InterruptSignal);

      expect(langgraph.interrupt).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "max_lifetime_exceeded",
        }),
      );
      expect(plane.createJob).not.toHaveBeenCalled();
    });
  });

  describe("ensureBatchJobs Throttling", () => {
    it("limits job creation to MAX_PARALLEL_JOBS (3)", async () => {
      plane.getLatestJob.mockResolvedValue(null); // No jobs exist yet

      const batch: BatchJobs<"GENERATE_SCENE_FRAMES"> = [
        { uniqueKey: "1", type: "GENERATE_SCENE_FRAMES", teamId, userId, payload: {} as any },
        { uniqueKey: "2", type: "GENERATE_SCENE_FRAMES", teamId, userId, payload: {} as any },
        { uniqueKey: "3", type: "GENERATE_SCENE_FRAMES", teamId, userId, payload: {} as any },
        { uniqueKey: "4", type: "GENERATE_SCENE_FRAMES", teamId, userId, payload: {} as any },
        { uniqueKey: "5", type: "GENERATE_SCENE_FRAMES", teamId, userId, payload: {} as any },
      ];

      await expect(dispatcher.ensureBatchJobs(nodeName, workflowId, batch)).rejects.toThrow(InterruptSignal);

      // Dispatcher was initialized with '3' as the max parallel slots
      expect(plane.createJob).toHaveBeenCalledTimes(3);
    });

    it("aggregates failures and returns lm_retry_exhausted interrupt", async () => {
      const failedJob = createMockJob({ state: "FAILED" });
      plane.getLatestJob.mockResolvedValueOnce(failedJob).mockResolvedValue(null);

      const batch: BatchJobs<"GENERATE_SCENE_FRAMES"> = [
        { uniqueKey: "1", type: "GENERATE_SCENE_FRAMES", teamId, userId, payload: {} as any },
        { uniqueKey: "2", type: "GENERATE_SCENE_FRAMES", teamId, userId, payload: {} as any },
      ];

      await expect(dispatcher.ensureBatchJobs(nodeName, workflowId, batch)).rejects.toThrow(InterruptSignal);

      expect(langgraph.interrupt).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "lm_retry_exhausted",
        }),
      );
    });
  });
});
