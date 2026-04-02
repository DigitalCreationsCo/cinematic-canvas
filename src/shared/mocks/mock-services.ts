import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { AttemptMetadata, InsertJob, Job, JobState, JobType } from "../types/job.types.js";
import { AssetHistory, AssetKey, AssetVersion, Scope } from "../types/assets.types.js";
import { JobControlPlane } from "../services/job-control-plane.js";

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