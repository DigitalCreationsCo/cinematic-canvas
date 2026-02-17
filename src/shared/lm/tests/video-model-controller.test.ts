import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VideoModelController, FALLBACK_POLICY } from '../../lm/video-model-controller.js';
import type { IVideoModelProvider } from '../../lm/provider.js';

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  return {
    GoogleProvider: class {
      generateVideos = vi.fn();
      getVideosOperation = vi.fn();
    },
    LTXVideoProvider: class {
      generateVideos = vi.fn();
      getVideosOperation = vi.fn();
    },
    GlobalCooldown: class {
      static wait = vi.fn().mockResolvedValue(undefined);
      static markCallComplete = vi.fn();
      static setCooldownMs = vi.fn();
      static getCooldownMs = vi.fn().mockReturnValue(0);
    }
  };
});

// Mock GlobalCooldown to be a no-op during tests
vi.mock('../../utils/lm-retry.js', () => ({
  GlobalCooldown: mocks.GlobalCooldown
}));

// Mock models to return predictable model lists
vi.mock('../../lm/models.js', () => ({
  getProviderVideoModelNames: vi.fn().mockReturnValue([ 'primary-video', 'fallback-1', 'fallback-2' ]),
}));

// Mock params to pass through
vi.mock('../../lm/params.js', () => ({
  buildGenerateVideosParams: vi.fn((params: any, _provider: any) => params),
}));

// Mock providers
vi.mock('../../lm/google/provider.js', () => ({
  GoogleProvider: mocks.GoogleProvider
}));
vi.mock('../../lm/ltx/provider.js', () => ({
  LTXVideoProvider: mocks.LTXVideoProvider
}));

// ---------------------------------------------------------------------------
// Helper — simulates what an external retry loop does: call generateVideos
// repeatedly, catching throws, until it succeeds or we run out of retries.
// ---------------------------------------------------------------------------
async function callWithRetries(
  controller: VideoModelController,
  params: any,
  maxCalls: number
): Promise<{ result: any | null; callCount: number; lastError: unknown; }> {
  let lastError: unknown = null;
  for (let i = 0; i < maxCalls; i++) {
    try {
      const result = await controller.generateVideos(params);
      return { result, callCount: i + 1, lastError: null };
    } catch (err) {
      lastError = err;
    }
  }
  return { result: null, callCount: maxCalls, lastError };
}

describe('VideoModelController Fallback Mechanism', () => {
  let controller: VideoModelController;
  let mockProvider: {
    generateVideos: ReturnType<typeof vi.fn>;
    getVideosOperation: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.resetModules(); // Ensure we get fresh module with fresh GlobalCooldown logic
    controller = new VideoModelController('google');
    // Replace the real provider with a simple mock
    mockProvider = {
      generateVideos: vi.fn(),
      getVideosOperation: vi.fn(),
    };
    (controller as any).provider = mockProvider;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Fallback State Management', () => {
    it('should initialize with primary model as current model', () => {
      expect(controller.model).toBe('primary-video');
      expect(controller.defaultModel).toBe('primary-video');
    });

    it('should reset fallback state after successful generation', async () => {
      mockProvider.generateVideos.mockResolvedValueOnce({ videos: [ { url: 'success.mp4' } ] });

      await controller.generateVideos({ prompt: 'test video' });

      // After success, the model resets to primary
      expect(controller.model).toBe('primary-video');
    });
  });

  describe('Video Generation Fallback', () => {
    it('should succeed on first call when provider succeeds', async () => {
      mockProvider.generateVideos.mockResolvedValueOnce({ videos: [ { url: 'video.mp4' } ] });

      const result = await controller.generateVideos({ prompt: 'test video' });

      expect(result.videos).toHaveLength(1);
      expect(mockProvider.generateVideos).toHaveBeenCalledTimes(1);
    });

    it('should advance to fallback model after primary fails (via external retry)', async () => {
      // PRIMARY_ATTEMPTS = 1, so the first failure moves to fallback-1
      mockProvider.generateVideos
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockResolvedValueOnce({ videos: [ { url: 'fallback-success.mp4' } ] });

      const { result, callCount } = await callWithRetries(controller, { prompt: 'test' }, 5);

      expect(callCount).toBe(2); // 1 failed primary + 1 success on fallback
      expect(result?.videos).toHaveLength(1);
      expect(mockProvider.generateVideos).toHaveBeenCalledTimes(2);
    });

    it('should exhaust all fallback models before giving up', async () => {
      // All models fail: primary (1 attempt), fallback-1 (1), fallback-2 (1)
      mockProvider.generateVideos.mockRejectedValue(new Error('Model failed'));

      const { result, callCount, lastError } = await callWithRetries(controller, { prompt: 'test' }, 5);

      // 3 calls total (primary + 2 fallbacks), then retries at end of list
      expect(callCount).toBe(5); // hit the maxCalls limit
      expect(result).toBeNull();
      expect(lastError).toBeDefined();
    });

    it('should succeed when fallback-1 works after primary fails', async () => {
      mockProvider.generateVideos
        .mockRejectedValueOnce(new Error('Primary fail'))     // primary attempt
        .mockResolvedValueOnce({ videos: [ { url: 'fb1.mp4' } ] }); // fallback-1

      const { result, callCount } = await callWithRetries(controller, { prompt: 'test' }, 5);

      expect(callCount).toBe(2);
      expect(result?.videos[ 0 ].url).toBe('fb1.mp4');
      // After success, model resets
      expect(controller.model).toBe('primary-video');
    });
  });

  describe('Error Handling', () => {
    it('should throw error on failed generation', async () => {
      mockProvider.generateVideos.mockRejectedValueOnce(new Error('Generation error'));

      await expect(controller.generateVideos({ prompt: 'test' })).rejects.toThrow('Generation error');
    });

    it('should log warning when switching models', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
      mockProvider.generateVideos.mockRejectedValueOnce(new Error('Model failed'));

      try {
        await controller.generateVideos({ prompt: 'test' });
      } catch {
        // expected
      }

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Video model attempt failed'));
      warnSpy.mockRestore();
    });
  });

  describe('Single Model Configuration', () => {
    beforeEach(async () => {
      // Re-mock models to return a single model
      const { getProviderVideoModelNames } = await import('../../lm/models.js');
      vi.mocked(getProviderVideoModelNames).mockReturnValue([ 'single-video' ]);
      // Re-create controller with single model
      controller = new VideoModelController('google');
      (controller as any).provider = mockProvider;
    });

    it('should work with single model configuration', async () => {
      mockProvider.generateVideos.mockRejectedValue(new Error('Single model failed'));

      const { callCount, lastError } = await callWithRetries(controller, { prompt: 'test' }, 3);

      // With a single model, there are no fallbacks, so all 3 calls hit the same model
      expect(callCount).toBe(3);
      expect(lastError).toBeDefined();
      expect(mockProvider.generateVideos).toHaveBeenCalledTimes(3);
    });
  });

  describe('getVideosOperation', () => {
    it('should pass through getVideosOperation calls without fallback logic', async () => {
      mockProvider.getVideosOperation.mockResolvedValueOnce({ status: 'completed' });

      const result = await controller.getVideosOperation({ operationId: 'op-123' });

      expect(result.status).toBe('completed');
      expect(mockProvider.getVideosOperation).toHaveBeenCalledWith({ operationId: 'op-123' });
      expect(mockProvider.getVideosOperation).toHaveBeenCalledTimes(1);
    });
  });
});
