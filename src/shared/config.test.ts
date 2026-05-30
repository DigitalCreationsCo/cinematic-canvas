import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getExecutionMode,
    getGlobalModelCooldownMs,
    getImageRateLimitRetryDelayMs,
    getParallelImageStaggerMs,
} from './config';

describe('getExecutionMode()', () => {
    beforeEach(() => {
        // Reset all env stubs to their original state before each test
        vi.unstubAllEnvs();
    });

    it('returns BATCH when EXECUTION_MODE is set to BATCH', () => {
        vi.stubEnv('EXECUTION_MODE', 'BATCH');
        expect(getExecutionMode()).toBe('BATCH');
    });

    it('returns PARALLEL when EXECUTION_MODE is set to PARALLEL', () => {
        vi.stubEnv('EXECUTION_MODE', 'PARALLEL');
        expect(getExecutionMode()).toBe('PARALLEL');
    });

    it('defaults to SEQUENTIAL when EXECUTION_MODE is missing', () => {
        vi.stubEnv('EXECUTION_MODE', undefined);
        expect(getExecutionMode()).toBe('SEQUENTIAL');
    });

    it('defaults to SEQUENTIAL and warns when EXECUTION_MODE is invalid', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.stubEnv('EXECUTION_MODE', 'ULTRA_FAST'); // Invalid value

        expect(getExecutionMode()).toBe('SEQUENTIAL');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid'));

        warnSpy.mockRestore();
    });
});

describe('model cooldown config', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });

    it('uses conservative defaults for rate-limit-sensitive image paths', () => {
        expect(getGlobalModelCooldownMs()).toBe(5000);
        expect(getParallelImageStaggerMs()).toBe(15000);
        expect(getImageRateLimitRetryDelayMs()).toBe(60000);
    });

    it('allows cooldowns to be increased from env vars', () => {
        vi.stubEnv('GLOBAL_MODEL_COOLDOWN_MS', '7000');
        vi.stubEnv('PARALLEL_IMAGE_STAGGER_MS', '30000');
        vi.stubEnv('IMAGE_RATE_LIMIT_RETRY_DELAY_MS', '90000');

        expect(getGlobalModelCooldownMs()).toBe(7000);
        expect(getParallelImageStaggerMs()).toBe(30000);
        expect(getImageRateLimitRetryDelayMs()).toBe(90000);
    });

    it('falls back to defaults for invalid cooldown env vars', () => {
        vi.stubEnv('GLOBAL_MODEL_COOLDOWN_MS', '0');
        vi.stubEnv('PARALLEL_IMAGE_STAGGER_MS', 'soon');
        vi.stubEnv('IMAGE_RATE_LIMIT_RETRY_DELAY_MS', '-1000');

        expect(getGlobalModelCooldownMs()).toBe(5000);
        expect(getParallelImageStaggerMs()).toBe(15000);
        expect(getImageRateLimitRetryDelayMs()).toBe(60000);
    });
});
