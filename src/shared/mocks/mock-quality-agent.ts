import { vi, type Mock } from 'vitest';

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

export const createMockQualityAgent = (overrides?: Partial<MockQualityAgent>): MockQualityAgent => ({
    qualityConfig: {
        enabled: true,
        maxRetries: 3,
        safetyRetries: 1,
        minorIssueThreshold: 0.8,
    },
    evaluateFrameQuality: vi.fn().mockResolvedValue({
        accepted: true,
        qualityScore: 0.9,
        issues: [],
    }),
    evaluateScene: vi.fn().mockResolvedValue({
        accepted: true,
        qualityScore: 0.85,
        issues: [],
    }),
    applyQualityCorrections: vi.fn().mockResolvedValue('corrected prompt'),
    sanitizePrompt: vi.fn().mockResolvedValue('sanitized prompt'),
    ...overrides,
});