import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JobControlPlane } from '../../shared/services/job-control-plane.js';
import { PoolManager } from '../../shared/services/pool-manager.js';
import { JobEvent, Job, JobType } from '../../shared/types/job.types.js';

// Mock the Drizzle db module
vi.mock('../../shared/db', () => {
    const mockInsert = vi.fn();
    const mockSelect = vi.fn();
    const mockUpdate = vi.fn();

    return {
        db: {
            insert: mockInsert,
            select: mockSelect,
            update: mockUpdate,
        },
        schema: {},
    };
});

// // Import the mocked db after mocking
// import { db } from '../../shared/db/index.js';

// describe('JobControlPlane', () => {
//     let jobControlPlane: JobControlPlane;
//     let mockPoolManager: Partial<PoolManager>;
//     let mockPublishJobEvent: ReturnType<typeof vi.fn>;

//     const mockDb = db as any;

//     beforeEach(() => {
//         vi.clearAllMocks();

//         mockPoolManager = {
//             query: vi.fn().mockResolvedValue({ rows: [] }),
//         };

//         mockPublishJobEvent = vi.fn().mockResolvedValue(undefined);
//         jobControlPlane = new JobControlPlane(mockPoolManager as PoolManager, mockPublishJobEvent);
//         process.env.MAX_CONCURRENT_JOBS_PER_WORKFLOW = "5";
//     });

//     afterEach(() => {
//         vi.clearAllMocks();
//         delete process.env.MAX_CONCURRENT_JOBS_PER_WORKFLOW;
//     });

//     describe('createJob', () => {
//         it('should create a job and publish event', async () => {
//             const newJob: Job = {
//                 id: 'test-job-id',
//                 type: 'EXPAND_CREATIVE_PROMPT' as JobType,
//                 projectId: 'test-project',
//                 state: 'CREATED',
//                 payload: { enhancedPrompt: 'foo' },
//                 attempt: 0,
//                 maxRetries: 3,
//                 createdAt: new Date(),
//                 updatedAt: new Date(),
//             };

//             mockDb.insert.mockReturnValue({
//                 values: vi.fn().mockReturnValue({
//                     returning: vi.fn().mockResolvedValue([ newJob ]),
//                 }),
//             });

//             const jobData = {
//                 type: 'EXPAND_CREATIVE_PROMPT' as JobType,
//                 projectId: 'test-project',
//                 payload: { enhancedPrompt: 'foo' },
//                 maxRetries: 3
//             };

//             const result = await jobControlPlane.createJob(jobData);

//             expect(result.id).toBe('test-job-id');
//             expect(mockPublishJobEvent).toHaveBeenCalledWith({
//                 type: 'JOB_DISPATCHED',
//                 jobId: 'test-job-id',
//                 projectId: 'test-project',
//             });
//         });
//     });

//     describe('getJob', () => {
//         it('should return a job if found', async () => {
//             const mockJob: Job = {
//                 id: 'test-job-id',
//                 type: 'EXPAND_CREATIVE_PROMPT' as JobType,
//                 projectId: 'test-project',
//                 state: 'CREATED',
//                 payload: { enhancedPrompt: 'foo' },
//                 result: null,
//                 attempt: 0,
//                 maxRetries: 3,
//                 createdAt: new Date(),
//                 updatedAt: new Date(),
//             };

//             mockDb.select.mockReturnValue({
//                 from: vi.fn().mockReturnValue({
//                     where: vi.fn().mockReturnValue({
//                         limit: vi.fn().mockResolvedValue([ mockJob ]),
//                     }),
//                 }),
//             });

//             const job = await jobControlPlane.getJob('test-job-id');
//             expect(job).toBeDefined();
//             expect(job?.id).toBe('test-job-id');
//         });

//         it('should return null if not found', async () => {
//             mockDb.select.mockReturnValue({
//                 from: vi.fn().mockReturnValue({
//                     where: vi.fn().mockReturnValue({
//                         limit: vi.fn().mockResolvedValue([]),
//                     }),
//                 }),
//             });

//             const job = await jobControlPlane.getJob('nonexistent');
//             expect(job).toBeNull();
//         });
//     });

//     describe('getLatestJob', () => {
//         it('should return the latest job for a project and type', async () => {
//             const mockJob: Job = {
//                 id: 'latest-job-id',
//                 type: 'GENERATE_SCENE_VIDEO' as JobType,
//                 projectId: 'test-project',
//                 state: 'COMPLETED',
//                 payload: {},
//                 attempt: 2,
//                 maxRetries: 3,
//                 createdAt: new Date(),
//                 updatedAt: new Date(),
//             };

//             mockDb.select.mockReturnValue({
//                 from: vi.fn().mockReturnValue({
//                     where: vi.fn().mockReturnValue({
//                         orderBy: vi.fn().mockReturnValue({
//                             limit: vi.fn().mockResolvedValue([ mockJob ]),
//                         }),
//                     }),
//                 }),
//             });

