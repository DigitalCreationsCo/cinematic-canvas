import { AttemptMetadata } from "#shared/types/job.constants.js";

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
