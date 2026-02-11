import { getAllBestAssets } from '../../utils/assets-utils.js';

// Mock asset data for testing
const createMockAssets = (assetKey: string, data: string, best: number = 1) => ({
  [assetKey]: {
    best,
    versions: {
      0: { data: 'version-0-data', createdAt: new Date('2023-01-01') },
      [best]: { data, createdAt: new Date('2023-01-02') },
      2: { data: 'version-2-data', createdAt: new Date('2023-01-03') }
    }
  }
});

describe('Asset Access Patterns', () => {
  describe('getAllBestAssets', () => {
    it('should return assets with best version data', () => {
      const mockAssets = createMockAssets('scene_video', 'best-video-data.mp4', 1);
      
      const result = getAllBestAssets(mockAssets);
      
      expect(result['scene_video']).toBeDefined();
      expect(result['scene_video']?.data).toBe('best-video-data.mp4');
      expect(result['scene_video']?.version).toBe(1);
    });

    it('should handle assets with best version 0', () => {
      const mockAssets = createMockAssets('character_image', 'best-image.jpg', 0);
      
      const result = getAllBestAssets(mockAssets);
      
      expect(result['character_image']).toBeDefined();
      expect(result['character_image']?.data).toBe('best-image.jpg');
      expect(result['character_image']?.version).toBe(0);
    });

    it('should handle multiple asset types', () => {
      const mockAssets = {
        ...createMockAssets('scene_video', 'video.mp4', 1),
        ...createMockAssets('scene_start_frame', 'start-frame.jpg', 2),
        ...createMockAssets('scene_end_frame', 'end-frame.jpg', 1)
      };
      
      const result = getAllBestAssets(mockAssets);
      
      expect(result['scene_video']?.data).toBe('video.mp4');
      expect(result['scene_start_frame']?.data).toBe('start-frame.jpg');
      expect(result['scene_end_frame']?.data).toBe('end-frame.jpg');
    });

    it('should handle empty assets object', () => {
      const result = getAllBestAssets({});
      
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should handle assets with missing versions', () => {
      const mockAssets = {
        'scene_video': {
          head: 0,
          best: 1,
          versions: [
            { data: 'version-0-data', createdAt: new Date('2023-01-01'), version: 0, type: "video" as const, metadata: {} as any },
            { data: 'version-1-data', createdAt: new Date('2023-01-01'), version: 1, type: "video" as const, metadata: {} as any }
          ]
        }
      };
      
      const result = getAllBestAssets(mockAssets);
      
      expect(result['scene_video']).toBeDefined();
      expect(result['scene_video']?.data).toBeUndefined();
      expect(result['scene_video']?.version).toBe(1);
    });

    it('should handle assets with undefined best', () => {
      const mockAssets = {
        'scene_video': {
          best: undefined,
          head: 0,
          versions: [
            { data: 'version-0-data', createdAt: new Date('2023-01-01'), version: 0, type: "video" as const, metadata: {} as any },
            { data: 'version-1-data', createdAt: new Date('2023-01-02'), version: 1, type: "video" as const, metadata: {} as any }
          ]
        }
      };
      
      const result = getAllBestAssets(mockAssets as any);
      
      expect(result['scene_video']).toBeDefined();
      expect(result['scene_video']?.data).toBeUndefined();
      expect(result['scene_video']?.version).toBeUndefined();
    });
  });

  describe('Asset Access Pattern Migration', () => {
    it('should replace old pattern with getAllBestAssets usage', () => {
      // Test the old pattern vs new pattern
      const mockAssets = createMockAssets('scene_video', 'best-video.mp4', 1);
      
      // Old pattern: assets['scene_video']?.versions[assets['scene_video']?.best]?.data
      const oldPattern = mockAssets['scene_video']?.versions[mockAssets['scene_video']?.best]?.data;
      
      // New pattern: getAllBestAssets(assets)['scene_video']?.data
      const newPattern = getAllBestAssets(mockAssets)['scene_video']?.data;
      
      expect(oldPattern).toBe(newPattern);
      expect(newPattern).toBe('best-video.mp4');
    });

    it('should handle edge cases consistently', () => {
      const edgeCaseAssets = {
        'scene_video': {
          best: 0,
          head: 0,
          versions: [
            { data: 'edge-case-video.mp4', createdAt: new Date('2023-01-01'), version: 0, type: "video" as const, metadata: {} as any }
          ]
        }
      };
      
      const oldPattern = edgeCaseAssets['scene_video']?.versions[edgeCaseAssets['scene_video']?.best]?.data;
      const newPattern = getAllBestAssets(edgeCaseAssets)['scene_video']?.data;
      
      expect(oldPattern).toBe(newPattern);
      expect(newPattern).toBe('edge-case-video.mp4');
    });
  });
});
