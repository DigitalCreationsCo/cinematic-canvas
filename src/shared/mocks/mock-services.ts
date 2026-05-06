import { Mock, vi } from "vitest";
import { JobControlPlane } from "#shared/services/job-control-plane.js";

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
    listActiveJobs: vi.fn(),
    cancelPendingJobsByWorkflow: vi.fn(),
  };
}
