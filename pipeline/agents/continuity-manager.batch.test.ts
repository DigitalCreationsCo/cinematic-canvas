
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContinuityManagerAgent } from './continuity-manager';
import { GCPStorageManager } from '../storage-manager';
import { FrameCompositionAgent } from './frame-composition-agent';
import { Scene, Storyboard } from '../../shared/pipeline-types';
import { LlmController } from '../llm/controller';
import { QualityCheckAgent } from './quality-check-agent';

// Mocks
const mockStorageManager = {
  getGcsObjectPath: vi.fn(),
  fileExists: vi.fn(),
  buildObjectData: vi.fn((uri) => ({ storageUri: uri, publicUri: uri })),
  getLatestAttempt: vi.fn().mockReturnValue(1), // Default to attempt 1
};

const mockFrameComposer = {
  generateImage: vi.fn(),
};

const mockLlm = {} as any;
const mockQualityAgent = {} as any;

describe('ContinuityManagerAgent - generateSceneFramesBatch', () => {
  let continuityAgent: ContinuityManagerAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    continuityAgent = new ContinuityManagerAgent(
      mockLlm,
      mockLlm,
      mockFrameComposer as any,
      mockQualityAgent,
      mockStorageManager as any
    );
  });

  it('should skip generation if frames already exist in storage', async () => {
    const scenes: Scene[] = [
      { id: 1, characters: [], locationId: 'loc1', duration: 5 } as any,
    ];
    const storyboard: Storyboard = {
      scenes: scenes,
      characters: [],
      locations: [{ id: 'loc1', referenceImages: [{ storageUri: 'gs://loc1.png' }] }] as any,
    } as any;

    // Mock storage to say start and end frames exist
    mockStorageManager.getGcsObjectPath.mockReturnValue('gs://bucket/start_frame.png');
    mockStorageManager.fileExists.mockResolvedValue(true);

    const result = await continuityAgent.generateSceneFramesBatch(scenes, storyboard);

    // Should verify file existence
    expect(mockStorageManager.fileExists).toHaveBeenCalledTimes(2); // Start and End
    
    // Should NOT call generateImage
    expect(mockFrameComposer.generateImage).not.toHaveBeenCalled();

    expect(result[0].startFrame).toBeDefined();
    expect(result[0].endFrame).toBeDefined();
  });

  it('should generate frames if they do not exist in storage', async () => {
    const scenes: Scene[] = [
      { id: 2, characters: [], locationId: 'loc1', duration: 5 } as any,
    ];
    const storyboard: Storyboard = {
      scenes: scenes,
      characters: [],
      locations: [{ id: 'loc1', referenceImages: [{ storageUri: 'gs://loc1.png' }] }] as any,
    } as any;

    // Mock storage to say frames DO NOT exist
    mockStorageManager.getGcsObjectPath.mockReturnValue('gs://bucket/missing_frame.png');
    mockStorageManager.fileExists.mockResolvedValue(false);

    // Mock generation
    mockFrameComposer.generateImage.mockResolvedValue({ storageUri: 'gs://generated/frame.png' });

    const result = await continuityAgent.generateSceneFramesBatch(scenes, storyboard);

    // Should verify file existence
    expect(mockStorageManager.fileExists).toHaveBeenCalledTimes(2); // Start and End
    
    // Should call generateImage twice (start and end)
    expect(mockFrameComposer.generateImage).toHaveBeenCalledTimes(2);

    expect(result[0].startFrame?.storageUri).toBe('gs://generated/frame.png');
  });
});
