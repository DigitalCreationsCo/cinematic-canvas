import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { AttemptMetadata, InsertJob, Job, JobState, JobType } from "../types/job.types.js";
import { AssetHistory, AssetKey, AssetVersion, Scope } from "../types/assets.types.js";
import { JobControlPlane } from "../services/job-control-plane.js";

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