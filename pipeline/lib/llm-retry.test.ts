import { describe, it, expect, vi } from 'vitest';
import { retryLlmCall } from './llm-retry';

describe('retryLlmCall', () => {
    it('should return the result on the first successful call', async () => {
        const llmCall = vi.fn().mockResolvedValue('success');
        const result = await retryLlmCall(llmCall, 'test-params');
        expect(result).toBe('success');
        expect(llmCall).toHaveBeenCalledTimes(1);
    });

    it('should retry the specified number of times on failure', async () => {
        const llmCall = vi.fn().mockRejectedValue(new Error('failure'));
        await expect(retryLlmCall(llmCall, 'test-params', { maxRetries: 3, initialDelay: 10, backoffFactor: 2 })).rejects.toThrow('LLM call failed after multiple retries.');
        expect(llmCall).toHaveBeenCalledTimes(3);
    });

    it('should succeed after a few failed attempts', async () => {
        const llmCall = vi.fn()
            .mockRejectedValueOnce(new Error('failure 1'))
            .mockRejectedValueOnce(new Error('failure 2'))
            .mockResolvedValue('success');
        const result = await retryLlmCall(llmCall, 'test-params', { maxRetries: 3, initialDelay: 10, backoffFactor: 2 });
        expect(result).toBe('success');
        expect(llmCall).toHaveBeenCalledTimes(3);
    });

    it('should throw a custom error after max retries are exhausted', async () => {
        const llmCall = vi.fn().mockRejectedValue(new Error('any error'));
        await expect(retryLlmCall(llmCall, 'test-params', { maxRetries: 2, initialDelay: 10, backoffFactor: 2 })).rejects.toThrow('LLM call failed after multiple retries.');
        expect(llmCall).toHaveBeenCalledTimes(2);
    });

    it('should call onRetry and use modified params', async () => {
        const llmCall = vi.fn()
            .mockRejectedValueOnce(new Error('failure 1'))
            .mockResolvedValue('success');
        
        const onRetry = vi.fn().mockResolvedValue('modified-params');
        
        const result = await retryLlmCall(llmCall, 'test-params', { maxRetries: 3, initialDelay: 10, backoffFactor: 2 }, onRetry);
        
        expect(result).toBe('success');
        expect(llmCall).toHaveBeenCalledTimes(2);
        expect(onRetry).toHaveBeenCalledWith(new Error('failure 1'), 1, 'test-params');
        expect(llmCall).toHaveBeenLastCalledWith('modified-params');
    });

    it('should throw error immediately if maxRetries is 0', async () => {
        const llmCall = vi.fn().mockResolvedValue('success');
        await expect(retryLlmCall(llmCall, 'test-params', { maxRetries: 0, initialDelay: 10, backoffFactor: 2 })).rejects.toThrow('LLM call failed after multiple retries.');
        expect(llmCall).not.toHaveBeenCalled();
    });
});
