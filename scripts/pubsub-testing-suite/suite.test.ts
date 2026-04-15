import { describe, it, expect, vi, beforeEach } from "vitest";
import { PubSubTestPublisher } from "./publisher.js";
import { PIPELINE_JOB_TYPES, TestScenarios } from "./fixtures.js";

// Mock the Google Cloud PubSub client
vi.mock("@google-cloud/pubsub", () => {
    return {
        PubSub: vi.fn().mockImplementation(() => ({
            topic: vi.fn().mockReturnThis(),
            publishMessage: vi.fn().mockResolvedValue("mock-msg-id")
        }))
    };
});

describe("Testing Suite Integrity", () => {
    let publisher: PubSubTestPublisher;

    beforeEach(() => {
        publisher = new PubSubTestPublisher({ projectId: "test-pid" });
    });

    it("should validate all current pipeline job types", () => {
        expect(PIPELINE_JOB_TYPES).toContain("RENDER_VIDEO");
        expect(PIPELINE_JOB_TYPES).toContain("PIPELINE_START");
    });

    it("should throw error when dispatching unknown job types", async () => {
        await expect(publisher.publishJobEvent({ state: "INVALID_JOB" as any, jobId: "123", projectId: "123", userId: "123", teamId: "123", metadata: {} }))
            .rejects.toThrow(/Invalid Job Type/);
    });

    it("should correctly format payloads for PubSub", async () => {
        const result = await publisher.publishJobEvent({ state: "JOB_DISPATCHED", jobId: "123", projectId: "123", userId: "123", teamId: "123", metadata: {} });
        expect(result.payload).toHaveProperty("timestamp");
        expect(result.payload.projectId).toBe("proj_abc");
    });

    it("should generate valid intervention fixtures", () => {
        const event = TestScenarios.interventionEvent("p1", "Low confidence score");
        expect(event.type).toBe("INTERVENTION_REQUIRED");
        expect(event.payload.resolutionOptions).toContain("RETRY");
    });
});