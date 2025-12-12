import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GCPStorageManager } from './storage-manager';
import fs from 'fs';

// Mock @google-cloud/storage
const mockFile = {
  save: vi.fn(),
  download: vi.fn(),
  exists: vi.fn().mockResolvedValue([ true ]),
  getMetadata: vi.fn().mockResolvedValue([ { contentType: 'video/mp4' } ]),
  name: 'test-file',
};

const mockBucket = {
  upload: vi.fn(),
  file: vi.fn(() => mockFile),
  getFiles: vi.fn(),
};

const mockStorage = {
  bucket: vi.fn(() => mockBucket),
};

vi.mock('@google-cloud/storage', () => {
  class MockStorage {
    constructor() {
      return mockStorage;
    }
  }
  return { Storage: MockStorage };
});

// Manual mock for fs
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

describe('GCPStorageManager', () => {
  let storageManager: GCPStorageManager;
  const projectId = 'test-project';
  const videoId = 'test-video';
  const bucketName = 'test-bucket';

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('{}');
    mockWriteFileSync.mockReturnValue(undefined);
    storageManager = new GCPStorageManager(projectId, videoId, bucketName);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be initialized correctly', () => {
    expect(storageManager).toBeInstanceOf(GCPStorageManager);
  });

  describe('initialize', () => {
    it('should sync latest attempts from GCS', async () => {
      const mockFiles = [
        { name: 'test-video/scenes/scene_001_05.mp4' },
        { name: 'test-video/scenes/scene_002_03.mp4' },
        { name: 'test-video/images/frames/scene_001_lastframe_02.png' },
      ];

      mockBucket.getFiles.mockResolvedValue([ mockFiles ]);

      await storageManager.initialize();

      expect(mockBucket.getFiles).toHaveBeenCalledTimes(4); // Once for each asset type

      // Verify state by checking path generation (synchronous)
      const path1 = storageManager.getGcsObjectPath({ type: 'scene_video', sceneId: 1, attempt: 'latest' });
      expect(path1).toBe('test-video/scenes/scene_001_05.mp4');

      const path2 = storageManager.getGcsObjectPath({ type: 'scene_video', sceneId: 2, attempt: 'latest' });
      expect(path2).toBe('test-video/scenes/scene_002_03.mp4');

      const path3 = storageManager.getGcsObjectPath({ type: 'scene_end_frame', sceneId: 1, attempt: 'latest' });
      expect(path3).toBe('test-video/images/frames/scene_001_lastframe_02.png');
    });

    it('should handle empty GCS gracefully', async () => {
      mockBucket.getFiles.mockResolvedValue([ [] ]);
      await storageManager.initialize();
      const path = storageManager.getGcsObjectPath({ type: 'scene_video', sceneId: 1, attempt: 'latest' });
      expect(path).toBe('test-video/scenes/scene_001_01.mp4'); // Default to 1
    });

    it('should handle GCS errors gracefully', async () => {
      mockBucket.getFiles.mockRejectedValue(new Error('GCS Error'));
      // Should not throw
      await expect(storageManager.initialize()).resolves.not.toThrow();
    });
  });

  describe('getGcsObjectPath', () => {
    it('should generate correct paths for all object types', () => {
      expect(storageManager.getGcsObjectPath({ type: 'storyboard' })).toBe('test-video/scenes/storyboard.json');
      expect(storageManager.getGcsObjectPath({ type: 'character_image', characterId: 'char1' })).toBe('test-video/images/characters/char1_reference.png');
      expect(storageManager.getGcsObjectPath({ type: 'scene_end_frame', sceneId: 1, attempt: 3 })).toBe('test-video/images/frames/scene_001_lastframe_03.png');
      expect(storageManager.getGcsObjectPath({ type: 'composite_frame', sceneId: 1, attempt: 2 })).toBe('test-video/images/frames/scene_001_composite_02.png');
      expect(storageManager.getGcsObjectPath({ type: 'scene_video', sceneId: 1, attempt: 1 })).toBe('test-video/scenes/scene_001_01.mp4');
      expect(storageManager.getGcsObjectPath({ type: 'scene_quality_evaluation', sceneId: 1, attempt: 5 })).toBe('test-video/scenes/scene_001_evaluation_05.json');
      expect(storageManager.getGcsObjectPath({ type: 'frame_quality_evaluation', sceneId: 1, framePosition: "end", attempt: 5 })).toBe('test-video/images/frames/scene_001_frame_end_evaluation_05.json');
      expect(storageManager.getGcsObjectPath({ type: 'stitched_video' })).toBe('test-video/final/movie.mp4');
      expect(storageManager.getGcsObjectPath({ type: 'final_output' })).toBe('test-video/final/final_output.json');
    });

    it('should use default attempt (1) when attempt is not provided', () => {
      expect(storageManager.getGcsObjectPath({ type: 'scene_video', sceneId: 1 })).toBe('test-video/scenes/scene_001_01.mp4');
      expect(storageManager.getGcsObjectPath({ type: 'scene_end_frame', sceneId: 2 })).toBe('test-video/images/frames/scene_002_lastframe_01.png');
      expect(storageManager.getGcsObjectPath({ type: 'composite_frame', sceneId: 3 })).toBe('test-video/images/frames/scene_003_composite_01.png');
      expect(storageManager.getGcsObjectPath({ type: 'scene_quality_evaluation', sceneId: 4 })).toBe('test-video/scenes/scene_004_evaluation_01.json');
      expect(storageManager.getGcsObjectPath({ type: 'frame_quality_evaluation', sceneId: 4, framePosition: "start" })).toBe('test-video/images/frames/scene_004_frame_start_evaluation_01.json');
    });

    it('should use latest attempt when attempt is "latest"', () => {
      storageManager.setLatestAttempt('scene_video', 1, 5);
      storageManager.setLatestAttempt('scene_end_frame', 2, 3);

      expect(storageManager.getGcsObjectPath({ type: 'scene_video', sceneId: 1, attempt: 'latest' })).toBe('test-video/scenes/scene_001_05.mp4');
      expect(storageManager.getGcsObjectPath({ type: 'scene_end_frame', sceneId: 2, attempt: 'latest' })).toBe('test-video/images/frames/scene_002_lastframe_03.png');
    });

    it('should throw an error for unknown object type', () => {
      // @ts-expect-error
      expect(() => storageManager.getGcsObjectPath({ type: 'unknown_type' })).toThrow('Unknown GCS object type: unknown_type');
    });
  });

  describe('setLatestAttempt', () => {
    it('should set the latest attempt for a given object type and sceneId', () => {
      storageManager.setLatestAttempt('scene_video', 1, 3);
      expect(storageManager.getGcsObjectPath({ type: 'scene_video', sceneId: 1, attempt: 'latest' })).toBe('test-video/scenes/scene_001_03.mp4');
    });

    it('should only update if the new attempt is greater than the current', () => {
      storageManager.setLatestAttempt('scene_video', 1, 5);
      storageManager.setLatestAttempt('scene_video', 1, 3); // Should not update
      expect(storageManager.getGcsObjectPath({ type: 'scene_video', sceneId: 1, attempt: 'latest' })).toBe('test-video/scenes/scene_001_05.mp4');
    });

    it('should save to persistence file on update', () => {
      storageManager.setLatestAttempt('scene_video', 1, 3);
      expect(mockWriteFileSync).toHaveBeenCalledWith('latest_attempts.json', expect.any(String));
    });
  });

  describe('Persistence', () => {
    it('should load attempts from file on construction', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ 'scene_video_1': 10 }));

      const newManager = new GCPStorageManager(projectId, videoId, bucketName);
      const path = newManager.getGcsObjectPath({ type: 'scene_video', sceneId: 1, attempt: 'latest' });
      expect(path).toBe('test-video/scenes/scene_001_10.mp4');
    });

    it('should handle corrupted persistence file gracefully', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid json');

      // Should not throw
      expect(() => new GCPStorageManager(projectId, videoId, bucketName)).not.toThrow();
    });
  });

  describe('getPublicUrl', () => {
    it('should return the correct public URL', () => {
      const path = 'test-video/final/movie.mp4';
      const expectedUrl = 'https://storage.googleapis.com/test-bucket/test-video/final/movie.mp4';
      expect(storageManager.getPublicUrl(path)).toBe(expectedUrl);
    });
  });

  describe('getGcsUrl', () => {
    it('should return the correct GCS URL', () => {
      const path = 'test-video/final/movie.mp4';
      const expectedUrl = 'gs://test-bucket/test-video/final/movie.mp4';
      expect(storageManager.getGcsUrl(path)).toBe(expectedUrl);
    });
  });

  describe('uploadFile', () => {
    it('should call bucket.upload with the correct parameters', async () => {
      const localPath = '/tmp/test.txt';
      const destination = 'test/test.txt';
      await storageManager.uploadFile(localPath, destination);
      expect(mockStorage.bucket).toHaveBeenCalledWith(bucketName);
      expect(mockBucket.upload).toHaveBeenCalledWith(localPath, {
        destination,
        metadata: {
          cacheControl: 'public, max-age=31536000',
        },
      });
    });
  });
});
