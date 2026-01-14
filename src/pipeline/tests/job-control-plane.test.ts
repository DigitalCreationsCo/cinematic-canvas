import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JobControlPlane } from '../services/job-control-plane';
import { PoolManager } from '../services/pool-manager';
import { JobEvent, JobRecord } from '../../shared/types/job.types';

// Mock PoolManager
vi.mock('./pool-manager');

describe('JobControlPlane', () => {
    let jobControlPlane: JobControlPlane;
    let mockPoolManager: any;
    let mockPublishJobEvent: any;

    beforeEach(() => {
        mockPoolManager = {
            query: vi.fn().mockResolvedValue({ rows: [] }),
        };
        mockPublishJobEvent = vi.fn();
        jobControlPlane = new JobControlPlane(mockPoolManager as PoolManager, mockPublishJobEvent);
        process.env.MAX_CONCURRENT_JOBS_PER_WORKFLOW = "5";
    });

    afterEach(() => {
        vi.clearAllMocks();
        delete process.env.MAX_CONCURRENT_JOBS_PER_WORKFLOW;
    });

    describe('createJob', () => {
        it('should create a job and publish event', async () => {
            const jobData = {
                id: 'test-job-id',
                type: 'EXPAND_CREATIVE_PROMPT',
                projectId: 'test-owner',
                payload: { enhancedPrompt: 'foo' },
                maxRetries: 3
            };

            // retryCount defaults to 0, maxRetries = 0 + 3 = 3
            await jobControlPlane.createJob(jobData as any);

            expect(mockPoolManager.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO jobs'), expect.arrayContaining([ 3 ])); // max_retries
            expect(mockPublishJobEvent).toHaveBeenCalledWith({
                type: 'JOB_DISPATCHED',
                jobId: 'test-job-id'
            });
        });

        it('should correctly calculate maxRetries with starting retryCount', async () => {
            const jobData = {
                id: 'test-job-id-retry',
                type: 'EXPAND_CREATIVE_PROMPT',
                projectId: 'test-owner',
                payload: { enhancedPrompt: 'foo' },
                maxRetries: 3,
                retryCount: 5
            };

            // retryCount = 5, maxRetries = 5 + 3 = 8
            await jobControlPlane.createJob(jobData as any);

            // Verify the values passed to query
            // The query values are [id, type, project_id, state, payload, retry_count, max_retries, ...]
            // Index 5 is retry_count, Index 6 is max_retries
            const callArgs = mockPoolManager.query.mock.calls[ 0 ][ 1 ];
            expect(callArgs[ 5 ]).toBe(5); // retry_count
            expect(callArgs[ 6 ]).toBe(8); // max_retries
        });

        it('should handle errors during creation', async () => {
            mockPoolManager.query.mockRejectedValue(new Error('DB Error'));
            const jobData = {
                id: 'test-job-id',
                type: 'EXPAND_CREATIVE_PROMPT',
                projectId: 'test-owner',
                payload: { enhancedPrompt: 'foo' },
            };

            await expect(jobControlPlane.createJob(jobData as any)).rejects.toThrow('DB Error');
        });
    });

    describe('getJob', () => {
        it('should return a job if found', async () => {
            const mockRow = {
                id: 'test-job-id',
                type: 'EXPAND_CREATIVE_PROMPT',
                project_id: 'test-owner',
                state: 'CREATED',
                payload: { enhancedPrompt: 'foo' },
                result: null,
                retry_count: 0,
                max_retries: 3,
                created_at: new Date(),
                updated_at: new Date()
            };
            mockPoolManager.query.mockResolvedValue({ rows: [ mockRow ] });

            const job = await jobControlPlane.getJob('test-job-id');
            expect(job).toEqual({
                id: 'test-job-id',
                type: 'EXPAND_CREATIVE_PROMPT',
                projectId: 'test-owner',
                state: 'CREATED',
                payload: { enhancedPrompt: 'foo' },
                result: null,
                retryCount: 0,
                maxRetries: 3,
                createdAt: mockRow.created_at,
                updatedAt: mockRow.updated_at
            });
        });

        it('should return null if not found', async () => {
            mockPoolManager.query.mockResolvedValue({ rows: [] });
            const job = await jobControlPlane.getJob('test-job-id');
            expect(job).toBeNull();
        });
    });

    describe('claimJob', () => {
        it('should return true if job is claimed successfully', async () => {
            mockPoolManager.query.mockResolvedValue({ rowCount: 1 });
            const result = await jobControlPlane.claimJob('test-job-id', 'worker-1');
            expect(result).toBe(true);
            expect(mockPoolManager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE jobs'), [ 'test-job-id', 5 ]);
        });

        it('should return false if job cannot be claimed', async () => {
            mockPoolManager.query.mockResolvedValue({ rowCount: 0 });
            const result = await jobControlPlane.claimJob('test-job-id', 'worker-1');
            expect(result).toBe(false);
        });

        it('should use custom concurrency limit from env', async () => {
            process.env.MAX_CONCURRENT_JOBS_PER_WORKFLOW = "10";
            mockPoolManager.query.mockResolvedValue({ rowCount: 1 });
            await jobControlPlane.claimJob('test-job-id', 'worker-1');
            expect(mockPoolManager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE jobs'), [ 'test-job-id', 10 ]);
        });

        it('should return false on error', async () => {
            mockPoolManager.query.mockRejectedValue(new Error('DB Error'));
            const result = await jobControlPlane.claimJob('test-job-id', 'worker-1');
            expect(result).toBe(false);
        });
    });

    describe('updateJobState', () => {
        it('should update job state', async () => {
            await jobControlPlane.updateJobState('test-job-id', 'COMPLETED');
            expect(mockPoolManager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE jobs'), [ 'COMPLETED', 'test-job-id' ]);
        });

        it('should update result and error', async () => {
            await jobControlPlane.updateJobState('test-job-id', 'FAILED', { some: 'result' }, 'Error message');
            expect(mockPoolManager.query).toHaveBeenCalledWith(expect.stringContaining('error = $3'), expect.arrayContaining([ 'FAILED', '{"some":"result"}', 'Error message', 'test-job-id' ]));
        });

        it('should increment retry count on failure', async () => {
            await jobControlPlane.updateJobState('test-job-id', 'FAILED');
            expect(mockPoolManager.query).toHaveBeenCalledWith(expect.stringContaining('retry_count = CASE WHEN $1 = \'FAILED\' THEN retry_count + 1 ELSE retry_count END'), expect.anything());
        });
    });

    describe('listJobs', () => {
        it('should list jobs for owner', async () => {
            mockPoolManager.query.mockResolvedValue({ rows: [] });
            await jobControlPlane.listJobs('owner-1');
            expect(mockPoolManager.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM jobs WHERE project_id = $1 ORDER BY created_at DESC'), [ 'owner-1' ]);
        });
    });

    describe('cancelJob', () => {
        it('should cancel job and publish event', async () => {
            await jobControlPlane.cancelJob('test-job-id');
            expect(mockPoolManager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE jobs'), [ 'CANCELLED', 'test-job-id' ]);
            expect(mockPublishJobEvent).toHaveBeenCalledWith({
                type: 'JOB_CANCELLED',
                jobId: 'test-job-id'
            });
        });
    });

    describe('jobId', () => {
        it('should generate jobId without uniqueKey', () => {
            const id = jobControlPlane.jobId('proj', 'node', 1);
            expect(id).toBe('proj-node-1');
        });

        it('should generate jobId with uniqueKey', () => {
            const id = jobControlPlane.jobId('proj', 'node', 1, 'scene-1');
            expect(id).toBe('proj-node-scene-1-1');
        });
    });

    describe('getLatestRetryCount', () => {
        it('should return max retry count', async () => {
            mockPoolManager.query.mockResolvedValue({ rows: [ { max_retry: 5 } ] });
            const count = await jobControlPlane.getLatestRetryCount('proj', 'node');
            expect(count).toBe(5);
            expect(mockPoolManager.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT MAX(retry_count)'),
                [ 'proj', 'proj-node-%' ]
            );
        });

        it('should return 0 if no jobs found', async () => {
            mockPoolManager.query.mockResolvedValue({ rows: [] });
            const count = await jobControlPlane.getLatestRetryCount('proj', 'node');
            expect(count).toBe(0);
        });

        it('should use uniqueKey pattern', async () => {
            mockPoolManager.query.mockResolvedValue({ rows: [ { max_retry: 2 } ] });
            await jobControlPlane.getLatestRetryCount('proj', 'node', 'key');
            expect(mockPoolManager.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT MAX(retry_count)'),
                [ 'proj', 'proj-node-key-%' ]
            );
        });
    });
});

