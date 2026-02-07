import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retryLlmCall } from '../../shared/utils/lm-retry.js';
import { ApiError } from '@google/genai';

const retryConfig = { attempt: 1, maxRetries: 3, projectId: '1' };

describe('retryLlmCall', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return the result on the first successful call', async () => {
        const lmCall = vi.fn().mockResolvedValue('success');
        const result = await retryLlmCall(lmCall, 'test-params', retryConfig);
        expect(result).toBe('success');
        expect(lmCall).toHaveBeenCalledTimes(1);
    });

    it('should throw on failure (no retry resolution)', async () => {
        const lmCall = vi.fn().mockRejectedValue(new Error('failure'));
        await expect(retryLlmCall(lmCall, 'test-params', retryConfig)).rejects.toThrow('failure');
        expect(lmCall).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 ApiError and eventually succeed', async () => {
        const err429 = new ApiError({ status: 429, message: 'Rate limited' });
        const lmCall = vi.fn()
            .mockRejectedValueOnce(err429)
            .mockResolvedValue('success');
        const result = await retryLlmCall(lmCall, 'test-params', retryConfig);
        expect(result).toBe('success');
        expect(lmCall).toHaveBeenCalledTimes(2);
    });

    it('should throw after maxRetries when 429 persists', async () => {
        const err429 = new ApiError({ status: 429, message: 'Rate limited' });
        const lmCall = vi.fn().mockRejectedValue(err429);
        await expect(retryLlmCall(lmCall, 'test-params', { attempt: 1, maxRetries: 2, projectId: '1' }))
            .rejects.toThrow('LLM call failed and resolution was not provided.');
        expect(lmCall).toHaveBeenCalledTimes(2);
    });

    it('should throw non-429 ApiError without retry', async () => {
        const err403 = new ApiError({ status: 403, message: 'Forbidden' });
        const lmCall = vi.fn().mockRejectedValue(err403);
        await expect(retryLlmCall(lmCall, 'test-params', retryConfig)).rejects.toThrow(err403);
        expect(lmCall).toHaveBeenCalledTimes(1);
    });
});
