import "#shared/mocks/mock-pubsub.ts";

import { PubSubTestPublisher } from "./publisher.js";
import { PIPELINE_JOB_TYPES, jobControlPlane, TestScenarios } from "./fixtures.js";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe.skip("Testing Suite Integrity", () => {
  let publisher: PubSubTestPublisher;

  beforeEach(() => {
    publisher = new PubSubTestPublisher({ projectId: "test-pid" });
  });

  it("should validate all current pipeline job types", () => {
    expect(PIPELINE_JOB_TYPES).toContain("RENDER_VIDEO");
    expect(PIPELINE_JOB_TYPES).toContain("PIPELINE_START");
  });

  it("should throw error when dispatching unknown job types", async () => {
    await expect(
      publisher.publishJobEvent({
        state: "INVALID_JOB" as any,
        jobId: "123",
        projectId: "123",
        userId: "123",
        teamId: "123",
        metadata: {},
      }),
    ).rejects.toThrow(/Invalid Job Type/);
  });

  it("should correctly format payloads for PubSub", async () => {
    const result = await publisher.publishJobEvent({
      state: "JOB_DISPATCHED",
      jobId: "123",
      projectId: "123",
      userId: "123",
      teamId: "123",
      metadata: {},
    });
    expect(result.payload).toHaveProperty("timestamp");
    expect(result.payload.projectId).toBe("proj_abc");
  });

  it("should generate valid intervention fixtures", () => {
    const event = TestScenarios.interventionEvent("p1", "Low confidence score");
    expect(event.type).toBe("INTERVENTION_REQUIRED");
    expect(event.payload.resolutionOptions).toContain("RETRY");
  });
});

describe.skip("TestScenarios.batchStressTest", () => {
  beforeEach(() => {
    vi.spyOn(jobControlPlane, "createJob").mockImplementation(async (job) => {
      // Return the job as if it were created, with an ID
      return {
        ...job,
        id: "test-job-id",
        state: "PENDING",
      } as any;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("should return a chain of 3 batch jobs with empty payloads for global processing", async () => {
    const projectId = "018f3a3a-3c3b-7000-8000-000000000000";
    const jobs = await TestScenarios.batchStressTest(projectId);

    expect(jobs).toHaveLength(3);

    // CHARACTER ASSETS
    const charJob = jobs.find((j) => j.type === "GENERATE_CHARACTER_IMAGES");
    expect(charJob).toBeDefined();
    expect(charJob?.projectId).toBe(projectId);
    expect(charJob?.payload?.characters).toEqual([]);

    // LOCATION ASSETS
    const locJob = jobs.find((j) => j.type === "GENERATE_LOCATION_IMAGES");
    expect(locJob).toBeDefined();
    expect(locJob?.projectId).toBe(projectId);
    expect(locJob?.payload?.locations).toEqual([]);

    // SCENE FRAMES
    const frameJob = jobs.find((j) => j.type === "GENERATE_SCENE_FRAMES");
    expect(frameJob).toBeDefined();
    expect(frameJob?.projectId).toBe(projectId);
    expect(frameJob?.payload?.sceneIds).toEqual([]);
    expect(frameJob?.payload?.assetKeys).toContain("scene_start_frame");
    expect(frameJob?.payload?.assetKeys).toContain("scene_end_frame");
  });

  it("should generate a unique projectId if not provided", async () => {
    const jobs = await TestScenarios.batchStressTest();
    expect(jobs[0].projectId).toBeDefined();
    expect(typeof jobs[0].projectId).toBe("string");
  });
});
