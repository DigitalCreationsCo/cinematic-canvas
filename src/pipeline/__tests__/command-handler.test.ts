import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineCommandHandler } from '../command-handler.js';
import { JobControlPlane } from '../../shared/services/job-control-plane.js';
import { ProjectRepository } from '../../shared/services/project-repository.js';
import { AssetVersionManager } from '../../shared/services/asset-version-manager.js';

vi.mock('../../shared/db/index.js');
vi.mock('../../shared/services/job-control-plane.js');
vi.mock('../../shared/services/project-repository.js');
vi.mock('../../shared/services/asset-version-manager.js', () => {
    return {
        AssetVersionManager: class {
            setBestVersion = vi.fn().mockResolvedValue([ { version: 5, data: 'url' } ]);
        }
    };
});

describe('PipelineCommandHandler Integration', () => {
    let mockJobControlPlane: any;
    let mockPublishEvent: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockJobControlPlane = {
            createJob: vi.fn().mockResolvedValue({ jobId: 'job-123' }),
            uniqueKey: vi.fn().mockReturnValue('unique-key')
        };
        mockPublishEvent = vi.fn().mockResolvedValue(undefined);
    });

    it('handleRegenerateScene should create a GENERATE_SCENE_VIDEO job', async () => {
        const cmd = {
            projectId: 'proj-1',
            payload: { sceneId: 'scene-1', promptModification: 'test' }
        };
        await PipelineCommandHandler.handleRegenerateScene(cmd as any, mockJobControlPlane);
        expect(mockJobControlPlane.createJob).toHaveBeenCalledWith(expect.objectContaining({
            type: 'GENERATE_SCENE_VIDEO',
            payload: { sceneId: 'scene-1', overridePrompt: 'test' }
        }));
    });

    it('handleGenerateSceneFrames should create a GENERATE_SCENE_FRAMES job', async () => {
        const cmd = {
            projectId: 'proj-1',
            payload: { sceneIds: [ 'scene-1' ], promptModifications: [ 'mod1' ] }
        };
        await PipelineCommandHandler.handleGenerateSceneFrames(cmd as any, mockJobControlPlane);
        expect(mockJobControlPlane.createJob).toHaveBeenCalledWith(expect.objectContaining({
            type: 'GENERATE_SCENE_FRAMES'
        }));
    });

    it('handleUpdateAsset should promote version and emit ENTITY_UPDATED event', async () => {
        const cmd = {
            projectId: 'proj-1',
            payload: { scene: { id: 'scene-1' }, assetKey: 'scene_video', version: 5 }
        };
        await PipelineCommandHandler.handleUpdateAsset(cmd as any, mockPublishEvent);

        expect(mockPublishEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: "ENTITY_UPDATED",
            projectId: "proj-1",
            payload: [
                {
                    entityId: "scene-1",
                    entityType: "scene",
                    entity: {},
                    assets: {
                        scene_video: { version: 5, data: "url" }
                    }
                }
            ]
        }));
    });
});
