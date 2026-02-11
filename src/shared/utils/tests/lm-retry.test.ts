import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retryLlmCall, RetryConfig } from '../lm-retry.js';
import { ApiError } from '@google/genai';

describe('retryLlmCall', () => {
    const mockLmCall = vi.fn();
    const config: RetryConfig = {
        attempt: 1,
        maxRetries: 3,
        initialDelay: 10,
        backoffFactor: 2,
        projectId: 'test-project'
    };

    // Helper to create an ApiError that works with instanceof and has status
    function createApiError(message: string, status: number) {
        const error = new Error(message) as any;
        error.status = status;
        error.name = 'ApiError';
        // Mock instanceof by overriding the static Symbol.hasInstance if needed, 
        // but Vitest might just work if we mock the module.
        // For now, let's just make it look like an ApiError and skip instanceof in the test if it's too hard,
        // but lm-retry uses it.
        Object.setPrototypeOf(error, ApiError.prototype);
        return error;
    }

    beforeEach(() => {
        mockLmCall.mockReset();
    });

    it('should succeed on first attempt', async () => {
        mockLmCall.mockResolvedValue('success');
        const result = await retryLlmCall(mockLmCall, { foo: 'bar' }, config);
        expect(result).toBe('success');
        expect(mockLmCall).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 error and succeed', async () => {
        const error429 = createApiError('Too Many Requests', 429);
        mockLmCall
            .mockRejectedValueOnce(error429)
            .mockResolvedValueOnce('success');

        const consoleSpy = vi.spyOn(console, 'warn');
        const result = await retryLlmCall(mockLmCall, { foo: 'bar' }, config);

        expect(result).toBe('success');
        expect(mockLmCall).toHaveBeenCalledTimes(2);
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.objectContaining({ attempt: 1, error: 'Too Many Requests' }),
            expect.stringContaining('failed')
        );
    });

    it('should fail after max retries', async () => {
        const error429 = createApiError('Too Many Requests', 429);
        mockLmCall.mockRejectedValue(error429);

        const consoleSpy = vi.spyOn(console, 'error');
        await expect(retryLlmCall(mockLmCall, { foo: 'bar' }, config)).rejects.toThrow('Too Many Requests');

        expect(mockLmCall).toHaveBeenCalledTimes(3);
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.objectContaining({ totalAttempts: 3, error: 'Too Many Requests' }),
            expect.stringContaining('failed after maximum retries')
        );
    });

    it('should not retry on non-429 error', async () => {
        const error500 = new Error('Internal Server Error');
        mockLmCall.mockRejectedValue(error500);

        await expect(retryLlmCall(mockLmCall, { foo: 'bar' }, config)).rejects.toThrow('Internal Server Error');
        expect(mockLmCall).toHaveBeenCalledTimes(1);
    });

    it('should preserve original error even if retry exhaustion throws', async () => {
        const originalError = new Error('Original Error');
        mockLmCall.mockRejectedValue(originalError);

        // Setting maxRetries to 1 so it fails immediately
        await expect(retryLlmCall(mockLmCall, { foo: 'bar' }, { ...config, maxRetries: 1 })).rejects.toThrow('Original Error');
    });
});
