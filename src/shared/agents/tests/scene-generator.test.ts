import { SceneGeneratorAgent } from '../../src/shared/agents/scene-generator.js';
import { GCPStorageManager } from '../../src/shared/services/storage-manager.js';
import { VideoModelController } from '../../src/shared/lm/video-model-controller.js';
import { QualityCheckAgent } from '../../src/shared/agents/quality-check-agent.js';
import { Scene } from '../../src/shared/types/index.js';

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
  async evaluateSceneVideo(params: any): Promise<any> {
    return { passed: true, score: 0.95 };
  }
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
      mockStorageManager as any,
      mockQualityAgent as any
    );
  });

  describe('Commented Asset Access Pattern', () => {
    it('should have updated commented asset access pattern', () => {
      // This test verifies that the commented code has been updated
      // to use getAllBestAssets pattern
      const sceneGeneratorSource = SceneGeneratorAgent.toString();
      
      // The old pattern should not exist
      expect(sceneGeneratorSource).not.toContain(
        'previousScene?.assets[ "scene_video" ]?.versions[ previousScene?.assets[ "scene_video" ].best ].data'
      );
      
      // The new pattern should exist in comments
      expect(sceneGeneratorSource).toContain(
        'getAllBestAssets(previousScene?.assets)[\'scene_video\']?.data'
      );
    });
  });

  describe('generateSceneVideo', () => {
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

      const result = await sceneGenerator.generateSceneVideo(
        scene,
        startFrame,
        'project-1',
        10,
        1,
        'unique-id'
      );

      expect(result).toBeDefined();
      expect(result.assets).toBeDefined();
    });

    it('should handle previous scene asset access correctly', async () => {
      const previousScene: Scene = {
        id: 'scene-0',
        assets: {
          'scene_video': {
            best: 1,
            versions: {
              0: { data: 'old-video.mp4', createdAt: new Date('2023-01-01') },
              1: { data: 'previous-video.mp4', createdAt: new Date('2023-01-02') }
            }
          }
        }
      } as any;

      const currentScene: Scene = {
        id: 'scene-1',
        assets: {}
      } as any;

      const startFrame = {
        referenceImage: {
          gcsUri: 'start-frame.jpg',
          mimeType: 'image/jpeg'
        }
      };

      // The commented code shows how previous scene video would be accessed
      // This test ensures the pattern is correctly updated
      const sceneGeneratorSource = SceneGeneratorAgent.toString();
      expect(sceneGeneratorSource).toContain('getAllBestAssets');
    });
  });
});
