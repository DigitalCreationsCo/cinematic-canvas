import { WorkflowOperator } from '../workflow-service.js';
import { CheckpointerManager } from '../checkpointer-manager.js';
import { CinematicVideoWorkflow } from '../graph.js'; // mocked above
import { handleStream } from '../helpers/stream-helper.js';
import { GCPStorageManager } from '../../shared/services/storage-manager.js';
import { JobControlPlane } from '../../shared/services/job-control-plane.js';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Command } from "@langchain/langgraph";
import { Scene } from '../../shared/types/index.js';
import { handleJobCompletion } from "../handlers/handleJobCompletion.js";

// Mock dependencies (paths relative to test file: pipeline/tests; workflow-service lives in pipeline/)
vi.mock('../checkpointer-manager.js');
vi.mock('../graph.js', () => ({ CinematicVideoWorkflow: vi.fn() }));
vi.mock('../helpers/stream-helper.js');
vi.mock('../../shared/services/storage-manager.js');
vi.mock('../../shared/services/job-control-plane.js');
vi.mock('../../shared/services/asset-version-manager.js', () => ({
    AssetVersionManager: class MockAssetVersionManager {
        setBestVersion = vi.fn().mockResolvedValue(undefined);
        getNextVersionNumber = vi.fn().mockResolvedValue([1]);
    },
}));

