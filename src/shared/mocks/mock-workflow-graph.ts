import "#shared/mocks/mock-asset-manager.ts";
import "#shared/mocks/mock-storage-manager.js";

import { Mock, vi } from "vitest";
import { JobControlPlane } from "#shared/services/job-control-plane.js";

vi.mock("#pipeline/checkpointer-manager.js");
vi.mock("#pipeline/graph.js", () => {
  const mockCompiledGraph = {
    stream: vi.fn(),
    getState: vi.fn().mockResolvedValue({ next: [], values: {}, tasks: [] }),
  };

  return {
    CinematicVideoWorkflow: vi.fn().mockImplementation(function () {
      return {
        graph: {
          compile: vi.fn().mockReturnValue(mockCompiledGraph),
        },
        publishEvent: null,
      };
    }),
  };
});

vi.mock("#pipeline/helpers/stream-helper.js", () => ({
  handleStream: vi.fn(),
}));
vi.mock("#shared/services/storage-manager.js");
vi.mock("#shared/services/job-control-plane.js");

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
