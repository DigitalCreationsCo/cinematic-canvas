// continuity-manager.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContinuityManagerAgent } from '../continuity-manager';
import { generateSceneFrames } from '#shared/lm/tools/scenes/generate-scene-frames.tool.js';

// Mock dependencies
vi.mock('#shared/lm/tools/scenes/generate-scene-frames.tool', () => ({
    generateSceneFrames: vi.fn(),
}));

vi.mock('#shared/lm/tools/scenes/generate-frame-generation-prompts', () => ({
    generateFrameGenerationPrompts: vi.fn().mockResolvedValue([]),
}));

describe('ContinuityManagerAgent: DAG Dependency Execution', () => {
    let agent: ContinuityManagerAgent;
    let mockSaveAssets: any;
    let mockSendUpdate: any;

    beforeEach(() => {
        mockSaveAssets = vi.fn();
        mockSendUpdate = vi.fn();

        agent = new ContinuityManagerAgent(
            {} as any, // TextModel
            {} as any, // ImageModel
            { qualityConfig: { enabled: false, maxRetries: 1 } } as any,
            {} as any,
            {} as any,
        );

        // Bypass the quality build step to strictly test the queue logic
        vi.spyOn(agent as any, 'buildSceneFrameQualityItems').mockImplementation((_, reqs) => {
            return reqs.map((r: any) => ({ request: r }));
        });
    });

    it('generates independent and dependent scenes sequentially using the local asset registry', async () => {
        // Setup 3 Scenes. Scene 2 depends on Scene 1. Scene 3 depends on Scene 2.
        const project = {
            id: "proj_1",
            scenes: [
                { id: "s1", sceneIndex: 0, transitionType: "Cut", assets: [] },
                { id: "s2", sceneIndex: 1, transitionType: "Continuous", assets: [] },
                { id: "s3", sceneIndex: 2, transitionType: "Continuous", assets: [] },
            ],
            characters: [], locations: [],
        } as any;

        const scenesToProcess = project.scenes;

        // Mock generation tool to successfully return URIs based on the requests
        (generateSceneFrames as any).mockImplementation(async ({ requests }: any) => {
            return requests.map((req: any) => ({
                success: true,
                id: req.id, sceneId: req.sceneId, framePosition: req.framePosition,
                outputs: [ { uri: `gs://bucket/generated_${req.sceneId}_${req.framePosition}.png` } ]
            }));
        });

        const result = await agent.generateSceneFramesBatch(
            project, scenesToProcess, [ "scene_start_frame", "scene_end_frame" ],
            mockSaveAssets, mockSendUpdate, vi.fn(), { userId: 'u1', teamId: 't1' }
        );

        // Iteration 1 evaluates all.
        // s1.start, s1.end, s2.end, s3.end are pushed.
        // s2.start defers (waiting for s1.end). s3.start defers (waiting for s2.end).

        // Assert no scenes were ultimately deferred back to the queue because 
        // the local memory cache updated them dynamically.
        expect(result.data.deferredSceneIds).toHaveLength(0);

        // verify the dependency linking occurred
        expect(mockSaveAssets).toHaveBeenCalledWith(
            expect.objectContaining({ sceneIds: [ "s2" ] }),
            [ "scene_start_frame" ], "image", [ "gs://bucket/generated_s1_end.png" ],
            expect.anything(), true
        );

        expect(mockSaveAssets).toHaveBeenCalledWith(
            expect.objectContaining({ sceneIds: [ "s3" ] }),
            [ "scene_start_frame" ], "image", [ "gs://bucket/generated_s2_end.png" ],
            expect.anything(), true
        );
    });

    it('returns deferred scene IDs if a dependency fails to generate', async () => {
        const project = {
            id: "proj_1",
            scenes: [
                { id: "s1", sceneIndex: 0, transitionType: "Cut", assets: [] },
                { id: "s2", sceneIndex: 1, transitionType: "Continuous", assets: [] },
            ],
            characters: [], locations: [],
        } as any;

        // Force upstream failure
        (generateSceneFrames as any).mockImplementation(async ({ requests }: any) => {
            return requests.map((req: any) => ({
                success: false, id: req.id, sceneId: req.sceneId, framePosition: req.framePosition, error: new Error('Simulated failure')
            }));
        });

        const result = await agent.generateSceneFramesBatch(
            project, project.scenes, [ "scene_start_frame", "scene_end_frame" ],
            mockSaveAssets, mockSendUpdate, vi.fn(), { userId: 'u1', teamId: 't1' }
        );

        // s2 should be deferred because s1 failed to produce an end_frame
        expect(result.data.deferredSceneIds).toContain("s2");
    });
});