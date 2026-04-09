import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoModelController } from '../../lm/video-model-controller.js';

const mocks = vi.hoisted(() => ({
  GoogleProvider: class {
    generateVideos = vi.fn();
    getVideosOperation = vi.fn();
  },
  GlobalCooldown: class {
    static wait = vi.fn().mockResolvedValue(undefined);
    static markCallComplete: any = vi.fn();
  }
}));

vi.mock('../../utils/execute-with-retry.js', () => ({ GlobalCooldown: mocks.GlobalCooldown }));
vi.mock('../../lm/models.js', () => ({
  getProviderVideoModelNames: vi.fn().mockReturnValue(['vid-0', 'vid-1', 'vid-2']),
}));
vi.mock('../../lm/params.js', () => ({
  buildGenerateVideosParams: vi.fn((params: any) => params),
}));
vi.mock('../../lm/google/provider.js', () => ({ GoogleProvider: mocks.GoogleProvider }));

describe('VideoModelController Full Coverage Suite', () => {
  let mockProvider: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = new mocks.GoogleProvider();
  });

  describe('Priority Mode: Quality', () => {
    it('should reset index to 0 after success', async () => {
      const ctrl = new VideoModelController('google', 'quality');
      (ctrl as any).provider = mockProvider;

      mockProvider.generateVideos
        .mockRejectedValueOnce(new Error('Fail 0')) // Moves to vid-1
        .mockResolvedValueOnce({ status: 'ok' });   // Succeeds on vid-1

      await expect(ctrl.generateVideos({ prompt: 't' })).rejects.toThrow();
      expect(ctrl.model).toBe('vid-1');

      await ctrl.generateVideos({ prompt: 't' });
      expect(ctrl.model).toBe('vid-0');
    });
  });

  describe('Priority Mode: Speed', () => {
    it('should stay on fallback index after success', async () => {
      const ctrl = new VideoModelController('google', 'speed');
      (ctrl as any).provider = mockProvider;

      mockProvider.generateVideos
        .mockRejectedValueOnce(new Error('Fail 0'))
        .mockResolvedValue({ status: 'ok' });

      await expect(ctrl.generateVideos({ prompt: 't' })).rejects.toThrow();
      expect(ctrl.model).toBe('vid-1');

      await ctrl.generateVideos({ prompt: 't' });
      expect(ctrl.model).toBe('vid-1'); // Remains sticky
    });
  });

  describe('Error Handling & Wraparound', () => {
    it('should wrap around the list when errors persist', async () => {
      const ctrl = new VideoModelController('google', 'speed');
      (ctrl as any).provider = mockProvider;
      mockProvider.generateVideos.mockRejectedValue(new Error('Permanent Failure'));

      await expect(ctrl.generateVideos({ prompt: '1' })).rejects.toThrow(); // to vid-1
      expect(ctrl.model).toBe('vid-1');

      await expect(ctrl.generateVideos({ prompt: '2' })).rejects.toThrow(); // to vid-2
      expect(ctrl.model).toBe('vid-2');

      await expect(ctrl.generateVideos({ prompt: '3' })).rejects.toThrow(); // wrap to vid-0
      expect(ctrl.model).toBe('vid-0');
    });
  });

  describe('Operation Passthrough', () => {
    it('should correctly delegate getVideosOperation calls', async () => {
      const ctrl = new VideoModelController('google');
      (ctrl as any).provider = mockProvider;
      mockProvider.getVideosOperation.mockResolvedValue({ done: false });

      const result = await ctrl.getVideosOperation({ operationId: '123' });

      expect(result.done).toBe(false);
      expect(mockProvider.getVideosOperation).toHaveBeenCalledWith({ operationId: '123' });
    });
  });

  describe('Configuration Passthrough', () => {
    it('should provide getters for current and default models', () => {
      const ctrl = new VideoModelController('google');
      expect(ctrl.defaultModel).toBe('vid-0');
      expect(ctrl.model).toBe('vid-0');
    });
  });
});