import { vi } from "vitest";

// ─────────────────────────────────────────────────────────────────
// INTERNAL: hoisted minimal factory used ONLY by the auto-mock.
// vi.mock() factories are hoisted above imports, so they can only
// reference values from vi.hoisted(). No external imports available.
// ─────────────────────────────────────────────────────────────────

const { _mockControlPlane } = await vi.hoisted(async () => {
  const { createMockJob } = await import("#shared/mocks/mock-jobs.js");
  const { generateId } = await import("#shared/utils/id.js");
  const _create = () => ({
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
  return { _mockControlPlane: _create() };
});

// ─────────────────────────────────────────────────────────────────
// AUTO-MOCK: triggered when any test imports this module as a
// side-effect (e.g. `import "#shared/mocks/mock-job-control-plane.js"`).
// Replaces JobControlPlane with a class whose constructor always
// returns the hoisted singleton instance.
// ─────────────────────────────────────────────────────────────────
vi.mock("#shared/services/job-control-plane.js", () => ({
  JobControlPlane: class {
    constructor() {
      return _mockControlPlane;
    }
  },
}));

// ─────────────────────────────────────────────────────────────────
// PUBLIC API — REGULAR module-level exports.
// These ARE properly exportable because they are plain function/const
// bindings, not destructured hoisted values.
// Full-featured: uses createMockJob(), generateId() etc. from imports.
// ─────────────────────────────────────────────────────────────────

export function createMockJobControlPlane() {
  return _mockControlPlane;
}

export const mockJobControlPlane = createMockJobControlPlane();
