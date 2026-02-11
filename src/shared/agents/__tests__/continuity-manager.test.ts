import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContinuityManagerAgent } from '../../../src/shared/agents/continuity-manager.js';
import { TextModelController } from '../../../src/shared/lm/text-model-controller.js';
import { FrameCompositionAgent } from '../../../src/shared/agents/frame-composition-agent.js';
import { QualityCheckAgent } from '../../../src/shared/agents/quality-check-agent.js';
import { GCPStorageManager } from '../../../src/shared/services/storage-manager.js';
import { AssetVersionManager } from '../../../src/shared/services/asset-version-manager.js';
import { Project, Scene, AssetKey } from '../../../src/shared/types/index.js';

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
      generateFrameGenerationPrompt: vi.fn(),
      generateImage: vi.fn(),
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
      processImageBatchResults: vi.fn(),
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
    it('should always create new versions without existence checks', async () => {
      const project: Project = {
        id: 'proj-1',
        scenes: [
          {
            id: 'scene-1',
            sceneIndex: 0,
            characterIds: ['char-1'],
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
            characterReferenceIds: ['char-ref-1'],
            locationReferenceId: 'loc-ref-1',
            status: 'pending',
            progressMessage: ''
          }
        ],
        characters: [{ id: 'char-1' } as any],
        locations: [{ id: 'loc-1' } as any],
        generationRules: ['rule1', 'rule2']
      } as any;

      const scenes = [project.scenes[0]];
      const scopeAssetKeys: ('scene_start_frame' | 'scene_end_frame')[] = ['scene_start_frame', 'scene_end_frame'];
      
      const mockSaveAssets = vi.fn();
      const mockSendUpdateScenes = vi.fn();
      const mockIncrementAttempt = vi.fn();
      const mockRecordMetrics = vi.fn();

      // Mock asset manager to return existing assets (should not prevent generation)
      vi.mocked(mockAssetManager.getBestVersion).mockResolvedValue([{
        version: 1,
        data: 'existing-url',
        type: 'image',
        metadata: { model: 'old-model' },
        createdAt: new Date()
      }]);

      vi.mocked(mockAssetManager.getNextVersionNumber).mockResolvedValue([2]);

      vi.mocked(mockFrameComposer.generateFrameGenerationPrompt).mockResolvedValue('test prompt');

      // Mock successful batch generation
      vi.mocked(mockImageModel.generateBatchImages).mockResolvedValue({
        dest: { gcsUri: 'gs://test-bucket/results/' }
      });

      vi.mocked(mockStorageManager.processImageBatchResults).mockResolvedValue([
        { custom_id: 'scene-1', status: 'SUCCESS', src: 'new-url-1' },
        { custom_id: 'scene-1', status: 'SUCCESS', src: 'new-url-2' }
      ]);

      vi.mocked(mockAssetManager.createVersionedAssets).mockResolvedValue([
        { head: 2, best: 2, versions: [] },
        { head: 2, best: 2, versions: [] }
      ]);

      await continuityAgent.generateSceneFramesBatch(
        project,
        scenes,
        scopeAssetKeys,
        mockSaveAssets,
        mockSendUpdateScenes,
        mockIncrementAttempt,
        mockRecordMetrics
      );

      // Should NOT check for existing assets (reverted behavior)
      expect(vi.mocked(mockAssetManager.getBestVersion)).not.toHaveBeenCalled();
      
      // Should always proceed with generation
      expect(vi.mocked(mockAssetManager.getNextVersionNumber)).toHaveBeenCalledTimes(2); // Once per asset key
      expect(vi.mocked(mockImageModel.generateBatchImages)).toHaveBeenCalled();
    });

    it('should handle polymorphic asset keys correctly', async () => {
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
        locations: [{ id: 'loc-1' } as any],
        generationRules: []
      } as any;

      const scenes = [project.scenes[0]];
      const scopeAssetKeys: ('scene_start_frame' | 'scene_end_frame')[] = ['scene_start_frame', 'scene_end_frame'];
      
      const mockSaveAssets = vi.fn();
      const mockSendUpdateScenes = vi.fn();
      const mockIncrementAttempt = vi.fn();
      const mockRecordMetrics = vi.fn();

      vi.mocked(mockAssetManager.getNextVersionNumber).mockResolvedValue([1, 1]);
      vi.mocked(mockFrameComposer.generateFrameGenerationPrompt).mockResolvedValue('test prompt');

      vi.mocked(mockImageModel.generateBatchImages).mockResolvedValue({
        dest: { gcsUri: 'gs://test-bucket/results/' }
      });

      vi.mocked(mockStorageManager.processImageBatchResults).mockResolvedValue([
        { custom_id: 'scene-1', status: 'SUCCESS', src: 'start-frame-url' },
        { custom_id: 'scene-1', status: 'SUCCESS', src: 'end-frame-url' }
      ]);

      vi.mocked(mockAssetManager.createVersionedAssets).mockResolvedValue([
        { head: 1, best: 1, versions: [] },
        { head: 1, best: 1, versions: [] }
      ]);

      await continuityAgent.generateSceneFramesBatch(
        project,
        scenes,
        scopeAssetKeys,
        mockSaveAssets,
        mockSendUpdateScenes,
        mockIncrementAttempt,
        mockRecordMetrics
      );

      // Verify saveAssets was called with correct asset keys
      expect(mockSaveAssets).toHaveBeenCalledWith(
        { projectId: 'proj-1', sceneIds: ['scene-1'] },
        ['scene_start_frame', 'scene_end_frame'],
        'image',
        ['start-frame-url', 'end-frame-url'],
        expect.arrayContaining([
          expect.objectContaining({ prompt: 'test prompt' }),
          expect.objectContaining({ prompt: 'test prompt' })
        ]),
        true
      );

      // Verify metrics recorded with correct asset keys
      expect(mockRecordMetrics).toHaveBeenCalledWith([
        expect.objectContaining({ assetKey: 'scene_start_frame' }),
        expect.objectContaining({ assetKey: 'scene_end_frame' })
      ]);
    });

    it('should handle batch generation failures', async () => {
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
        locations: [{ id: 'loc-1' } as any],
        generationRules: []
      } as any;

      const scenes = [project.scenes[0]];
      const scopeAssetKeys: ('scene_start_frame' | 'scene_end_frame')[] = ['scene_start_frame'];
      
      const mockSaveAssets = vi.fn();
      const mockSendUpdateScenes = vi.fn();
      const mockIncrementAttempt = vi.fn();
      const mockRecordMetrics = vi.fn();

      vi.mocked(mockAssetManager.getNextVersionNumber).mockResolvedValue([1]);
      vi.mocked(mockFrameComposer.generateFrameGenerationPrompt).mockResolvedValue('test prompt');

      vi.mocked(mockImageModel.generateBatchImages).mockResolvedValue({
        dest: { gcsUri: 'gs://test-bucket/results/' }
      });

      // Mock batch failure
      vi.mocked(mockStorageManager.processImageBatchResults).mockResolvedValue([
        { custom_id: 'scene-1', status: 'FAILED', error: { message: 'Generation failed' } }
      ]);

      await expect(continuityAgent.generateSceneFramesBatch(
        project,
        scenes,
        scopeAssetKeys,
        mockSaveAssets,
        mockSendUpdateScenes,
        mockIncrementAttempt,
        mockRecordMetrics
      )).rejects.toThrow('Batch generation failed for 1 scene(s): scene-1');

      // Should call increment attempt for failed items
      expect(mockIncrementAttempt).toHaveBeenCalledWith('Generation failed', 'BACKOFF_RETRY');
    });
  });
});
