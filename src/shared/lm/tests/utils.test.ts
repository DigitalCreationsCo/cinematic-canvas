import { referenceImageFrom } from '../../src/shared/lm/utils.js';
import { Scene, Character, Location } from '../../src/shared/types/index.js';

// Mock fetch for testing
global.fetch = jest.fn();

describe('LM Utils Asset Access Patterns', () => {
  const createMockScene = (imageData: string): Scene => ({
    id: 'scene-1',
    assets: {
      'scene_start_frame': {
        best: 1,
        versions: {
          0: { data: 'old-image.jpg', createdAt: new Date('2023-01-01') },
          1: { data: imageData, createdAt: new Date('2023-01-02') }
        }
      }
    }
  } as any);

  const createMockCharacter = (imageData: string): Character => ({
    id: 'char-1',
    assets: {
      'character_image': {
        best: 1,
        versions: {
          0: { data: 'old-char-image.jpg', createdAt: new Date('2023-01-01') },
          1: { data: imageData, createdAt: new Date('2023-01-02') }
        }
      }
    }
  } as any);

  const createMockLocation = (imageData: string): Location => ({
    id: 'loc-1',
    assets: {
      'location_image': {
        best: 1,
        versions: {
          0: { data: 'old-loc-image.jpg', createdAt: new Date('2023-01-01') },
          1: { data: imageData, createdAt: new Date('2023-01-02') }
        }
      }
    }
  } as any);

  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
    (fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: jest.fn().mockReturnValue('image/jpeg')
      }
    });
  });

  describe('referenceImageFrom', () => {
    it('should use getAllBestAssets for filtering entities with image data', async () => {
      const scene = createMockScene('scene-image.jpg');
      const character = createMockCharacter('character-image.jpg');
      const location = createMockLocation('location-image.jpg');
      
      const entities = [scene, character, location];
      const assetKeys = ['scene_start_frame', 'character_image', 'location_image'];
      const descriptions = ['Scene start', 'Character reference', 'Location reference'];
      
      const result = await referenceImageFrom(entities, assetKeys, descriptions);
      
      expect(result).toHaveLength(3);
      expect(result[0].referenceImage.gcsUri).toBe('scene-image.jpg');
      expect(result[1].referenceImage.gcsUri).toBe('character-image.jpg');
      expect(result[2].referenceImage.gcsUri).toBe('location-image.jpg');
    });

    it('should filter out entities without image data', async () => {
      const sceneWithImage = createMockScene('scene-image.jpg');
      const sceneWithoutImage = {
        id: 'scene-2',
        assets: {
          'scene_start_frame': {
            best: 1,
            versions: {
              0: { data: undefined, createdAt: new Date('2023-01-01') },
              1: { data: undefined, createdAt: new Date('2023-01-02') }
            }
          }
        }
      } as any;
      
      const entities = [sceneWithImage, sceneWithoutImage];
      const assetKeys = ['scene_start_frame', 'scene_start_frame'];
      const descriptions = ['Scene 1', 'Scene 2'];
      
      const result = await referenceImageFrom(entities, assetKeys, descriptions);
      
      expect(result).toHaveLength(1);
      expect(result[0].referenceImage.gcsUri).toBe('scene-image.jpg');
    });

    it('should handle empty entities array', async () => {
      const result = await referenceImageFrom([], [], []);
      
      expect(result).toHaveLength(0);
    });

    it('should fetch MIME type for each image', async () => {
      const scene = createMockScene('scene-image.jpg');
      const character = createMockCharacter('character-image.png');
      
      const entities = [scene, character];
      const assetKeys = ['scene_start_frame', 'character_image'];
      const descriptions = ['Scene', 'Character'];
      
      await referenceImageFrom(entities, assetKeys, descriptions);
      
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenCalledWith('scene-image.jpg', { method: 'HEAD' });
      expect(fetch).toHaveBeenCalledWith('character-image.png', { method: 'HEAD' });
    });

    it('should handle fetch errors gracefully', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      
      const scene = createMockScene('scene-image.jpg');
      const entities = [scene];
      const assetKeys = ['scene_start_frame'];
      const descriptions = ['Scene'];
      
      await expect(referenceImageFrom(entities, assetKeys, descriptions)).rejects.toThrow('Network error');
    });

    it('should use default MIME type when fetch fails', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        headers: {
          get: jest.fn().mockReturnValue(null)
        }
      });
      
      const scene = createMockScene('scene-image.jpg');
      const entities = [scene];
      const assetKeys = ['scene_start_frame'];
      const descriptions = ['Scene'];
      
      const result = await referenceImageFrom(entities, assetKeys, descriptions);
      
      expect(result[0].configuration.mimeType).toBe('image/jpeg'); // Default MIME type
    });
  });
});