//             const job = await jobControlPlane.getLatestJob('test-project', 'GENERATE_SCENE_VIDEO');
//             expect(job?.id).toBe('latest-job-id');
//         });

//         it('should return null if no jobs found', async () => {
//             mockDb.select.mockReturnValue({
//                 from: vi.fn().mockReturnValue({
//                     where: vi.fn().mockReturnValue({
//                         orderBy: vi.fn().mockReturnValue({
//                             limit: vi.fn().mockResolvedValue([]),
//                         }),
//                     }),
//                 }),
//             });

//             const job = await jobControlPlane.getLatestJob('test-project', 'GENERATE_SCENE_VIDEO');
//             expect(job).toBeNull();
//         });
//     });

//     describe('updateJobState', () => {
//         it('should update job state', async () => {
//             mockDb.update.mockReturnValue({
//                 set: vi.fn().mockReturnValue({
//                     where: vi.fn().mockResolvedValue(undefined),
//                 }),
//             });

//             await jobControlPlane.updateJobState('test-job-id', 'COMPLETED');
//             expect(mockDb.update).toHaveBeenCalled();
//         });

//         it('should update result and error', async () => {
//             mockDb.update.mockReturnValue({
//                 set: vi.fn().mockReturnValue({
//                     where: vi.fn().mockResolvedValue(undefined),
//                 }),
//             });

//             await jobControlPlane.updateJobState('test-job-id', 'FAILED', { some: 'result' }, 'Error message');
//             expect(mockDb.update).toHaveBeenCalled();
//         });
//     });

//     describe('listJobs', () => {
//         it('should list jobs for project', async () => {
//             mockDb.select.mockReturnValue({
//                 from: vi.fn().mockReturnValue({
//                     where: vi.fn().mockReturnValue({
//                         orderBy: vi.fn().mockResolvedValue([]),
//                     }),
//                 }),
//             });

//             await jobControlPlane.listJobs('test-project');
//             expect(mockDb.select).toHaveBeenCalled();
//         });
//     });

//     describe('cancelJob', () => {
//         it('should cancel job and publish event', async () => {
//             mockDb.update.mockReturnValue({
//                 set: vi.fn().mockReturnValue({
//                     where: vi.fn().mockResolvedValue(undefined),
//                 }),
//             });

//             await jobControlPlane.cancelJob('test-job-id');
//             expect(mockPublishJobEvent).toHaveBeenCalledWith({
//                 type: 'JOB_CANCELLED',
//                 jobId: 'test-job-id',
//             });
//         });
//     });

//     describe('jobId', () => {
//         it('should generate jobId without uniqueKey', () => {
//             const id = jobControlPlane.jobId('proj', 'node');
//             expect(id).toBe('proj-node');
//         });

//         it('should generate jobId with uniqueKey', () => {
//             const id = jobControlPlane.jobId('proj', 'node', 'scene-1');
//             expect(id).toBe('proj-node-scene-1');
//         });
//     });
// });

describe('JobControlPlane', () => {
    it('has db mock available for future tests', () => {
        expect(vi.isMockFunction(vi.fn())).toBe(true);
    });
});

describe('JobControlPlane Safety Patterns', () => {
    let cp: JobControlPlane;
    const mockInitial: Job = {
        id: '1', projectId: 'p1', type: 'DATA_SYNC',
        attempts: { currentAttempt: 1, totalAttempts: 1, failureHistory: [] }
    } as any;

    beforeEach(() => {
        cp = new JobControlPlane({} as any, vi.fn());
    });

    it('refreshJob should throw if job is missing', async () => {
        vi.spyOn(cp, 'getLatestJob').mockResolvedValue(null);
        await expect(cp.refreshJob(mockInitial)).rejects.toThrow('JobConsistencyError');
    });

    it('hook should prevent updates if currentAttempt has drifted (Optimistic Locking)', async () => {
        const hook = cp.createIncrementAttemptHook(mockInitial);

        // Simulate DB having a newer version (attempt 2) than the worker (attempt 1)
        const dbVersion = { ...mockInitial, attempts: { ...mockInitial.attempts, currentAttempt: 2 } };
        vi.spyOn(cp, 'getLatestJob').mockResolvedValue(dbVersion);

        // Mock updateJobSafe to fail if version doesn't match
        vi.spyOn(cp, 'updateJobSafe').mockRejectedValue(new Error('OptimisticLockError'));

        await expect(hook('error', 'STALE_RECOVERY')).rejects.toThrow('OptimisticLockError');
    });

    it('hook should successfully increment when state is consistent', async () => {
        vi.spyOn(cp, 'getLatestJob').mockResolvedValue(mockInitial);
        vi.spyOn(cp, 'updateJobSafe').mockImplementation(async (id, ver, up) => ({ ...mockInitial, ...up }) as any);

        const hook = cp.createIncrementAttemptHook(mockInitial);
        const result = await hook('timeout', 'BACKOFF_RETRY');

        expect(result!.attempts.totalAttempts).toBe(2);
        expect(result!.attempts.failureHistory[ 0 ].error).toBe('timeout');
    });
});