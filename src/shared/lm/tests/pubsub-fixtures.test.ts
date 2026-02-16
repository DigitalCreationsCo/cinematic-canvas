import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TestScenarios, jobControlPlane } from "../../../../scripts/pubsub-testing/fixtures.js";

describe("TestScenarios.batchStressTest", () => {
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
        const charJob = jobs.find(j => j.type === "GENERATE_CHARACTER_ASSETS");
        expect(charJob).toBeDefined();
        expect(charJob?.projectId).toBe(projectId);
        expect(charJob?.payload?.characters).toEqual([]);

        // LOCATION ASSETS
        const locJob = jobs.find(j => j.type === "GENERATE_LOCATION_ASSETS");
        expect(locJob).toBeDefined();
        expect(locJob?.projectId).toBe(projectId);
        expect(locJob?.payload?.locations).toEqual([]);

        // SCENE FRAMES
        const frameJob = jobs.find(j => j.type === "GENERATE_SCENE_FRAMES");
        expect(frameJob).toBeDefined();
        expect(frameJob?.projectId).toBe(projectId);
        expect(frameJob?.payload?.sceneIds).toEqual([]);
        expect(frameJob?.payload?.assetKeys).toContain("scene_start_frame");
        expect(frameJob?.payload?.assetKeys).toContain("scene_end_frame");
    });

    it("should generate a unique projectId if not provided", async () => {
        const jobs = await TestScenarios.batchStressTest();
        expect(jobs[ 0 ].projectId).toBeDefined();
        expect(typeof jobs[ 0 ].projectId).toBe("string");
    });
});
