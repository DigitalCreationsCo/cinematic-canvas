import "#shared/mocks/mock-model.js";
import "#shared/mocks/mock-storage-manager.js";
import { QualityCheckAgent } from "#shared/agents/quality-check-agent.js";
import { Mocked, vi, type Mock } from "vitest";

export interface MockQualityAgent {
  qualityConfig: {
    enabled: boolean;
    maxRetries: number;
    safetyRetries: number;
    minorIssueThreshold: number;
  };
  evaluateFrameQuality: Mock;
  evaluateScene: Mock;
  applyQualityCorrections: Mock;
  sanitizePrompt: Mock;
}

const { MockQualityCheckAgent } = vi.hoisted(() => ({
  MockQualityCheckAgent: {
    qualityConfig: {
      enabled: true,
      maxRetries: 3,
      safetyRetries: 1,
      minorIssueThreshold: 0.8,
      acceptThreshold: 0.9,
      majorIssueThreshold: 0.7,
      failThreshold: 0.5,
    },
    evaluateScene: vi.fn().mockResolvedValue({
      score: 0.85,
      grade: "ACCEPT",
      issues: [],
    }),
    applyQualityCorrections: vi.fn().mockResolvedValue("corrected prompt"),
    sanitizePrompt: vi.fn().mockResolvedValue("sanitized prompt"),
    logAttemptResult: vi.fn(),
    calculateOverallScore: vi.fn().mockReturnValue(0.8), // Needed for the catch block
  },
}));

vi.mock("#shared/agents/quality-check-agent.js", async (importOriginal) => {
  const originalClass = ((await importOriginal()) as any).QualityCheckAgent;

  return {
    QualityCheckAgent: vi.fn().mockImplementation(() => ({
      ...originalClass,
      MockQualityCheckAgent,
    })),
  };
});

export const createMockQualityAgent = (overrides?: Partial<Mocked<QualityCheckAgent>>): Mocked<QualityCheckAgent> =>
  ({
    ...MockQualityCheckAgent,
    parseAndValidateJson: vi.fn(),
    evaluateFrameQuality: vi.fn().mockResolvedValue({
      accepted: true,
      qualityScore: 0.9,
      issues: [],
    }),
    // lm: overrides['lm'] || createMockTextModel(),
    // storageManager: overrides.storageManaager || createMockStorageManager(),
    // determineOverallRating,
    // logEvaluationResults,
    // getDefaultScores
    ...overrides,
  }) as any;
