import { describe, it, expect, vi } from 'vitest';
import { JobControlPlane } from '../../shared/services/job-control-plane.js';

describe('JobControlPlane Stress & Concurrency', () => {

    it('should handle rapid sequential increments without state drift', async () => {
        const cp = new JobControlPlane({} as any, vi.fn());
        let dbState = {
            id: 'job-1',
            attempts: { currentAttempt: 1, totalAttempts: 1, failureHistory: [] }
        } as any;

        // Mock DB to return latest state and update it
        vi.spyOn(cp, 'getLatestJob').mockImplementation(async () => dbState);
        vi.spyOn(cp, 'updateJobSafe').mockImplementation(async (id, ver, updates) => {
            dbState = { ...dbState, ...updates }; // Simulate DB persistence
            return dbState;
        });

        const increment = cp.createIncrementAttemptHook(dbState);

        // Execute 5 increments sequentially in a single thread
        for (let i = 0; i < 5; i++) {
            await increment(`Error ${i}`, 'BACKOFF_RETRY');
        }

        expect(dbState.attempts.totalAttempts).toBe(6);
        expect(dbState.attempts.failureHistory.length).toBe(5);
        expect(dbState.attempts.failureHistory[ 4 ].error).toBe('Error 4');
    });

    it('should fail safely when multiple hooks compete for the same version', async () => {
        const cp = new JobControlPlane({} as any, vi.fn());
        const initialJob = {
            id: 'job-1',
            attempts: { currentAttempt: 1, totalAttempts: 1, failureHistory: [] }
        } as any;

        vi.spyOn(cp, 'getLatestJob').mockResolvedValue(initialJob);

        // Mock a race condition where the first call succeeds, but the second 
        // finds the version has changed in the DB.
        const updateSpy = vi.spyOn(cp, 'updateJobSafe')
            .mockResolvedValueOnce({ ...initialJob, attempts: { ...initialJob.attempts, totalAttempts: 2 } })
            .mockRejectedValueOnce(new Error('OptimisticLockError'));

        const increment = cp.createIncrementAttemptHook(initialJob);

        // First call succeeds
        await expect(increment('Err 1', 'BACKOFF_RETRY')).resolves.toBeDefined();

        // Second call fails because the database state shifted
        // (Simulating the 'currentAttempt' mismatch)
        await expect(increment('Err 2', 'BACKOFF_RETRY')).rejects.toThrow('OptimisticLockError');

        expect(updateSpy).toHaveBeenCalledTimes(2);
    });
});