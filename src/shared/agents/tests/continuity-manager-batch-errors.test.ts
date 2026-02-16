import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContinuityManagerAgent } from '../continuity-manager.js';
import { Scene, Project } from '../../types/index.js';

// Mocks
const mockStorageManager = {
    getObjectPath: vi.fn(),
    fileExists: vi.fn(),
    getGcsUrl: vi.fn(path => `gs://${path}`),
    getPublicUrl: vi.fn(path => `https://${path}`),
    processBatchImageResult: vi.fn(),
    getProjectPath: vi.fn(),
} as any;

const mockFrameComposer = {
    generateImage: vi.fn(),
    generateFrameGenerationPrompt: vi.fn().mockResolvedValue('test prompt'),
} as any;

const mockLlm = {
    generateContent: vi.fn(),
} as any;

const mockQualityAgent = {} as any;

const mockAssetManager = {
    getNextVersionNumber: vi.fn().mockResolvedValue([ 1 ]),
    getBestVersion: vi.fn().mockResolvedValue([]),
} as any;

const mockImageModel = {
    generateBatchImages: vi.fn(),
} as any;

describe('ContinuityManagerAgent - Batch Frame Generation Error Handling', () => {
    let continuityAgent: ContinuityManagerAgent;

    beforeEach(() => {
        vi.clearAllMocks();
        continuityAgent = new ContinuityManagerAgent(
            mockLlm,
            mockImageModel,
            mockFrameComposer,
            mockQualityAgent,
            mockStorageManager,
            mockAssetManager
        );
    });

    describe('Batch Failure Handling', () => {
        it('should throw error when batch generation fails for some scenes', async () => {
            const scenes: Scene[] = [
                {
                    id: 'scene-1',
                    sceneIndex: 0,
                    characterIds: [],
                    locationId: 'loc1',
                    projectId: 'proj1',
                    assets: {}
                } as any,
                {
                    id: 'scene-2',
                    sceneIndex: 1,
                    characterIds: [],
                    locationId: 'loc1',
                    projectId: 'proj1',
                    assets: {}
                } as any,
            ];

            const project: Project = {
                id: 'proj1',
                metadata: {} as any,
                scenes,
                characters: [],
                locations: [ { id: 'loc1', assets: {} } as any ],
                generationRules: []
            } as any;

            // Mock batch job that returns partial failures
            mockImageModel.generateBatchImages.mockResolvedValue({
                name: 'batch-job-123',
                dest: { gcsUri: 'gs://bucket/output.jsonl' }
            });

            mockStorageManager.processBatchImageResult.mockResolvedValue([
                {
                    custom_id: 'scene-1',
                    version: 1,
                    status: 'SUCCESS',
                    src: 'gs://bucket/scene-1-frame.png'
                },
                {
                    custom_id: 'scene-2',
                    version: 1,
                    status: 'FAILED',
                    error: { message: 'Generation failed' }
                }
            ]);

            const saveAssets = vi.fn();
            const updateScene = vi.fn();
            const incrementAttempt = vi.fn();
            const recordMetrics = vi.fn();

            // Should throw error due to batch failure
            await expect(
                continuityAgent.generateSceneFramesBatch(
                    project,
                    scenes,
                    [ 'scene_start_frame' ],
                    saveAssets,
                    updateScene,
                    incrementAttempt,
                    recordMetrics
                )
            ).rejects.toThrow(/Batch generation failed for 1 scene\(s\): scene-2/);

            // Should have called incrementAttempt for the failure
            expect(incrementAttempt).toHaveBeenCalledWith(
                'Generation failed',
                'BACKOFF_RETRY'
            );
        });

        it('should only update successfully processed scenes', async () => {
            const scenes: Scene[] = [
                {
                    id: 'scene-1',
                    sceneIndex: 0,
                    characterIds: [],
                    locationId: 'loc1',
                    projectId: 'proj1',
                    assets: {}
                } as any,
            ];

            const project: Project = {
                id: 'proj1',
                metadata: {} as any,
                scenes,
                characters: [],
                locations: [ { id: 'loc1', assets: {} } as any ],
                generationRules: []
            } as any;

            mockImageModel.generateBatchImages.mockResolvedValue({
                name: 'batch-job-123',
                dest: { gcsUri: 'gs://bucket/output.jsonl' }
            });

            mockStorageManager.processBatchImageResult.mockResolvedValue([
                {
                    custom_id: 'scene-1',
                    version: 1,
                    status: 'SUCCESS',
                    src: 'gs://bucket/scene-1-frame.png'
                }
            ]);

            const saveAssets = vi.fn();
            const sendUpdateScenes = vi.fn();
            const incrementAttempt = vi.fn();
            const recordMetrics = vi.fn();

            await continuityAgent.generateSceneFramesBatch(
                project,
                scenes,
                [ 'scene_start_frame' ],
                saveAssets,
                sendUpdateScenes,
                incrementAttempt,
                recordMetrics
            );

            // Should only update the successful scene
            expect(sendUpdateScenes).toHaveBeenCalledWith(
                [ 'scene-1' ],
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 'scene-1',
                        status: 'complete'
                    })
                ])
            );
        });
    });

    describe('Safe Asset Data Access', () => {
        it('should handle missing previous scene assets gracefully', async () => {
            const scenes: Scene[] = [
                {
                    id: 'scene-1',
                    sceneIndex: 0,
                    characterIds: [],
                    locationId: 'loc1',
                    projectId: 'proj1',
                    assets: {} // No assets
                } as any,
            ];

            const project: Project = {
                id: 'proj1',
                metadata: {} as any,
                scenes,
                characters: [],
                locations: [ { id: 'loc1', assets: {} } as any ],
                generationRules: []
            } as any;

            mockImageModel.generateBatchImages.mockResolvedValue({
                name: 'batch-job-123',
                dest: { gcsUri: 'gs://bucket/output.jsonl' }
            });

            mockStorageManager.processBatchImageResult.mockResolvedValue([
                {
                    custom_id: 'scene-1',
                    version: 1,
                    status: 'SUCCESS',
                    src: 'gs://bucket/scene-1-frame.png'
                }
            ]);

            const saveAssets = vi.fn();
            const updateScene = vi.fn();
            const incrementAttempt = vi.fn();
            const recordMetrics = vi.fn();

            // Should not throw error even with missing assets
            await expect(
                continuityAgent.generateSceneFramesBatch(
                    project,
                    scenes,
                    [ 'scene_start_frame' ],
                    saveAssets,
                    updateScene,
                    incrementAttempt,
                    recordMetrics
                )
            ).resolves.toBeDefined();
        });

        it('should handle undefined asset data without crashing', async () => {
            const scenes: Scene[] = [
                {
                    id: 'scene-2',
                    sceneIndex: 1,
                    characterIds: [],
                    locationId: 'loc1',
                    projectId: 'proj1',
                    assets: {
                        scene_start_frame: {
                            head: 0,
                            best: 0,
                            versions: [] // Empty versions
                        }
                    }
                } as any,
            ];

            const project: Project = {
                id: 'proj1',
                metadata: {} as any,
                scenes: [
                    {
                        id: 'scene-1',
                        assets: {} // Previous scene with no assets
                    } as any,
                    ...scenes
                ],
                characters: [],
                locations: [ { id: 'loc1', assets: {} } as any ],
                generationRules: []
            } as any;

            mockImageModel.generateBatchImages.mockResolvedValue({
                name: 'batch-job-123',
                dest: { gcsUri: 'gs://bucket/output.jsonl' }
            });

            mockStorageManager.processBatchImageResult.mockResolvedValue([
                {
                    custom_id: 'scene-2',
                    version: 1,
                    status: 'SUCCESS',
                    src: 'gs://bucket/scene-2-frame.png'
                }
            ]);

            const saveAssets = vi.fn();
            const updateScene = vi.fn();
            const incrementAttempt = vi.fn();
            const recordMetrics = vi.fn();

            // Should handle undefined data gracefully
            await expect(
                continuityAgent.generateSceneFramesBatch(
                    project,
                    scenes,
                    [ 'scene_end_frame' ], // End frame needs start frame data
                    saveAssets,
                    updateScene,
                    incrementAttempt,
                    recordMetrics
                )
            ).resolves.toBeDefined();
        });
    });
});
