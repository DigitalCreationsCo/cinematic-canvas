
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContinuityManagerAgent } from '../continuity-manager.js';
import { FrameCompositionAgent } from '../frame-composition-agent.js';
import { GCPStorageManager } from '../../services/storage-manager.js';
import { Scene, Project } from '../../types/index.js';
import { TextModelController } from '../../lm/text-model-controller.js';

// Mocks
const mockStorageManager = {
  getObjectPath: vi.fn(),
  fileExists: vi.fn(),
  buildObjectData: vi.fn((uri) => ({ storageUri: uri, publicUri: uri })),
  getLatestAttempt: vi.fn().mockReturnValue(1),
  getGcsUrl: vi.fn(path => `gs://${path}`),
  getPublicUrl: vi.fn(path => `https://${path}`),
};

const mockFrameComposer = {
  generateImage: vi.fn(),
  generateFrameGenerationPrompt: vi.fn().mockResolvedValue('prompt'),
};

const mockLlm = {
  generateContent: vi.fn(),
} as any;
const mockQualityAgent = {} as any;
const mockAssetManager = {
  getNextVersionNumber: vi.fn().mockResolvedValue([ 1 ]),
  getBestVersion: vi.fn().mockResolvedValue([]), // No existing assets
} as any;

describe('ContinuityManagerAgent - generateSceneFramesBatch', () => {
  let manager: ContinuityManagerAgent;
  const mockSaveAssets = vi.fn();
  const mockUpdateScenes = vi.fn();
  const mockIncrementAttempt = vi.fn();
  const mockRecordMetrics = vi.fn();

  // Mock dependencies...
  const mockFrameComposer = {
    generateFrameGenerationPrompts: vi.fn(),
    generateFrames: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Initialize manager with mocked providers...
  });

  it('should resolve sequential dependencies within the same batch', async () => {
    const scenes = [
      { id: 'scene-1', transitionType: 'Cut', characterIds: [], locationId: 'loc-1', assets: {} },
      { id: 'scene-2', transitionType: 'Continuous', characterIds: [], locationId: 'loc-1', assets: {} }
    ];

    const project = { id: 'proj-1', scenes, characters: [], locations: [ { id: 'loc-1', assets: {} } ] };

    // Mock Scene 1 completing in first iteration
    mockFrameComposer.generateFrameGenerationPrompts.mockResolvedValueOnce([
      { prompt: 'prompt 1' }
    ]);

    mockFrameComposer.generateFrames.mockResolvedValueOnce(new Map([
      [ 'scene-1_scene_end_frame', { status: 'SUCCESS' } ]
    ]));

    // Mock behavior for iteration 2 (Scene 2 should now be ready)
    // Note: In reality, saveAssets would update the state.

    await manager.generateSceneFramesBatch(
      project as any,
      scenes as any,
      [ 'scene_end_frame' ],
      mockSaveAssets,
      mockUpdateScenes,
      mockIncrementAttempt,
      mockRecordMetrics
    );

    expect(mockUpdateScenes).toHaveBeenCalledWith(
      expect.arrayContaining([ 'scene-1', 'scene-2' ]),
      expect.any(Array)
    );
  });

  it('should break loop if no progress is made to prevent infinite execution', async () => {
    const scenes = [
      { id: 'scene-1', transitionType: 'Continuous', characterIds: [], locationId: 'loc-1', assets: {} }
    ];
    // Scene 1 depends on Scene 0 which doesn't exist
    const project = { id: 'proj-1', scenes, characters: [], locations: [] };

    const result = await manager.generateSceneFramesBatch(
      project as any,
      scenes as any,
      [ 'scene_start_frame' ],
      mockSaveAssets,
      mockUpdateScenes,
      mockIncrementAttempt,
      mockRecordMetrics
    );

    expect(result.data.deferredSceneIds).toContain('scene-1');
    expect(mockUpdateScenes).toHaveBeenCalled();
  });

  it('should generate frames if they do not exist in storage', async () => {
    const scenes: Scene[] = [
      { id: '2', characterIds: [], locationId: 'loc1', characters: [], location: 'loc1', duration: 5, assets: {} } as any,
    ];
    const project: Project = {
      id: 'proj1',
      metadata: {} as any,
      scenes,
      characters: [],
      locations: [ { id: 'loc1', assets: {} } as any ]
    } as any;

    // Mock storage to say frames DO NOT exist
    mockStorageManager.getObjectPath.mockReturnValue('bucket/missing_frame.png');
    mockStorageManager.fileExists.mockResolvedValue(false);

    // Mock generation
    mockFrameComposer.generateFrames.mockResolvedValue(new Map([
      [ 'scene-1_scene_end_frame', { status: 'SUCCESS' } ]
    ]));

    const saveAssets = vi.fn();
    const sendEntityUpdate = vi.fn();
    const incrementAttempt = vi.fn();
    const recordMetrics = vi.fn();

    const result = await manager.generateSceneFramesBatch(project, scenes, [ 'scene_start_frame' ], saveAssets, sendEntityUpdate, incrementAttempt, recordMetrics);

    // Should verify file existence
    expect(mockStorageManager.fileExists).toHaveBeenCalled();

    // Should call generateImage
    expect(mockFrameComposer.generateFrames).toHaveBeenCalled();
  });
});

