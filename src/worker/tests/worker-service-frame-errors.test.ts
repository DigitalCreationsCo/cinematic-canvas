import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerService } from '../worker-service.js';
import { JobControlPlane } from '../../shared/services/job-control-plane.js';
import { DistributedLockManager } from '../../shared/services/lock-manager.js';

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
            updateJobSafe: vi.fn(),
            updateJobSafeAndIncrementAttempt: vi.fn(),
            createIncrementAttemptHook: vi.fn(() => vi.fn()),
        };

        mockLockManager = {} as any;
        mockPublishJobEvent = vi.fn();
        mockPublishPipelineEvent = vi.fn();

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
                payload: {
                    scenes: [{ id: 'scene-1' }],
                    assetKeys: ['scene_start_frame']
                },
                attempts: {
                    currentAttempt: 1,
                    maxRetries: 3
                }
            } as any;

            mockJobControlPlane.claimJob.mockResolvedValue([job, new Date().toISOString()]);

            // Mock the agents to return invalid result
            const mockProjectRepository = {
                getProjectFullState: vi.fn().mockResolvedValue({
                    id: 'proj-1',
                    scenes: [{ id: 'scene-1', assets: {} }],
                    characters: [],
                    locations: [],
                    generationRules: []
                }),
                updateProject: vi.fn()
            };

            // Inject mock repository
            (workerService as any).projectRepository = mockProjectRepository;

            // Mock getAgents to return agent with invalid result
            const originalGetAgents = (workerService as any).getAgents.bind(workerService);
            (workerService as any).getAgents = vi.fn((projectId: string) => {
                const agents = originalGetAgents(projectId);
                agents.continuityAgent.generateSceneFramesBatch = vi.fn().mockResolvedValue(null); // Invalid result
                return agents;
            });

            await workerService.processJob('job-123');

            // Should have failed the job
            expect(mockJobControlPlane.updateJobSafeAndIncrementAttempt).toHaveBeenCalledWith(
                'job-123',
                1,
                expect.objectContaining({
                    state: 'FAILED',
                    error: expect.stringContaining('Frame generation returned invalid result')
                })
            );

            expect(mockPublishJobEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'JOB_FAILED',
                    error: expect.stringContaining('Frame generation returned invalid result')
                })
            );
        });

        it('should handle missing data property in result', async () => {
            const job = {
                id: 'job-456',
                type: 'GENERATE_SCENE_FRAMES',
                projectId: 'proj-2',
                payload: {
                    scenes: [{ id: 'scene-2' }],
                    assetKeys: ['scene_start_frame']
                },
                attempts: {
                    currentAttempt: 1,
                    maxRetries: 3
                }
            } as any;

            mockJobControlPlane.claimJob.mockResolvedValue([job, new Date().toISOString()]);

            const mockProjectRepository = {
                getProjectFullState: vi.fn().mockResolvedValue({
                    id: 'proj-2',
                    scenes: [{ id: 'scene-2', assets: {} }],
                    characters: [],
                    locations: [],
                    generationRules: []
                }),
                updateProject: vi.fn()
            };

            (workerService as any).projectRepository = mockProjectRepository;

            const originalGetAgents = (workerService as any).getAgents.bind(workerService);
            (workerService as any).getAgents = vi.fn((projectId: string) => {
                const agents = originalGetAgents(projectId);
                // Return result without data property
                agents.continuityAgent.generateSceneFramesBatch = vi.fn().mockResolvedValue({
                    metadata: { model: 'test' }
                    // Missing data property
                });
                return agents;
            });

            await workerService.processJob('job-456');

            // Should have failed the job
            expect(mockJobControlPlane.updateJobSafeAndIncrementAttempt).toHaveBeenCalledWith(
                'job-456',
                1,
                expect.objectContaining({
                    state: 'FAILED',
                    error: expect.stringContaining('Frame generation returned invalid result')
                })
            );
        });

        it('should propagate batch generation errors correctly', async () => {
            const job = {
                id: 'job-789',
                type: 'GENERATE_SCENE_FRAMES',
                projectId: 'proj-3',
                payload: {
                    scenes: [{ id: 'scene-3' }],
                    assetKeys: ['scene_start_frame']
                },
                attempts: {
                    currentAttempt: 1,
                    maxRetries: 3
                }
            } as any;

            mockJobControlPlane.claimJob.mockResolvedValue([job, new Date().toISOString()]);

            const mockProjectRepository = {
                getProjectFullState: vi.fn().mockResolvedValue({
                    id: 'proj-3',
                    scenes: [{ id: 'scene-3', assets: {} }],
                    characters: [],
                    locations: [],
                    generationRules: []
                }),
                updateProject: vi.fn()
            };

            (workerService as any).projectRepository = mockProjectRepository;

            const batchError = new Error('Batch generation failed for 1 scene(s): scene-3');
            const originalGetAgents = (workerService as any).getAgents.bind(workerService);
            (workerService as any).getAgents = vi.fn((projectId: string) => {
                const agents = originalGetAgents(projectId);
                agents.continuityAgent.generateSceneFramesBatch = vi.fn().mockRejectedValue(batchError);
                return agents;
            });

            await workerService.processJob('job-789');

            // Should have failed the job with batch error
            expect(mockJobControlPlane.updateJobSafeAndIncrementAttempt).toHaveBeenCalledWith(
                'job-789',
                1,
                expect.objectContaining({
                    state: 'FAILED',
                    error: expect.stringContaining('Batch generation failed')
                })
            );
        });
    });
});
