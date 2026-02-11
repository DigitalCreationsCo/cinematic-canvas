import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { AttemptMetadata, Job, JobState, JobType } from "../types/job.types.js";
import { AssetHistory, AssetKey, AssetVersion, Scope } from "../types/assets.types.js";
import { JobControlPlane } from "../services/job-control-plane.js";

export function createMockJob(overrides: Partial<Job> = {}): Job {
    return {
        id: "job-001",
        error: "",
        type: "GENERATE_SCENE_FRAMES" as JobType,
        projectId: "proj-001",
        assetKey: "scene_start_frame" as AssetKey,
        uniqueKey: "generate_scene_assets",
        state: "PENDING" as JobState,
        payload: { sceneId: "scene-1", sceneIndex: 0 },
        attempts: createMockAttempts(),
        recoveryContext: {
            reason: "RETRY_EXHAUSTED",
            triggeredBy: "MONITOR",
            previousJobId: "job-000",
        },
        createdAt: new Date("2026-01-30T00:00:00Z"),
        updatedAt: new Date("2026-01-30T00:00:00Z"),
        ...overrides,
    };
}

export function createMockControlPlane(): Record<keyof JobControlPlane, Mock> {
    return {
        createIncrementAttemptHook: vi.fn(),
        getLatestJob: vi.fn(),
        getJob: vi.fn(),
        createJob: vi.fn(),
        requeueJob: vi.fn(),
        updateJobState: vi.fn(),
        patchAttempts: vi.fn(),
        claimJob: vi.fn(),
        updateJobSafe: vi.fn(),
        updateJobSafeAndIncrementAttempt: vi.fn(),
        listJobs: vi.fn(),
        cancelJob: vi.fn(),
        refreshJob: vi.fn(),
        uniqueKey: vi.fn(),
    };
}

export function createMockAttempts(overrides: Partial<AttemptMetadata> = {}): AttemptMetadata {
    return {
        currentAttempt: 1,
        totalAttempts: 1,
        maxRetries: 3,
        lastAttemptAt: new Date("2026-01-30T00:00:00Z"),
        failureHistory: [],
        ...overrides,
    };
}