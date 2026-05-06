import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaController } from '#shared/services/media-controller.js';
import fs from 'fs';

// Mock fs at top level - factory is hoisted
vi.mock('fs', () => {
  const mocks = {
    existsSync: vi.fn(),
    unlinkSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
  return {
    ...mocks,
    default: mocks,
  };
});

describe('MediaController - renderScenes', () => {
  let controller: MediaController;
  let mockStorage: any;

  const mockedExistsSync = vi.mocked(fs.existsSync);
  const mockedUnlinkSync = vi.mocked(fs.unlinkSync);

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = {
      getObjectPath: vi.fn().mockResolvedValue('path/to/obj'),
      uploadFile: vi.fn().mockResolvedValue('gs://final_video.mp4'),
      getPublicUrl: vi.fn().mockReturnValue('https://cdn.com/video.mp4'),
    };
    controller = new MediaController(mockStorage);

    controller['executeRenderVideo'] = vi.fn().mockResolvedValue('/tmp/local_video.mp4');
    controller['createAndUploadThumbnail'] = vi.fn().mockResolvedValue({ gcsUri: 'gs://thumb.jpg' });
    controller['getAudioDuration'] = vi.fn().mockResolvedValue(45);

    mockedExistsSync.mockReturnValue(true);
  });

  it('should orchestrate full render, upload, and cleanup', async () => {
    const result = await controller.renderScenes(['v1', 'v2'], 'p1', 1, 'a1');

    expect(result).toEqual({
      gcsUri: 'gs://final_video.mp4',
      thumbnailGcsUri: 'gs://thumb.jpg',
      duration: 45,
    });
    expect(mockStorage.uploadFile).toHaveBeenCalledWith('/tmp/local_video.mp4', 'path/to/obj');
    expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/local_video.mp4');
  });

  it('should ensure local file cleanup even if upload fails', async () => {
    mockStorage.uploadFile.mockRejectedValue(new Error('Upload Error'));

    await expect(controller.renderScenes(['v1'], 'p1', 1)).rejects.toThrow('Upload Error');
    expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/local_video.mp4');
  });
});
