import { MediaController } from '../../src/shared/services/media-controller.js';
import { GCPStorageManager } from '../../src/shared/services/storage-manager.js';
import { Scene } from '../../src/shared/types/index.js';

// Mock storage manager
class MockStorageManager {
  async getObjectPath(params: any): Promise<string> {
    return `gcs://bucket/${params.type}/${params.sceneId || params.projectId}/${params.version || 1}`;
  }

  async uploadFile(filePath: string, objectPath: string): Promise<string> {
    return `gcs://bucket/${objectPath}`;
  }

  getPublicUrl(gcsUri: string): string {
    return `https://storage.googleapis.com/${gcsUri.replace('gcs://', '')}`;
  }
}

describe('MediaController Asset Access Patterns', () => {
  let mediaController: MediaController;
  let mockStorageManager: MockStorageManager;

  beforeEach(() => {
    mockStorageManager = new MockStorageManager() as any;
    mediaController = new MediaController(mockStorageManager);
  });

  describe('performIncrementalVideoRender', () => {
    it('should use getAllBestAssets for scene video assets', async () => {
      const mockScenes: Scene[] = [
        {
          id: 'scene-1',
          assets: {
            'scene_video': {
              best: 1,
              versions: {
                0: { data: 'video-0.mp4', createdAt: new Date('2023-01-01') },
                1: { data: 'video-1.mp4', createdAt: new Date('2023-01-02') }
              }
            }
          }
        } as any,
        {
          id: 'scene-2',
          assets: {
            'scene_video': {
              best: 2,
              versions: {
                0: { data: 'video-0.mp4', createdAt: new Date('2023-01-01') },
                1: { data: 'video-1.mp4', createdAt: new Date('2023-01-02') },
                2: { data: 'video-2.mp4', createdAt: new Date('2023-01-03') }
              }
            }
          }
        } as any
      ];

      // Mock the stitchScenes method to avoid actual video processing
      const stitchScenesSpy = jest.spyOn(mediaController, 'stitchScenes');
      stitchScenesSpy.mockResolvedValueOnce('gcs://bucket/final-video.mp4');

      const result = await mediaController.performIncrementalVideoRender(
        mockScenes,
        undefined,
        'project-1',
        1
      );

      expect(result).toBe('gcs://bucket/final-video.mp4');
      expect(stitchScenesSpy).toHaveBeenCalledWith(
        ['video-1.mp4', 'video-2.mp4'],
        'project-1',
        1,
        undefined
      );
    });

    it('should handle scenes without video assets', async () => {
      const mockScenes: Scene[] = [
        {
          id: 'scene-1',
          assets: {}
        } as any
      ];

      const result = await mediaController.performIncrementalVideoRender(
        mockScenes,
        undefined,
        'project-1',
        1
      );

      expect(result).toBeUndefined();
    });

    it('should filter out undefined video URLs', async () => {
      const mockScenes: Scene[] = [
        {
          id: 'scene-1',
          assets: {
            'scene_video': {
              best: 1,
              versions: {
                0: { data: undefined, createdAt: new Date('2023-01-01') },
                1: { data: 'valid-video.mp4', createdAt: new Date('2023-01-02') }
              }
            }
          }
        } as any,
        {
          id: 'scene-2',
          assets: {
            'scene_video': {
              best: 1,
              versions: {
                0: { data: undefined, createdAt: new Date('2023-01-01') },
                1: { data: undefined, createdAt: new Date('2023-01-02') }
              }
            }
          }
        } as any
      ];

      const stitchScenesSpy = jest.spyOn(mediaController, 'stitchScenes');
      stitchScenesSpy.mockResolvedValueOnce('gcs://bucket/final-video.mp4');

      await mediaController.performIncrementalVideoRender(
        mockScenes,
        undefined,
        'project-1',
        1
      );

      expect(stitchScenesSpy).toHaveBeenCalledWith(
        ['valid-video.mp4'],
        'project-1',
        1,
        undefined
      );
    });
  });
});
