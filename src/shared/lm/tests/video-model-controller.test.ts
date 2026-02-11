import { VideoModelController } from '../../lm/video-model-controller.js';
import { IVideoModelProvider } from '../../lm/provider.js';

// Mock provider for testing
class MockVideoProvider implements IVideoModelProvider {
  async generateVideos(params: any): Promise<any> {
    if (params.model === 'fail-video-model') {
      throw new Error('Video model failed');
    }
    return { videos: [{ url: 'video.mp4' }], model: params.model };
  }

  async getVideosOperation(params: any): Promise<any> {
    return { status: 'completed', result: 'Video operation result' };
  }
}

describe('VideoModelController Fallback Mechanism', () => {
  let controller: VideoModelController;
  let mockProvider: MockVideoProvider;

  beforeEach(() => {
    // Mock environment variables
    process.env.GOOGLE_VIDEO_MODEL_NAMES = 'primary-video,fallback-1,fallback-2';
    
    mockProvider = new MockVideoProvider();
    
    // Create controller with mocked provider
    controller = new VideoModelController('google');
    // Replace provider with mock
    (controller as any).provider = mockProvider;
  });

  afterEach(() => {
    delete process.env.VIDEO_MODEL_NAMES;
  });

  describe('Fallback State Management', () => {
    it('should initialize with primary model as current model', () => {
      expect(controller.model).toBe('primary-video');
      expect(controller.defaultModel).toBe('primary-video');
    });

    it('should reset fallback state after successful generation', async () => {
      // Simulate a successful generation
      await controller.generateVideos({ prompt: 'test video' });
      
      // Should be back to primary model
      expect(controller.model).toBe('primary-video');
    });
  });

  describe('Video Generation Fallback', () => {
    it('should retry primary model twice before falling back', async () => {
      const mockGenerateVideos = jest.spyOn(mockProvider, 'generateVideos');
      mockGenerateVideos.mockRejectedValueOnce(new Error('Temporary video failure'));
      mockGenerateVideos.mockResolvedValueOnce({ videos: [{ url: 'success.mp4' }] });

      const result = await controller.generateVideos({ prompt: 'test video' });

      expect(result.videos).toHaveLength(1);
      expect(mockGenerateVideos).toHaveBeenCalledTimes(2);
      expect(mockGenerateVideos).toHaveBeenNthCalledWith(1, { prompt: 'test video', model: 'primary-video' });
      expect(mockGenerateVideos).toHaveBeenNthCalledWith(2, { prompt: 'test video', model: 'primary-video' });
    });

    it('should fall back to next model after primary fails twice', async () => {
      const mockGenerateVideos = jest.spyOn(mockProvider, 'generateVideos');
      mockGenerateVideos.mockRejectedValue(new Error('Primary video model failed'));

      await expect(controller.generateVideos({ prompt: 'test video' })).rejects.toThrow();
      
      // Should have tried primary model twice and fallback once
      expect(mockGenerateVideos).toHaveBeenCalledTimes(3);
      expect(mockGenerateVideos).toHaveBeenNthCalledWith(1, { prompt: 'test video', model: 'primary-video' });
      expect(mockGenerateVideos).toHaveBeenNthCalledWith(2, { prompt: 'test video', model: 'primary-video' });
      expect(mockGenerateVideos).toHaveBeenNthCalledWith(3, { prompt: 'test video', model: 'fallback-1' });
    });

    it('should try each fallback model once', async () => {
      const mockGenerateVideos = jest.spyOn(mockProvider, 'generateVideos');
      mockGenerateVideos.mockRejectedValue(new Error('Video model failed'));

      await expect(controller.generateVideos({ prompt: 'test video' })).rejects.toThrow();
      
      // Should have tried primary (2x) + fallback-1 (1x) + fallback-2 (1x)
      expect(mockGenerateVideos).toHaveBeenCalledTimes(4);
      expect(mockGenerateVideos).toHaveBeenNthCalledWith(1, { prompt: 'test video', model: 'primary-video' });
      expect(mockGenerateVideos).toHaveBeenNthCalledWith(2, { prompt: 'test video', model: 'primary-video' });
      expect(mockGenerateVideos).toHaveBeenNthCalledWith(3, { prompt: 'test video', model: 'fallback-1' });
      expect(mockGenerateVideos).toHaveBeenNthCalledWith(4, { prompt: 'test video', model: 'fallback-2' });
    });

    it('should succeed with fallback model and reset state', async () => {
      const mockGenerateVideos = jest.spyOn(mockProvider, 'generateVideos');
      mockGenerateVideos.mockRejectedValueOnce(new Error('Primary failed'));
      mockGenerateVideos.mockRejectedValueOnce(new Error('Primary failed again'));
      mockGenerateVideos.mockResolvedValueOnce({ videos: [{ url: 'fallback-success.mp4' }] });

      const result = await controller.generateVideos({ prompt: 'test video' });

      expect(result.videos).toHaveLength(1);
      expect(controller.model).toBe('primary-video'); // Should reset after success
    });
  });

  describe('Error Handling', () => {
    it('should handle different error types consistently', async () => {
      const mockGenerateVideos = jest.spyOn(mockProvider, 'generateVideos');
      mockGenerateVideos.mockRejectedValueOnce(new Error('Network error'));
      mockGenerateVideos.mockRejectedValueOnce(new Error('API error'));
      mockGenerateVideos.mockResolvedValueOnce({ videos: [{ url: 'success.mp4' }] });

      const result = await controller.generateVideos({ prompt: 'test video' });

      expect(result.videos).toHaveLength(1);
      expect(mockGenerateVideos).toHaveBeenCalledTimes(3);
    });

    it('should log warnings when switching models', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const mockGenerateVideos = jest.spyOn(mockProvider, 'generateVideos');
      mockGenerateVideos.mockRejectedValue(new Error('Video model failed'));

      await expect(controller.generateVideos({ prompt: 'test video' })).rejects.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Video model attempt failed. Switching to:'));
      
      consoleSpy.mockRestore();
    });
  });

  describe('Single Model Configuration', () => {
    beforeEach(() => {
      process.env.VIDEO_MODEL_NAMES = 'single-video';
    });

    it('should work with single model configuration', async () => {
      const mockGenerateVideos = jest.spyOn(mockProvider, 'generateVideos');
      mockGenerateVideos.mockRejectedValue(new Error('Single video model failed'));

      await expect(controller.generateVideos({ prompt: 'test video' })).rejects.toThrow();
      
      // Should only try the single model twice
      expect(mockGenerateVideos).toHaveBeenCalledTimes(2);
      expect(mockGenerateVideos).toHaveBeenNthCalledWith(1, { prompt: 'test video', model: 'single-video' });
      expect(mockGenerateVideos).toHaveBeenNthCalledWith(2, { prompt: 'test video', model: 'single-video' });
    });
  });

  describe('getVideosOperation', () => {
    it('should pass through getVideosOperation calls without fallback logic', async () => {
      const mockGetVideosOperation = jest.spyOn(mockProvider, 'getVideosOperation');
      mockGetVideosOperation.mockResolvedValueOnce({ status: 'completed' });

      const result = await controller.getVideosOperation({ operationId: 'op-123' });

      expect(result.status).toBe('completed');
      expect(mockGetVideosOperation).toHaveBeenCalledWith({ operationId: 'op-123' });
      expect(mockGetVideosOperation).toHaveBeenCalledTimes(1);
    });
  });
});
