import { getProviderTextModelNames, getProviderImageModelNames, getProviderQualityCheckModelNames, getProviderVideoModelNames } from '../../src/shared/lm/models.js';

describe('Model Fallback Configuration', () => {
  beforeEach(() => {
    // Clear environment variables before each test
    delete process.env.TEXT_MODEL_NAMES;
    delete process.env.IMAGE_MODEL_NAMES;
    delete process.env.QUALITY_EVALUATION_MODEL_NAMES;
    delete process.env.VIDEO_MODEL_NAMES;
    delete process.env.TEXT_MODEL_NAME;
    delete process.env.IMAGE_MODEL_NAME;
    delete process.env.QUALITY_EVALUATION_MODEL_NAME;
    delete process.env.VIDEO_MODEL_NAME;
  });

  describe('getProviderTextModelNames', () => {
    it('should return single model when no fallbacks configured', () => {
      process.env.TEXT_MODEL_NAME = 'gemini-3-pro-preview';
      const result = getProviderTextModelNames('google');
      expect(result).toEqual(['gemini-3-pro-preview']);
    });

    it('should parse comma-separated fallback models', () => {
      process.env.TEXT_MODEL_NAMES = 'gemini-3-pro-preview,gemini-2.5-pro,gemini-1.5-flash';
      const result = getProviderTextModelNames('google');
      expect(result).toEqual(['gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-1.5-flash']);
    });

    it('should handle whitespace in comma-separated models', () => {
      process.env.TEXT_MODEL_NAMES = 'gemini-3-pro-preview, gemini-2.5-pro , gemini-1.5-flash';
      const result = getProviderTextModelNames('google');
      expect(result).toEqual(['gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-1.5-flash']);
    });

    it('should prioritize plural environment variable over singular', () => {
      process.env.TEXT_MODEL_NAMES = 'gemini-3-pro-preview,gemini-2.5-pro';
      process.env.TEXT_MODEL_NAME = 'gemini-1.5-flash';
      const result = getProviderTextModelNames('google');
      expect(result).toEqual(['gemini-3-pro-preview', 'gemini-2.5-pro']);
    });

    it('should filter out empty strings', () => {
      process.env.TEXT_MODEL_NAMES = 'gemini-3-pro-preview,,gemini-2.5-pro,';
      const result = getProviderTextModelNames('google');
      expect(result).toEqual(['gemini-3-pro-preview', 'gemini-2.5-pro']);
    });
  });

  describe('getProviderImageModelNames', () => {
    it('should return single model when no fallbacks configured', () => {
      process.env.IMAGE_MODEL_NAME = 'gemini-3-pro-image-preview';
      const result = getProviderImageModelNames('google');
      expect(result).toEqual(['gemini-3-pro-image-preview']);
    });

    it('should parse comma-separated fallback models', () => {
      process.env.IMAGE_MODEL_NAMES = 'gemini-3-pro-image-preview,gemini-2.5-flash-image';
      const result = getProviderImageModelNames('google');
      expect(result).toEqual(['gemini-3-pro-image-preview', 'gemini-2.5-flash-image']);
    });
  });

  describe('getProviderQualityCheckModelNames', () => {
    it('should return single model when no fallbacks configured', () => {
      process.env.QUALITY_EVALUATION_MODEL_NAME = 'gemini-2.5-pro';
      const result = getProviderQualityCheckModelNames('google');
      expect(result).toEqual(['gemini-2.5-pro']);
    });

    it('should parse comma-separated fallback models', () => {
      process.env.QUALITY_EVALUATION_MODEL_NAMES = 'gemini-2.5-pro,gemini-1.5-pro';
      const result = getProviderQualityCheckModelNames('google');
      expect(result).toEqual(['gemini-2.5-pro', 'gemini-1.5-pro']);
    });
  });

  describe('getProviderVideoModelNames', () => {
    it('should return single model when no fallbacks configured', () => {
      process.env.VIDEO_MODEL_NAME = 'veo-2.0-generate-exp';
      const result = getProviderVideoModelNames('google');
      expect(result).toEqual(['veo-2.0-generate-exp']);
    });

    it('should parse comma-separated fallback models', () => {
      process.env.VIDEO_MODEL_NAMES = 'veo-2.0-generate-exp,veo-1.0-generate';
      const result = getProviderVideoModelNames('google');
      expect(result).toEqual(['veo-2.0-generate-exp', 'veo-1.0-generate']);
    });

    it('should handle LTX provider', () => {
      process.env.VIDEO_MODEL_NAMES = 'ltx-video-model,ltx-fallback';
      const result = getProviderVideoModelNames('ltx');
      expect(result).toEqual(['ltx-video-model', 'ltx-fallback']);
    });
  });

  describe('Backward Compatibility', () => {
    it('should fall back to singular environment variable when plural not set', () => {
      process.env.TEXT_MODEL_NAME = 'gemini-3-pro-preview';
      process.env.IMAGE_MODEL_NAME = 'gemini-3-pro-image-preview';
      process.env.QUALITY_EVALUATION_MODEL_NAME = 'gemini-2.5-pro';
      process.env.VIDEO_MODEL_NAME = 'veo-2.0-generate-exp';

      expect(getProviderTextModelNames('google')).toEqual(['gemini-3-pro-preview']);
      expect(getProviderImageModelNames('google')).toEqual(['gemini-3-pro-image-preview']);
      expect(getProviderQualityCheckModelNames('google')).toEqual(['gemini-2.5-pro']);
      expect(getProviderVideoModelNames('google')).toEqual(['veo-2.0-generate-exp']);
    });
  });
});
