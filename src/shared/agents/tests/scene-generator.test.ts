import { SceneGeneratorAgent } from '../scene-generator.js';
import { GCPStorageManager } from '../../services/storage-manager.js';
import { VideoModelController } from '../../lm/video-model-controller.js';
import { QualityCheckAgent } from '../quality-check-agent.js';
import { Scene } from '../../types/index.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies
class MockStorageManager {
  getObjectPath(params: any): string {
    return `gcs://bucket/${params.type}/${params.sceneId}/${params.version}`;
  }

  getObjectMimeType(uri: string): Promise<string> {
    return Promise.resolve('video/mp4');
  }
}

class MockVideoModelController {
  async generateVideos(params: any): Promise<any> {
    return { videos: [{ url: 'generated-video.mp4' }] };
  }
}

class MockQualityCheckAgent {
    qualityConfig = { enabled: true, maxRetries: 1 };
    evaluateScene = vi.fn().mockResolvedValue({ score: 1, grade: 'A', reasoning: 'Pass', pass: true });
    logAttemptResult = vi.fn();
    calculateOverallScore = vi.fn().mockReturnValue(1);
}

describe('SceneGeneratorAgent Asset Access Patterns', () => {
  let sceneGenerator: SceneGeneratorAgent;
  let mockStorageManager: MockStorageManager;
  let mockVideoModel: MockVideoModelController;
  let mockQualityAgent: MockQualityCheckAgent;

  beforeEach(() => {
    mockStorageManager = new MockStorageManager();
    mockVideoModel = new MockVideoModelController();
    mockQualityAgent = new MockQualityCheckAgent();
    
    sceneGenerator = new SceneGeneratorAgent(
      mockVideoModel as any,
      mockQualityAgent as any,
      mockStorageManager as any,
      vi.fn() as any
    );
  });

  describe('generateSceneWithQualityCheck', () => {
    it('should handle scene generation with proper asset access', async () => {
      const scene: Scene = {
        id: 'scene-1',
        description: 'Test scene',
        lighting: { type: 'natural', intensity: 0.8 },
        characterIds: ['char-1'],
        assets: {}
      } as any;

      const startFrame = {
        referenceImage: {
          gcsUri: 'start-frame.jpg',
          mimeType: 'image/jpeg'
        }
      };

      // Mock the internal call to generateSceneWithSafetyRetry
      const generateSceneWithSafetyRetrySpy = vi.spyOn(sceneGenerator as any, 'generateSceneWithSafetyRetry').mockResolvedValue({
        scene,
        videoUrl: 'test-video-url',
        enhancedPrompt: 'test prompt'
      });

      const result = await sceneGenerator.generateSceneWithQualityCheck({
        scene,
        enhancedPrompt: 'test prompt',
        sceneCharacters: [],
        sceneLocation: {} as any,
        previousScene: undefined,
        version: 1,
        characterReferenceImages: [],
        locationReferenceImages: [],
        startFrame,
        endFrame: undefined,
        generateAudio: false,
        saveAssets: vi.fn(),
        sendEntityUpdate: vi.fn(),
        incrementAttempt: vi.fn(),
        saveMetric: vi.fn(),
        generationRules: [],
        uniqueId: 'unique-id'
      });

      expect(result).toBeDefined();
      expect(result.data.videoUrl).toBeDefined();
      
      generateSceneWithSafetyRetrySpy.mockRestore();
    });

    it('should handle quality check failure gracefully', async () => {
      const scene: Scene = {
        id: 'scene-3',
        description: 'Test scene quality fail',
        lighting: { type: 'natural', intensity: 0.8 },
        characterIds: ['char-1'],
        assets: {}
      } as any;

      const startFrame = {
        referenceImage: {
          gcsUri: 'start-frame.jpg',
          mimeType: 'image/jpeg'
        }
      };

      // Mock quality check failure
      const generateSceneWithSafetyRetrySpy = vi.spyOn(sceneGenerator as any, 'generateSceneWithSafetyRetry').mockResolvedValue({
        scene,
        videoUrl: 'test-video-url',
        enhancedPrompt: 'test prompt'
      });

      const mockQualityAgentInstance = sceneGenerator as any;
      mockQualityAgentInstance.qualityAgent.evaluateScene = vi.fn().mockResolvedValue({ score: 0.3, grade: 'F', reasoning: 'Failed quality', pass: false });

      const sendEntityUpdateSpy = vi.fn();

      // Should still return result even with low quality
      const result = await sceneGenerator.generateSceneWithQualityCheck({
        scene,
        enhancedPrompt: 'test prompt',
        sceneCharacters: [],
        sceneLocation: {} as any,
        previousScene: undefined,
        version: 1,
        characterReferenceImages: [],
        locationReferenceImages: [],
        startFrame,
        endFrame: undefined,
        generateAudio: false,
        saveAssets: vi.fn(),
        sendEntityUpdate: sendEntityUpdateSpy,
        incrementAttempt: vi.fn(),
        saveMetric: vi.fn(),
        generationRules: [],
        uniqueId: 'unique-id-3'
      });

      // Should still return result
      expect(result).toBeDefined();

      generateSceneWithSafetyRetrySpy.mockRestore();
    });
  });
});
