
import { GCPStorageManager } from './storage-manager';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

// Mock the Google Cloud Storage library
const mockFile = {
  save: vi.fn().mockResolvedValue(undefined),
  download: vi.fn().mockResolvedValue([Buffer.from('{}')]),
  exists: vi.fn().mockResolvedValue([false]),
};

const mockBucket = {
  file: vi.fn().mockReturnValue(mockFile),
  upload: vi.fn().mockResolvedValue(undefined),
};

const mockStorage = {
  bucket: vi.fn().mockReturnValue(mockBucket),
};

vi.mock('@google-cloud/storage', () => {
  return {
    Storage: class {
      constructor() {
        return mockStorage;
      }
    }
  };
});

describe('GCPStorageManager Path Consistency', () => {
  let manager: GCPStorageManager;
  const projectId = 'test-project';
  const videoId = 'video_123';
  const bucketName = 'test-bucket';

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new GCPStorageManager(projectId, videoId, bucketName);
  });

  afterEach(() => {
    // Clean up any temp files if created
    if (fs.existsSync('latest_attempts.json')) {
      fs.unlinkSync('latest_attempts.json');
    }
  });

  describe('parsePathFromUri', () => {
    it('should correctly strip gs:// prefix', () => {
      // @ts-ignore - accessing private method for testing
      const result = manager['parsePathFromUri']('gs://test-bucket/path/to/file.txt');
      expect(result).toBe('path/to/file.txt');
    });

    it('should return relative paths as-is', () => {
      // @ts-ignore
      const result = manager['parsePathFromUri']('path/to/file.txt');
      expect(result).toBe('path/to/file.txt');
    });

    // Failing test case we want to fix
    it('should normalize slashes and remove duplicates', () => {
      // @ts-ignore
      const result = manager['parsePathFromUri']('path//to//file.txt');
      // Current implementation might fail this if it just regex matches
      // We want it to return 'path/to/file.txt'
      expect(result).toBe('path/to/file.txt'); 
    });
    
    it('should handle leading slashes by removing them for GCS compatibility', () => {
       // @ts-ignore
       const result = manager['parsePathFromUri']('/path/to/file.txt');
       expect(result).toBe('path/to/file.txt');
    });
  });

  describe('getGcsObjectPath', () => {
    it('should return a relative path, NOT a URI', () => {
      const path = manager.getGcsObjectPath({ type: 'storyboard' });
      // Current implementation returns gs://..., we want relative
      expect(path).not.toMatch(/^gs:\/\//);
      expect(path).toBe(`${videoId}/scenes/storyboard.json`);
    });

    it('should construct consistent paths for scenes', () => {
      const path = manager.getGcsObjectPath({ type: 'scene_video', sceneId: 1, attempt: 1 });
      expect(path).toBe(`${videoId}/scenes/scene_001_01.mp4`);
    });
  });
});
