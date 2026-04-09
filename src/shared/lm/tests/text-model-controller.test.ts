import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextModelController } from '../../lm/text-model-controller.js';

const mocks = vi.hoisted(() => ({
  GoogleProvider: class {
    generateContent = vi.fn();
    generateImages = vi.fn();
    countTokens = vi.fn();
  },
  GlobalCooldown: class {
    static wait = vi.fn().mockResolvedValue(undefined);
    static markCallComplete: any = vi.fn();
  }
}));

vi.mock('../../lm/google/provider.js', () => ({ GoogleProvider: mocks.GoogleProvider }));
vi.mock('../../utils/execute-with-retry.js', () => ({ GlobalCooldown: mocks.GlobalCooldown }));
vi.mock('../../lm/models.js', () => ({
  getProviderTextModelNames: vi.fn().mockReturnValue(['text-0', 'text-1']),
  getProviderImageModelNames: vi.fn().mockReturnValue(['img-0', 'img-1']),
  getProviderQualityCheckModelNames: vi.fn().mockReturnValue(['q-0']),
}));

describe('TextModelController Coverage Suite', () => {
  let provider: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new mocks.GoogleProvider();
  });

  describe('Mode: Quality (Reset on Success)', () => {
    it.skip('should return to index 0 after success on a fallback', async () => {
      const ctrl = new TextModelController('google', { modeModelPriority: 'quality' });
      (ctrl as any).provider = provider;

      provider.generateContent.mockRejectedValueOnce(new Error('Fail 0')).mockResolvedValueOnce({ text: 'Ok' });

      // 1. First call fails, shifts to text-1
      await expect(ctrl.generateContent({ contents: [] })).rejects.toThrow();
      expect(ctrl.textModel).toBe('text-1');

      // 2. Second call succeeds, resets to text-0
      await ctrl.generateContent({ contents: [] });
      expect(ctrl.textModel).toBe('text-0');
    });
  });

  describe('Mode: Env Variable', () => {
    it('should use the speed modeModelPriority from the environment variable', async () => {
      process.env.MODEL_PRIORITY = 'speed';
      const ctrl = new TextModelController('google');
      expect(ctrl['modeModelPriority']).toBe('speed');
    });

    it('should use the quality modeModelPriority from the environment variable', async () => {
      process.env.MODEL_PRIORITY = 'quality';
      const ctrl = new TextModelController('google');
      expect(ctrl['modeModelPriority']).toBe('quality');
    });
  });

  describe('Mode: Speed (Sticky State)', () => {
    it('should maintain the fallback index after a successful call', async () => {
      const ctrl = new TextModelController('google', { modeModelPriority: 'speed' });
      (ctrl as any).provider = provider;

      provider.generateContent.mockRejectedValueOnce(new Error('Fail 0')).mockResolvedValue({ text: 'Ok' });

      // 1. Fail primary -> shift to text-1
      await expect(ctrl.generateContent({ contents: [] })).rejects.toThrow();
      expect(ctrl.textModel).toBe('text-1');

      // 2. Success on fallback -> stay on text-1
      await ctrl.generateContent({ contents: [] });
      expect(ctrl.textModel).toBe('text-1');
    });
  });

  describe('Wraparound Logic', () => {
    it('should wrap around to 0 when all models fail', async () => {
      const ctrl = new TextModelController('google', { modeModelPriority: 'quality' });
      (ctrl as any).provider = provider;
      provider.generateContent.mockRejectedValue(new Error('Fail'));

      await expect(ctrl.generateContent({ contents: [] })).rejects.toThrow(); // index 1
      expect(ctrl.textModel).toBe('text-1');

      await expect(ctrl.generateContent({ contents: [] })).rejects.toThrow(); // index 0 (wrap)
      expect(ctrl.textModel).toBe('text-0');
    });
  });

  describe('Model Separation', () => {
    it('should track image and text models independently', async () => {
      const ctrl = new TextModelController('google', { modeModelPriority: 'speed' });
      (ctrl as any).provider = provider;
      provider.generateContent.mockRejectedValueOnce(new Error('Fail'));
      provider.generateImages.mockResolvedValueOnce({});

      // Fail text model
      await expect(ctrl.generateContent({ contents: [] })).rejects.toThrow();
      expect(ctrl.textModel).toBe('text-1');

      // Image model should still be 0
      expect(ctrl.imageModel).toBe('img-0');
    });
  });

  describe('Utilities', () => {
    it('should cover countTokens passthrough', async () => {
      const ctrl = new TextModelController('google');
      (ctrl as any).provider = provider;
      provider.countTokens.mockResolvedValue(10);
      const res = await ctrl.countTokens({ contents: [] });
      expect(res).toBe(10);
      expect(provider.countTokens).toHaveBeenCalledWith(expect.objectContaining({ model: 'text-0' }));
    });
  });
});
