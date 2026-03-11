import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContinuityManagerAgent } from '../continuity-manager.js';
import { TextModelController } from '../../lm/text-model-controller.js';
import { FrameCompositionAgent } from '../frame-composition-agent.js';
import { QualityCheckAgent } from '../quality-check-agent.js';
import { GCPStorageManager } from '../../services/storage-manager.js';
import { AssetVersionManager } from '../../services/asset-version-manager.js';
import { Project, Scene, AssetKey } from '../../types/index.js';
import * as assetsUtils from '../../utils/assets-utils.js';

// Mock all dependencies
vi.mock('../../../src/shared/lm/text-model-controller.js');
vi.mock('../../../src/shared/agents/frame-composition-agent.js');
vi.mock('../../../src/shared/agents/quality-check-agent.js');
vi.mock('../../../src/shared/services/storage-manager.js');
vi.mock('../../../src/shared/services/asset-version-manager.js');

describe('ContinuityManagerAgent Asset Management', () => {
  let continuityAgent: ContinuityManagerAgent;
  let mockTextModel: TextModelController;
  let mockImageModel: TextModelController;
  let mockFrameComposer: FrameCompositionAgent;
  let mockQualityAgent: QualityCheckAgent;
  let mockStorageManager: GCPStorageManager;
  let mockAssetManager: AssetVersionManager;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTextModel = {
      generateContent: vi.fn(),
      textModel: 'text-model-1',
      imageModel: 'image-model-1',
    } as any;

    mockImageModel = {
      generateContent: vi.fn(),
      generateBatchImages: vi.fn(),
      textModel: 'text-model-2',
      imageModel: 'image-model-2',
    } as any;

    mockFrameComposer = {
      generateFrameGenerationPrompts: vi.fn().mockResolvedValue([]),
      generateFrameGenerationPrompt: vi.fn(),
      generateImage: vi.fn(),
      generateFrames: vi.fn().mockResolvedValue(new Map()),
    } as any;

    mockQualityAgent = {
      qualityConfig: { safetyRetries: 3, maxRetries: 5 },
    } as any;

    mockStorageManager = {
      getObjectPath: vi.fn(),
      fileExists: vi.fn(),
      uploadBuffer: vi.fn(),
      getGcsUrl: vi.fn(),
      getPublicUrl: vi.fn(),
      processBatchImageResult: vi.fn(),
      getProjectPath: vi.fn(),
    } as any;

    mockAssetManager = {
      createVersionedAssets: vi.fn(),
      getNextVersionNumber: vi.fn(),
      getBestVersion: vi.fn(),
    } as any;

    continuityAgent = new ContinuityManagerAgent(
      mockTextModel,
      mockImageModel,
      mockFrameComposer,
      mockQualityAgent,
      mockStorageManager,
      mockAssetManager
    );
  });

  describe('generateSceneFramesBatch', () => {
    it('should call sendEntityUpdate with complete status on success', async () => {
      const project: Project = {
        id: 'proj-1',
        scenes: [
          {
            id: 'scene-1',
            sceneIndex: 0,
            characterIds: [ 'char-1' ],
            locationId: 'loc-1',
            projectId: 'proj-1',
            name: 'Scene 1',
            description: 'Test scene',
            startTime: 0,
            endTime: 10,
            duration: 10,
            type: 'action',
            lyrics: '',
            musicalDescription: '',
            musicChange: '',
            intensity: 'high',
            mood: 'dramatic',
            tempo: 'fast',
            audioEvidence: '',
            transientImpact: '',
            audioSync: '',
            transitionType: 'cut',
            shotType: 'medium',
            cameraAngle: 'eye-level',
            cameraMovement: 'static',
            composition: { type: 'rule-of-thirds' },
            lighting: { type: 'dramatic' },
            continuityNotes: [],
            characterReferenceIds: [ 'char-ref-1' ],
            locationReferenceId: 'loc-ref-1',
            status: 'pending',
            progressMessage: ''
          }
        ],
        characters: [ { id: 'char-1' } as any ],
        locations: [ { id: 'loc-1' } as any ],
        generationRules: [ 'rule1', 'rule2' ]
      } as any;

      const scenes = [ project.scenes[ 0 ] ];
      const scopeAssetKeys: ('scene_start_frame' | 'scene_end_frame')[] = [ 'scene_start_frame', 'scene_end_frame' ];

      const mockSaveAssets = vi.fn();
      const mockSendUpdateScenes = vi.fn();
      const mockIncrementAttempt = vi.fn();
      const mockRecordMetrics = vi.fn();

      // Mock generateFrames to return successful results
      vi.mocked(mockFrameComposer.generateFrames).mockResolvedValue(new Map([
        [ 'scene-1_scene_start_frame', { success: true, url: 'url1' } ],
        [ 'scene-1_scene_end_frame', { success: true, url: 'url2' } ]
      ]));

      await continuityAgent.generateSceneFramesBatch(
        project,
        scenes,
        scopeAssetKeys,
        mockSaveAssets,
        mockSendUpdateScenes,
        mockIncrementAttempt,
        mockRecordMetrics
      );

      // Verify sendEntityUpdate was called with complete status
      expect(mockSendUpdateScenes).toHaveBeenCalled();
      const updateCall = mockSendUpdateScenes.mock.calls[ 0 ];
      expect(updateCall[ 0 ]).toEqual([ 'scene-1' ]);
      const updatedScenes = updateCall[ 1 ];
      expect(updatedScenes[ 0 ].status).toBe('complete');
      expect(updatedScenes[ 0 ].progressMessage).toBe('');
    });

    it('should call sendEntityUpdate with error status on failure', async () => {
      const project: Project = {
        id: 'proj-1',
        scenes: [
          {
            id: 'scene-1',
            sceneIndex: 0,
            characterIds: [],
            locationId: 'loc-1',
            projectId: 'proj-1',
            name: 'Scene 1',
            description: 'Test scene',
            startTime: 0,
            endTime: 10,
            duration: 10,
            type: 'action',
            lyrics: '',
            musicalDescription: '',
            musicChange: '',
            intensity: 'high',
            mood: 'dramatic',
            tempo: 'fast',
            audioEvidence: '',
            transientImpact: '',
            audioSync: '',
            transitionType: 'cut',
            shotType: 'medium',
            cameraAngle: 'eye-level',
            cameraMovement: 'static',
            composition: { type: 'rule-of-thirds' },
            lighting: { type: 'dramatic' },
            continuityNotes: [],
            characterReferenceIds: [],
            locationReferenceId: 'loc-ref-1',
            status: 'pending',
            progressMessage: ''
          }
        ],
        characters: [],
        locations: [ { id: 'loc-1' } as any ],
        generationRules: []
      } as any;

      const scenes = [ project.scenes[ 0 ] ];
      const scopeAssetKeys: ('scene_start_frame' | 'scene_end_frame')[] = [ 'scene_start_frame' ];

      const mockSaveAssets = vi.fn();
      const mockSendUpdateScenes = vi.fn();
      const mockIncrementAttempt = vi.fn();
      const mockRecordMetrics = vi.fn();

      // Mock generateFrames to return errors
      vi.mocked(mockFrameComposer.generateFrames).mockResolvedValue(new Map([
        [ 'scene-1_scene_start_frame', new Error('Generation failed') ]
      ]));

      const result = await continuityAgent.generateSceneFramesBatch(
        project,
        scenes,
        scopeAssetKeys,
        mockSaveAssets,
        mockSendUpdateScenes,
        mockIncrementAttempt,
        mockRecordMetrics
      );

      // Should call sendEntityUpdate with error status
      expect(mockSendUpdateScenes).toHaveBeenCalled();
      const updateCall = mockSendUpdateScenes.mock.calls[ 0 ];
      const updatedScenes = updateCall[ 1 ];
      expect(updatedScenes[ 0 ].status).toBe('error');
      expect(updatedScenes[ 0 ].progressMessage).toContain('Frame generation failed');
    });

    it('should defer scene generation when transitionType is Continuous and previous scene end-frame is missing', async () => {
      vi.spyOn(assetsUtils, 'getAllBestAssets').mockReturnValue({});
      // Scene 1 - has no end frame
      const scene1 = {
        id: 'scene-1',
        sceneIndex: 0,
        characterIds: [],
        locationId: 'loc-1',
        projectId: 'proj-1',
        name: 'Scene 1',
        description: 'Test scene 1',
        startTime: 0,
        endTime: 10,
        duration: 10,
        type: 'action',
        lyrics: '',
        musicalDescription: '',
        musicChange: '',
        intensity: 'high',
        mood: 'dramatic',
        tempo: 'fast',
        audioEvidence: '',
        transientImpact: '',
        audioSync: '',
        transitionType: 'cut',
        shotType: 'medium',
        cameraAngle: 'eye-level',
        cameraMovement: 'static',
        composition: { type: 'rule-of-thirds' },
        lighting: { type: 'dramatic' },
        continuityNotes: [],
        characterReferenceIds: [],
        locationReferenceId: 'loc-ref-1',
        status: 'pending',
        progressMessage: '',
        assets: {} // No assets
      };

      // Scene 2 - requests Continuous transition
      const scene2 = {
        id: 'scene-2',
        sceneIndex: 1,
        characterIds: [],
        locationId: 'loc-1',
        projectId: 'proj-1',
        name: 'Scene 2',
        description: 'Test scene 2',
        startTime: 10,
        endTime: 20,
        duration: 10,
        type: 'action',
        lyrics: '',
        musicalDescription: '',
        musicChange: '',
        intensity: 'high',
        mood: 'dramatic',
        tempo: 'fast',
        audioEvidence: '',
        transientImpact: '',
        audioSync: '',
        transitionType: 'Continuous', // Requesting continuous transition
        shotType: 'medium',
        cameraAngle: 'eye-level',
        cameraMovement: 'static',
        composition: { type: 'rule-of-thirds' },
        lighting: { type: 'dramatic' },
        continuityNotes: [],
        characterReferenceIds: [],
        locationReferenceId: 'loc-ref-1',
        status: 'pending',
        progressMessage: '',
        assets: {}
      };

      const project: Project = {
        id: 'proj-1',
        scenes: [ scene1, scene2 ],
        characters: [],
        locations: [ { id: 'loc-1' } as any ],
        generationRules: []
      } as any;

      const scenes = [ scene2 ]; // Only process scene 2
      const scopeAssetKeys: ('scene_start_frame' | 'scene_end_frame')[] = [ 'scene_start_frame' ];

      const mockSaveAssets = vi.fn();
      const mockSendUpdateScenes = vi.fn();
      const mockIncrementAttempt = vi.fn();
      const mockRecordMetrics = vi.fn();

      const result = await continuityAgent.generateSceneFramesBatch(
        project,
        scenes,
        scopeAssetKeys,
        mockSaveAssets,
        mockSendUpdateScenes,
        mockIncrementAttempt,
        mockRecordMetrics
      );

      // Should return deferredSceneIds
      expect(result.data.deferredSceneIds).toContain('scene-2');

      // Should NOT call generateFrameGenerationPrompts since scene was deferred
      expect(mockFrameComposer.generateFrameGenerationPrompts).not.toHaveBeenCalled();

      // Should send update about the deferral
      expect(mockSendUpdateScenes).toHaveBeenCalled();
      const updateCall = mockSendUpdateScenes.mock.calls[ 0 ];
      expect(updateCall[ 0 ]).toEqual([ 'scene-2' ]);
      expect(updateCall[ 1 ][ 0 ].progressMessage).toContain('Waiting for previous scene');
    });

    it('should link previous scene end-frame when transitionType is Continuous and dependency exists', async () => {
      const prevEndFrameUrl = 'gs://bucket/proj-1/scene-1/end-frame.png';
      vi.spyOn(assetsUtils, 'getAllBestAssets').mockReturnValue({
        'scene_end_frame': { data: prevEndFrameUrl }
      });
      // Scene 1 - has end frame
      const scene1 = {
        id: 'scene-1',
        sceneIndex: 0,
        characterIds: [],
        locationId: 'loc-1',
        projectId: 'proj-1',
        name: 'Scene 1',
        description: 'Test scene 1',
        startTime: 0,
        endTime: 10,
        duration: 10,
        type: 'action',
        lyrics: '',
        musicalDescription: '',
        musicChange: '',
        intensity: 'high',
        mood: 'dramatic',
        tempo: 'fast',
        audioEvidence: '',
        transientImpact: '',
        audioSync: '',
        transitionType: 'cut',
        shotType: 'medium',
        cameraAngle: 'eye-level',
        cameraMovement: 'static',
        composition: { type: 'rule-of-thirds' },
        lighting: { type: 'dramatic' },
        continuityNotes: [],
        characterReferenceIds: [],
        locationReferenceId: 'loc-ref-1',
        status: 'pending',
        progressMessage: '',
        assets: {
        }
      };

      // Scene 2 - requests Continuous transition
      const scene2 = {
        id: 'scene-2',
        sceneIndex: 1,
        characterIds: [],
        locationId: 'loc-1',
        projectId: 'proj-1',
        name: 'Scene 2',
        description: 'Test scene 2',
        startTime: 10,
        endTime: 20,
        duration: 10,
        type: 'action',
        lyrics: '',
        musicalDescription: '',
        musicChange: '',
        intensity: 'high',
        mood: 'dramatic',
        tempo: 'fast',
        audioEvidence: '',
        transientImpact: '',
        audioSync: '',
        transitionType: 'Continuous', // Requesting continuous transition
        shotType: 'medium',
        cameraAngle: 'eye-level',
        cameraMovement: 'static',
        composition: { type: 'rule-of-thirds' },
        lighting: { type: 'dramatic' },
        continuityNotes: [],
        characterReferenceIds: [],
        locationReferenceId: 'loc-ref-1',
        status: 'pending',
        progressMessage: '',
        assets: {}
      };

      const project: Project = {
        id: 'proj-1',
        scenes: [ scene1, scene2 ],
        characters: [],
        locations: [ { id: 'loc-1' } as any ],
        generationRules: []
      } as any;

      const scenes = [ scene2 ]; // Only process scene 2
      const scopeAssetKeys: ('scene_start_frame' | 'scene_end_frame')[] = [ 'scene_start_frame' ];

      const mockSaveAssets = vi.fn();
      const mockSendUpdateScenes = vi.fn();
      const mockIncrementAttempt = vi.fn();
      const mockRecordMetrics = vi.fn();

      const result = await continuityAgent.generateSceneFramesBatch(
        project,
        scenes,
        scopeAssetKeys,
        mockSaveAssets,
        mockSendUpdateScenes,
        mockIncrementAttempt,
        mockRecordMetrics
      );

      // Should link the previous scene's end frame
      expect(mockSaveAssets).toHaveBeenCalledWith(
        { projectId: 'proj-1', sceneIds: [ 'scene-2' ] },
        [ 'scene_start_frame' ],
        'image',
        [ prevEndFrameUrl ],
        expect.any(Array),
        true
      );

      // Should NOT defer since the dependency exists
      expect(result.data.deferredSceneIds).toBeUndefined();

      // Should NOT call generateFrameGenerationPrompts since frame was linked
      expect(mockFrameComposer.generateFrameGenerationPrompts).not.toHaveBeenCalled();
    });
  });
});
