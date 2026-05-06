import { mockGoogleGenAI } from "#shared/mocks/mock-googlegenai.js"

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleProvider } from '../../shared/lm/google/provider.js';
import { buildGenerateContentParams, buildGenerateVideosParams } from "#shared/lm/google/params.js";

describe('GoogleProvider', () => {
    let provider: GoogleProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new GoogleProvider();
    });

    it("should mock genAI", async () => {
        vi.mocked(mockGoogleGenAI.models.generateContent).mockResolvedValue({
            text: "mock",
        } as any);
    });

    it('should proxy generateContent calls to the underlying model', async () => {
        vi.mocked(mockGoogleGenAI.models.generateContent).mockResolvedValue('content' as any);

        const params = { model: 'test-model', messages: [] };
        const result = await provider.generateContent(params);

        expect(result).toBe('content');
        const googleProviderParams = buildGenerateContentParams(params);
        expect(mockGoogleGenAI.models.generateContent).toHaveBeenCalledWith(
            googleProviderParams
        );
    });

    it('should proxy generateVideos calls to the underlying model', async () => {
        vi.mocked(mockGoogleGenAI.models.generateVideos).mockResolvedValue('videos' as any);

        const params = { model: 'test-model', prompt: 'test' };
        const result = await provider.generateVideos(params);

        expect(result).toBe('videos');
        const googleProviderParams = buildGenerateVideosParams(params);
        expect(mockGoogleGenAI.models.generateVideos).toHaveBeenCalledWith(googleProviderParams);
    });

    it('should proxy getVideosOperation calls to the underlying operations', async () => {
        vi.mocked(mockGoogleGenAI.operations.getVideosOperation).mockResolvedValue('operation' as any);

        const params = { operation: { name: 'ops/123' } } as any;
        const result = await provider.getVideosOperation(params);

        expect(result).toBe('operation');
        expect(mockGoogleGenAI.operations.getVideosOperation).toHaveBeenCalledWith(params);
    });
});