describe('WorkflowOperator', () => {
    let workflowOperator: WorkflowOperator;
    let mockCheckpointerManager: any;
    let mockPublishEvent: any;
    let mockControlPlane: any;
    let mockProjectRepository: any;
    let mockWorkflow: any;
    let mockCompiledGraph: any;

    const projectId = 'test-project';
    const projectUuid = '01234567-89ab-7def-89ab-012345678901';
    const gcpProjectId = 'test-gcp-project';
    const bucketName = 'test-bucket';
    let mockLockManager: any;

    beforeEach(() => {
        mockPublishEvent = vi.fn();
        mockLockManager = {
            acquireLock: vi.fn().mockResolvedValue(true),
            releaseLock: vi.fn().mockResolvedValue(undefined)
        };

        // Setup CheckpointerManager mock
        mockCheckpointerManager = {
            getCheckpointer: vi.fn().mockResolvedValue({
                put: vi.fn().mockResolvedValue(undefined)
            }),
            loadCheckpoint: vi.fn().mockResolvedValue(null),
            saveCheckpoint: vi.fn().mockResolvedValue(undefined),
        };

        // Setup ControlPlane mock
        mockControlPlane = {
            createJob: vi.fn(),
            getJob: vi.fn(),
            updateJobState: vi.fn()
        };

        // Setup ProjectRepository mock
        mockProjectRepository = {
            getScene: vi.fn(),
            getProjectScenes: vi.fn(),
            getProjectCharacters: vi.fn(),
            getProjectLocations: vi.fn(),
            getProject: vi.fn().mockResolvedValue({ id: projectId, currentSceneIndex: 0 }),
            updateScenes: vi.fn(),
            updateSceneStatus: vi.fn(),
            createProject: vi.fn().mockResolvedValue({ id: projectUuid, metadata: { hasAudio: false }, currentSceneIndex: 0 }),
            updateProject: vi.fn().mockResolvedValue(undefined),
            appendProjectForceRegenerateSceneIds: vi.fn().mockResolvedValue(undefined),
            getProjectFullState: vi.fn().mockResolvedValue({ id: projectId, metadata: {}, scenes: [] }),
        };

        // Setup Workflow mock (graph.getState used by resumePipeline)
        mockCompiledGraph = {
            stream: vi.fn(),
            getState: vi.fn().mockResolvedValue({ next: [], values: {}, tasks: [] }),
        };
        mockWorkflow = {
            graph: {
                compile: vi.fn().mockReturnValue(mockCompiledGraph)
            },
            publishEvent: null
        };
        (CinematicVideoWorkflow as any).mockImplementation(function () { return mockWorkflow; });

        workflowOperator = new WorkflowOperator(
            mockCheckpointerManager,
            mockControlPlane,
            mockPublishEvent,
            mockProjectRepository,
            mockLockManager,
            gcpProjectId,
            bucketName
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('startPipeline', () => {
        it.skip('should start a new pipeline when no checkpoint exists', async () => {
            const payload = { initialPrompt: 'test prompt', title: 'Test Project' };
            mockProjectRepository.getProject.mockResolvedValue(null);

            await workflowOperator.startPipeline(projectUuid, payload);

            expect(mockProjectRepository.createProject).toHaveBeenCalled();
            expect(mockWorkflow.graph.compile).toHaveBeenCalled();
            expect(handleStream).toHaveBeenCalledWith(
                projectUuid,
                mockCompiledGraph,
                expect.objectContaining({ id: projectUuid, projectId: projectUuid }),
                expect.objectContaining({ configurable: { thread_id: projectUuid } }),
                'startPipeline',
                mockPublishEvent
            );
        });

        it.skip('should resume pipeline and update state when checkpoint exists', async () => {
            const payload = { initialPrompt: 'test prompt', title: 'Test Project' };
            mockProjectRepository.getProject.mockResolvedValue(null);

            await workflowOperator.startPipeline(projectUuid, payload);

            expect(handleStream).toHaveBeenCalledWith(
                projectUuid,
                mockCompiledGraph,
                expect.objectContaining({ id: projectUuid, projectId: projectUuid }),
                expect.objectContaining({ configurable: { thread_id: projectUuid } }),
                'startPipeline',
                mockPublishEvent
            );
        });

        it.skip('should update audio details when resuming with new audio', async () => {
            const payload = { audioGcsUri: 'gs://bucket/test.mp3', initialPrompt: 'test prompt', title: 'Test' };
            mockProjectRepository.getProject.mockResolvedValue(null);
            const mockGetPublicUrl = vi.fn().mockReturnValue('https://storage.googleapis.com/bucket/test.mp3');
            vi.mocked(GCPStorageManager as any).mockImplementation(function MockGCP() {
                return { getPublicUrl: mockGetPublicUrl, getObjectPath: vi.fn().mockResolvedValue('path/to/object'), uploadJSON: vi.fn() };
            });

            await workflowOperator.startPipeline(projectUuid, payload);

            expect(handleStream).toHaveBeenCalledWith(
                projectUuid,
                mockCompiledGraph,
                expect.objectContaining({ hasAudio: true }),
                expect.objectContaining({ configurable: { thread_id: projectUuid } }),
                'startPipeline',
                mockPublishEvent
            );
        });
    });

    describe('resumePipeline', () => {
        it('should not call stream when getProject fails', async () => {
            mockProjectRepository.getProject.mockRejectedValue(new Error('Project not found'));
            mockCompiledGraph.getState.mockResolvedValue({ next: [], values: {}, tasks: [] });

            await expect(workflowOperator.resumePipeline(projectId)).rejects.toThrow('Project not found');
            expect(handleStream).not.toHaveBeenCalled();
        });

        it('should resume if checkpoint exists', async () => {
            mockCheckpointerManager.loadCheckpoint.mockResolvedValue({});
            mockCompiledGraph.getState.mockResolvedValue({ next: [], values: {}, tasks: [] });

            await workflowOperator.resumePipeline(projectId);

            expect(handleStream).toHaveBeenCalledWith(
                projectId,
                mockCompiledGraph,
                expect.any(Command),
                expect.objectContaining({ configurable: { thread_id: projectId } }),
                'resumePipeline',
                mockPublishEvent
            );
        });
    });

    describe('regenerateScene', () => {
        it('should trigger regenerate scene via Command', async () => {
            const sceneId = 'scene-1';
            const promptModification = 'make it darker';
            const forceRegenerate = true;

            mockCheckpointerManager.loadCheckpoint.mockResolvedValue({
                channel_values: {
                    storyboardState: {
                        scenes: [{ id: sceneId }]
                    },
                    scenePromptOverrides: {}
                }
            });

            await workflowOperator.regenerateScene(projectId, { sceneId, forceRegenerate, promptModification });

            expect(handleStream).toHaveBeenCalledWith(
                projectId,
                mockCompiledGraph,
                expect.any(Command),
                expect.objectContaining({ configurable: { thread_id: projectId } }),
                'regenerateScene',
                mockPublishEvent
            );
        });

        it('should still run stream when checkpoint is null (warns only)', async () => {
            mockCheckpointerManager.loadCheckpoint.mockResolvedValue(null);
            const promptModification = 'make it darker';
            const forceRegenerate = true;
            await workflowOperator.regenerateScene(projectId, { sceneId: 'missing', forceRegenerate, promptModification });
            expect(mockProjectRepository.appendProjectForceRegenerateSceneIds).toHaveBeenCalledWith(projectId, ['missing']);
            expect(handleStream).toHaveBeenCalled();
        });
    });

    describe('resolveIntervention', () => {
        it('should handle abort action', async () => {
            const interrupt = { nodeName: 'some_node', error: 'some error' };
            const { v7: uuidv7 } = await import('uuid');
            const uuid = uuidv7();
            mockCheckpointerManager.loadCheckpoint.mockResolvedValue({
                channel_values: {
                    id: uuid,
                    projectId: uuid,
                    __interrupt__: [{ value: interrupt }],
                    errors: []
                }
            });

            await workflowOperator.resolveIntervention(projectId, { action: 'abort' });

            expect(mockPublishEvent).toHaveBeenCalledWith(expect.objectContaining({
                type: 'WORKFLOW_FAILED',
                payload: expect.objectContaining({ error: 'Workflow canceled' })
            }));
        });

        it('should handle continue/retry action', async () => {
            const interrupt = { nodeName: 'some_node', params: { foo: 'bar' } };
            const { v7: uuidv7 } = await import('uuid');
            const uuid = uuidv7();
            mockCheckpointerManager.loadCheckpoint.mockResolvedValue({
                channel_values: {
                    id: uuid,
                    projectId: uuid,
                    __interrupt__: [{ value: interrupt }]
                }
            });

            await workflowOperator.resolveIntervention(projectId, { action: 'retry', revisedParams: { foo: 'baz' } });

            expect(handleStream).toHaveBeenCalledWith(
                projectId,
                mockCompiledGraph,
                expect.any(Command),
                expect.objectContaining({ configurable: { thread_id: projectId } }),
                'resolveIntervention',
                mockPublishEvent
            );
        });
    });

    describe('updateSceneAsset', () => {
        it('should update scene asset and save checkpoint', async () => {
            const sceneId = 'scene-1';
            const mockScene = {
                id: sceneId,
                rejectedAttempts: {},
                status: 'complete',
                assets: {
                    scene_video: {
                        best: 2,
                        head: 2,
                        versions: [
                            {},
                            { data: 'gs://bucket/path/v1' },
                            { data: 'gs://bucket/path/v2' }
                        ]
                    }
                }
            } as unknown as Scene;

            mockCheckpointerManager.getCheckpointer.mockResolvedValue({
                put: vi.fn().mockResolvedValue(undefined)
            });

            mockProjectRepository.getScene.mockResolvedValue(mockScene);

            await workflowOperator.updateSceneAsset(projectId, { scene: mockScene as Scene, assetKey: 'scene_video', version: 2 });

            expect(mockProjectRepository.getScene).toHaveBeenCalledWith(sceneId);
            expect(mockPublishEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'FULL_STATE' }));
        });
    });

    describe('publishEvent duplicate prevention', () => {
        it('should only publish WORKFLOW_COMPLETED once per project', async () => {
            const event1 = { type: 'WORKFLOW_COMPLETED', projectId, timestamp: new Date().toISOString() };
            const event2 = { type: 'WORKFLOW_COMPLETED', projectId, timestamp: new Date().toISOString() };

            await workflowOperator.publishEvent(event1 as any);
            await workflowOperator.publishEvent(event2 as any);

            // Should only be called once
            expect(mockPublishEvent).toHaveBeenCalledTimes(1);
            expect(mockPublishEvent).toHaveBeenCalledWith(expect.objectContaining({
                type: 'WORKFLOW_COMPLETED',
                projectId
            }));
        });

        it('should allow WORKFLOW_COMPLETED for different projects', async () => {
            const projectId2 = 'test-project-2';
            const event1 = { type: 'WORKFLOW_COMPLETED', projectId, timestamp: new Date().toISOString() };
            const event2 = { type: 'WORKFLOW_COMPLETED', projectId: projectId2, timestamp: new Date().toISOString() };

            await workflowOperator.publishEvent(event1 as any);
            await workflowOperator.publishEvent(event2 as any);

            // Should be called twice for different projects
            expect(mockPublishEvent).toHaveBeenCalledTimes(2);
        });

        it('should allow other event types to be published multiple times', async () => {
            const event1 = { type: 'FULL_STATE', projectId, timestamp: new Date().toISOString() };
            const event2 = { type: 'FULL_STATE', projectId, timestamp: new Date().toISOString() };

            await workflowOperator.publishEvent(event1 as any);
            await workflowOperator.publishEvent(event2 as any);

            // FULL_STATE should be published twice
            expect(mockPublishEvent).toHaveBeenCalledTimes(2);
        });
    });

    describe('handleJobCompletion', () => {
        it('should resume pipeline for normal jobs', async () => {
            mockControlPlane.getJob.mockResolvedValue({
                id: 'job-1',
                type: 'GENERATE_SCENE_VIDEO',
                state: 'COMPLETED',
                projectId: projectId,
                result: { some: 'result' }
            });
            mockCheckpointerManager.loadCheckpoint.mockResolvedValue({});
            mockCompiledGraph.getState.mockResolvedValue({ next: [], values: {}, tasks: [] });

            await handleJobCompletion('job-1', workflowOperator, mockControlPlane);

            expect(handleStream).toHaveBeenCalledWith(
                projectId,
                mockCompiledGraph,
                expect.any(Command),
                expect.anything(),
                'resumePipeline',
                mockPublishEvent
            );
        });
    });
});
