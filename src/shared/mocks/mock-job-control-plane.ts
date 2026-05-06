import { createMockJob } from "#shared/mocks/mock-jobs.js";
import { generateId } from "#shared/utils/id.js";
import { vi } from "vitest";

export const createMockJobControlPlane = () => ({
  poolManager: {} as any,
  createJob: vi.fn().mockResolvedValue(createMockJob()),
  getJob: vi.fn(),
  updateJobState: vi.fn(),
  jobId: vi.fn().mockReturnValue(generateId()),
  uniqueKey: vi.fn().mockReturnValue("unique-key"),
  getLatestJob: vi.fn(),
  refreshJob: vi.fn(),
  claimJob: vi.fn(),
  requeueJob: vi.fn(),
  updateJobSafe: vi.fn(),
  updateJobSafeAndIncrementAttempt: vi.fn(),
  patchAttempts: vi.fn(),
  listJobs: vi.fn(),
  listActiveJobs: vi.fn(),
  cancelJob: vi.fn(),
  cancelPendingJobsByWorkflow: vi.fn(),
  createIncrementAttemptHook: vi.fn(),
  publishJobEvent: vi.fn(),
  hashTo32BitInt: vi.fn(),
  hashTo64BitInt: vi.fn(),
});
