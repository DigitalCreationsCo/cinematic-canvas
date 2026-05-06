import { vi, Mocked } from 'vitest';
import { QualityRetryConfig, GenerationCallbacks } from '#shared/utils/quality-retry-handler.js';
import { QualityEvaluationResult } from '#shared/types/quality.types.js';


/** Helper to create full evaluation object */
export const createMockQualityEvaluation = (score: number, overrides: Partial<QualityEvaluationResult> = {}): QualityEvaluationResult => ({
    score,
    grade: score >= 0.9 ? "ACCEPT" : "FAIL",
    model: "test-model",
    scores: {
        narrativeFidelity: { rating: "PASS", weight: 1, details: "" },
        characterConsistency: { rating: "PASS", weight: 1, details: "" },
        technicalQuality: { rating: "PASS", weight: 1, details: "" },
        emotionalAuthenticity: { rating: "PASS", weight: 1, details: "" },
        continuity: { rating: "PASS", weight: 1, details: "" }
    },
    feedback: "test",
    promptCorrections: [],
    issues: [],
    ...overrides
});

export const createMockQualityRetryConfig = (overrides: Partial<QualityRetryConfig> = {}): QualityRetryConfig => ({
    qualityConfig: {
        minorIssueThreshold: 0.8,
        acceptThreshold: 0.9,
        majorIssueThreshold: 0.7,
        failThreshold: 0.6,
        maxRetries: 3,
        safetyRetries: 1,
        enabled: true
    },
    context: {
        assetKey: 'scene_end_frame',
        sceneId: 'scene_1',
        attempt: 1,
        sceneIndex: 1,
        maxAttempts: 3,
        projectId: 'test_project'
    },
    ...overrides
});
export const createMockedGenerationCallbacks = (overrides: Partial<Mocked<GenerationCallbacks<string>>> = {}): Mocked<GenerationCallbacks<string>> => ({
    generate: vi.fn(),
    evaluate: vi.fn(),
    applyCorrections: vi.fn(),
    calculateScore: vi.fn((evalResult) => evalResult.score),
    onRetry: vi.fn(),
    classifyError: vi.fn(),
    sanitizePrompt: vi.fn(),
    ...overrides
});
