import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retryLlmCall } from '../../shared/utils/llm-retry.js';
import { ApiError } from '@google/genai';

const retryConfig = { attempt: 1, maxRetries: 3, projectId: '1' };

describe('retryLlmCall', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return the result on the first successful call', async () => {
        const llmCall = vi.fn().mockResolvedValue('success');
        const result = await retryLlmCall(llmCall, 'test-params', retryConfig);
        expect(result).toBe('success');
        expect(llmCall).toHaveBeenCalledTimes(1);
    });

    it('should throw on failure (no retry resolution)', async () => {
        const llmCall = vi.fn().mockRejectedValue(new Error('failure'));
        await expect(retryLlmCall(llmCall, 'test-params', retryConfig)).rejects.toThrow('failure');
        expect(llmCall).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 ApiError and eventually succeed', async () => {
        const err429 = new ApiError({ status: 429, message: 'Rate limited' });
        const llmCall = vi.fn()
            .mockRejectedValueOnce(err429)
            .mockResolvedValue('success');
        const result = await retryLlmCall(llmCall, 'test-params', retryConfig);
        expect(result).toBe('success');
        expect(llmCall).toHaveBeenCalledTimes(2);
    });

    it('should throw after maxRetries when 429 persists', async () => {
        const err429 = new ApiError({ status: 429, message: 'Rate limited' });
        const llmCall = vi.fn().mockRejectedValue(err429);
        await expect(retryLlmCall(llmCall, 'test-params', { attempt: 1, maxRetries: 2, projectId: '1' }))
            .rejects.toThrow('LLM call failed and resolution was not provided.');
        expect(llmCall).toHaveBeenCalledTimes(2);
    });

    it('should throw non-429 ApiError without retry', async () => {
        const err403 = new ApiError({ status: 403, message: 'Forbidden' });
        const llmCall = vi.fn().mockRejectedValue(err403);
        await expect(retryLlmCall(llmCall, 'test-params', retryConfig)).rejects.toThrow(err403);
        expect(llmCall).toHaveBeenCalledTimes(1);
    });
});
