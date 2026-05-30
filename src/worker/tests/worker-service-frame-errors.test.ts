import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerService } from '#worker/worker-service.js';
import { JobGenerateSceneFrames } from '#shared/types/job.types.ts';

describe('WorkerService - Frame Generation Error Handling', () => {
    let workerService: WorkerService;
    let mockJobControlPlane: any;
    let mockLockManager: any;
    let mockPublishJobEvent: any;
    let mockPublishPipelineEvent: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockJobControlPlane = {
            claimJob: vi.fn(),
            updateJobSafe: vi.fn().mockResolvedValue({}), // Application uses this on failure
            updateJobSafeAndIncrementAttempt: vi.fn().mockResolvedValue({}),
            createIncrementAttemptHook: vi.fn(() => vi.fn()),
        };

        mockLockManager = {} as any;
        mockPublishJobEvent = vi.fn().mockResolvedValue('msg-id');
        mockPublishPipelineEvent = vi.fn().mockResolvedValue('msg-id');

        workerService = new WorkerService(
            'test-gcp-project',
            'test-worker',
            'test-bucket',
            mockJobControlPlane,
            mockLockManager,
            mockPublishJobEvent,
            mockPublishPipelineEvent
        );
    });

    describe('GENERATE_SCENE_FRAMES job type', () => {
        it('should handle invalid result from generateSceneFramesBatch', async () => {
            const job = {
                id: 'job-123',
                type: 'GENERATE_SCENE_FRAMES',
                projectId: 'proj-1',
                userId: 'user-1',
                payload: { sceneIds: ['scene-1'], assetKeys: ['scene_start_frame'] },
                attempts: { currentAttempt: 1, maxRetries: 3 }
            } as any;

            mockJobControlPlane.claimJob.mockResolvedValue([job, new Date().toISOString()]);

            // Mock Project Repository to return project state
            const mockProjectRepository = {
                getProjectFullState: vi.fn().mockResolvedValue({
                    id: 'proj-1',
                    scenes: [{ id: 'scene-1', assets: {} }],
                    characters: [], locations: [], generationRules: []
                }),
                updateProject: vi.fn()
            };
            (workerService as any).projectRepository = mockProjectRepository;

            // Mock agents to return invalid result
            const mockAgents = {
                continuityAgent: {
                    generateSceneFramesBatch: vi.fn().mockResolvedValue(null)
                },
                assetManager: { createVersionedAssets: vi.fn() }
            };
            (workerService as any).getAgents = vi.fn().mockReturnValue(mockAgents);

            await workerService.processJob('job-123');

            // The application logic calls updateJobSafe in the final catch block for failures
            expect(mockJobControlPlane.updateJobSafe).toHaveBeenCalledWith(
                'job-123', 1,                 expect.objectContaining({
                    state: 'FAILED',
                    error: expect.stringContaining('Continuity agent returned malformed payload')
                })
            );
        });

        it('should handle missing data property in result', async () => {
            const job = {
                id: 'job-456',
                type: 'GENERATE_SCENE_FRAMES',
                projectId: 'proj-2',
                userId: 'user-1',
                payload: { sceneIds: ['scene-2'], assetKeys: ['scene_start_frame'] },
                attempts: { currentAttempt: 1, maxRetries: 3 }
            } as any;

            mockJobControlPlane.claimJob.mockResolvedValue([job, new Date().toISOString()]);

            const mockProjectRepository = {
                getProjectFullState: vi.fn().mockResolvedValue({
                    id: 'proj-2',
                    scenes: [{ id: 'scene-2', assets: {} }],
                    characters: [], locations: [], generationRules: []
                })
            };
            (workerService as any).projectRepository = mockProjectRepository;

            const mockAgents = {
                continuityAgent: {
                    generateSceneFramesBatch: vi.fn().mockResolvedValue({ metadata: {} }) // Missing .data
                }
            };
            (workerService as any).getAgents = vi.fn().mockReturnValue(mockAgents);

            await workerService.processJob('job-456');

            expect(mockJobControlPlane.updateJobSafe).toHaveBeenCalledWith(
                'job-456', 1,                 expect.objectContaining({
                    state: 'FAILED',
                    error: expect.stringContaining('Continuity agent returned malformed payload')
                })
            );
        });

        it('should propagate batch generation errors correctly', async () => {
            const job = {
                id: 'job-789',
                type: 'GENERATE_SCENE_FRAMES',
                projectId: 'proj-3',
                userId: 'user-1',
                payload: { sceneIds: ['scene-3'], assetKeys: ['scene_start_frame'] },
                attempts: { currentAttempt: 1, maxRetries: 3 }
            } as any;

            mockJobControlPlane.claimJob.mockResolvedValue([job, new Date().toISOString()]);

            const mockProjectRepository = {
                getProjectFullState: vi.fn().mockResolvedValue({
                    id: 'proj-3',
                    scenes: [{ id: 'scene-3', assets: {} }],
                    characters: [], locations: [], generationRules: []
                })
            };
            (workerService as any).projectRepository = mockProjectRepository;

            const batchError = new Error('Batch generation failed');
            const mockAgents = {
                continuityAgent: {
                    generateSceneFramesBatch: vi.fn().mockRejectedValue(batchError)
                }
            };
            (workerService as any).getAgents = vi.fn().mockReturnValue(mockAgents);

            await workerService.processJob('job-789');

            expect(mockJobControlPlane.updateJobSafe).toHaveBeenCalledWith(
                'job-789', 1, expect.objectContaining({
                    state: 'FAILED',
                    error: expect.stringContaining('Batch generation failed')
                })
            );
        });
    });
});