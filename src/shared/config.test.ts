import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getExecutionMode } from './config';

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
