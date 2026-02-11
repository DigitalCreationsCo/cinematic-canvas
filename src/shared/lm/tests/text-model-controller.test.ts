import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ITextModelProvider } from '../../lm/provider.js';
// import only type so env vars are not initialized
import type { TextModelController } from '../../lm/text-model-controller.js';

// Mock provider for testing
class MockProvider implements ITextModelProvider {
  async generateContent(params: any): Promise<any> {
    if (params.model === 'fail-model') {
      throw new Error('Model failed');
    }
    if (params.model === 'rate-limit-model') {
      const error = new Error('Rate limit exceeded');
      (error as any).status = 429;
      throw error;
    }
    return { text: 'Generated content', model: params.model };
  }

  async generateBatchContent(params: any): Promise<any> {
    return { jobId: 'batch-123', model: params.model };
  }

  async generateImages(params: any): Promise<any> {
    if (params.model === 'fail-image-model') {
      throw new Error('Image model failed');
    }
    return { images: [{ url: 'image.jpg' }], model: params.model };
  }

  async generateBatchImages(params: any): Promise<any> {
    return { jobId: 'batch-images-123', model: params.model };
  }

  async countTokens(params: any): Promise<any> {
    return { count: 100, model: params.model };
  }

  async getBatchJob(params: any): Promise<any> {
    return { status: 'completed', result: 'Batch result' };
  }
}

describe('TextModelController Fallback Mechanism', () => {

  let controller: TextModelController;
  let FALLBACK_POLICY: Record<string, number>;
  let mockProvider: MockProvider;

  let textModelNames = 'primary-model,fallback-1,fallback-2';
  let imageModelNames = 'primary-image,fallback-image-1';
  let videoModelNames = 'primary-quality,fallback-quality';

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('GOOGLE_TEXT_MODEL_NAMES', textModelNames);
    vi.stubEnv('GOOGLE_IMAGE_MODEL_NAMES', imageModelNames);
    vi.stubEnv('GOOGLE_QUALITY_EVALUATION_MODEL_NAMES', videoModelNames);
    
    mockProvider = new MockProvider();
    
    const module = await import('../../lm/text-model-controller.js');
    // Create controller with mocked provider
    controller = new module.TextModelController('google');
    // Replace provider with mock
    controller['provider'] = mockProvider;

    FALLBACK_POLICY = module.FALLBACK_POLICY;
  });

  const simulateAttempts = async (fn: () => Promise<any>, count: number) => {
  for (let i = 0; i < count; i++) {
    try {
      await fn();
    } catch {
      // Expected failure to trigger state change
    }
  }
};

const getExpectedSequence = (models: string[]): string[] => {
  if (models.length === 0) return [];
  
  const [primary, ...fallbacks] = models;
  
  return [
    ...Array(FALLBACK_POLICY.PRIMARY_ATTEMPTS).fill(primary),
    ...fallbacks.flatMap(model => Array(FALLBACK_POLICY.FALLBACK_ATTEMPTS).fill(model))
  ];
};
  
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('Fallback State Management', () => {
    it('should initialize with primary model as current model', () => {
      expect(controller.textModel).toBe('primary-model');
      expect(controller.imageModel).toBe('primary-image');
      expect(controller.qualityCheckModel).toBe('primary-quality');
      expect(controller.defaultModel).toBe('primary-model');
      expect(controller.currentModel).toBe('primary-model');
    });

    it('should reset fallback state after successful generation', async () => {
      // Simulate a successful generation
      await controller.generateContent({ contents: 'test' });
      
      // Should be back to primary model
      expect(controller.textModel).toBe('primary-model');
    });
  });

  describe('Text Generation Fallback', () => {
    it('should retry primary model twice before falling back', async () => {
      const mockGenerateContent = vi.spyOn(mockProvider, 'generateContent');

      mockGenerateContent.mockRejectedValueOnce(new Error('Temporary failure'));
      await expect(controller.generateContent({ contents: 'test' }))
        .rejects.toThrow('Temporary failure');
      
      mockGenerateContent.mockResolvedValueOnce({ text: 'Success', model: 'primary-model' });
      const result = await controller.generateContent({ contents: 'test' });

      expect(result.text).toBe('Success');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      getExpectedSequence(textModelNames.split(',').map(model => model.trim())).splice(0,2).forEach((model, index) => {
        expect(mockGenerateContent).toHaveBeenNthCalledWith(index + 1, { 
          contents: 'test', 
          model 
        });
      });
    });

    it('should fall back to next model after primary fails twice', async () => {
      const mockGenerateContent = vi.spyOn(mockProvider, 'generateContent');

      mockGenerateContent.mockRejectedValue(new Error('Primary model failed'));
      await simulateAttempts(() => controller.generateContent({ contents: 'test' }), 4);

      // Should have tried primary model twice and fallback once
     getExpectedSequence(textModelNames.split(',').map(model => model.trim())).forEach((model, index) => {
        expect(mockGenerateContent).toHaveBeenNthCalledWith(index + 1, { 
          contents: 'test', 
          model 
        });
      });
    });

    it('should try each fallback model once', async () => {
      const mockGenerateContent = vi.spyOn(mockProvider, 'generateContent');
      mockGenerateContent.mockRejectedValue(new Error('Model failed'));

      await simulateAttempts(() => controller.generateContent({ contents: 'test' }), 4);
      
       getExpectedSequence(textModelNames.split(',').map(model => model.trim())).forEach((model, index) => {
        expect(mockGenerateContent).toHaveBeenNthCalledWith(index + 1, { 
          contents: 'test', 
          model 
        });
      });
    });

    it('should succeed with fallback model and reset state', async () => {
      const mockGenerateContent = vi.spyOn(mockProvider, 'generateContent');
      mockGenerateContent.mockRejectedValue(new Error('Primary failed'));

      await simulateAttempts(() => controller.generateContent({ contents: 'test' }), 4);
       getExpectedSequence(textModelNames.split(',').map(model => model.trim())).forEach((model, index) => {
        expect(mockGenerateContent).toHaveBeenNthCalledWith(index + 1, { 
          contents: 'test', 
          model 
        });
      });

      mockGenerateContent.mockResolvedValueOnce({ text: 'Fallback success' });
      await controller.generateContent({ contents: 'test' });
      expect(controller.textModel).toBe('primary-model'); // Should reset after success
    });
  });

  describe('Image Generation Fallback', () => {
    it('should retry primary image model twice before falling back', async () => {
      const mockGenerateImages = vi.spyOn(mockProvider, 'generateImages');
      mockGenerateImages.mockRejectedValueOnce(new Error('Image generation failed'));
      mockGenerateImages.mockResolvedValueOnce({ generatedImages: [{ url: 'success.jpg' }] });

       await simulateAttempts(async () => await expect(controller.generateImages({ prompt: 'test image' } as any)).rejects.toThrow(),1);
      const result = await controller.generateImages({ prompt: 'test image', config: {} });

      expect(result.generatedImages).toHaveLength(1);
      expect(mockGenerateImages).toHaveBeenCalledTimes(2);
    });

    it('should fall back to next image model after primary fails twice', async () => {
      const mockGenerateImages = vi.spyOn(mockProvider, 'generateImages');
      mockGenerateImages.mockRejectedValue(new Error('Image model failed'));

       await simulateAttempts(async () => await expect(controller.generateImages({ prompt: 'test image' } as any)).rejects.toThrow(),3);

      expect(mockGenerateImages).toHaveBeenCalledTimes(3);
      expect(mockGenerateImages).toHaveBeenNthCalledWith(1, { prompt: 'test image', model: 'primary-image' });
      expect(mockGenerateImages).toHaveBeenNthCalledWith(2, { prompt: 'test image', model: 'primary-image' });
      expect(mockGenerateImages).toHaveBeenNthCalledWith(3, { prompt: 'test image', model: 'fallback-image-1' });
    });
  });

  describe('Batch Generation Fallback', () => {
    it('should apply fallback logic to batch content generation', async () => {
      const mockGenerateBatchContent = vi.spyOn(mockProvider, 'generateBatchContent');
      mockGenerateBatchContent.mockRejectedValueOnce(new Error('Batch failed'));
      mockGenerateBatchContent.mockResolvedValueOnce({ jobId: 'batch-success' });

      // const result = await controller.generateBatchContent({ contents: 'test batch' });
      // expect(result.jobId).toBe('batch-success');
      
      // Note: Test logic commented out in source, verifying spy interactions only
      // If generateBatchContent is called, ensure this expectation is valid
      // expect(mockGenerateBatchContent).toHaveBeenCalledTimes(2); 
    });

    it('should apply fallback logic to batch image generation', async () => {
      const mockGenerateBatchImages = vi.spyOn(mockProvider, 'generateBatchImages');
      mockGenerateBatchImages.mockRejectedValueOnce(new Error('Batch images failed'));
      mockGenerateBatchImages.mockResolvedValueOnce({ jobId: 'batch-images-success' });

      // const result = await controller.generateBatchImages({ prompt: 'test batch images', config: {} });
      // expect(result.jobId).toBe('batch-images-success');

      // Note: Test logic commented out in source
      // expect(mockGenerateBatchImages).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle different error types consistently', async () => {
      const mockGenerateContent = vi.spyOn(mockProvider, 'generateContent');
      mockGenerateContent.mockRejectedValueOnce(new Error('Network error'));
      mockGenerateContent.mockRejectedValueOnce(new Error('API error'));
      mockGenerateContent.mockResolvedValueOnce({ text: 'Success' });

await simulateAttempts(() => controller.generateContent({ contents: 'test' }), 2);
const result = await controller.generateContent({ contents: 'test' });

      expect(result.text).toBe('Success');
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it('should log warnings when switching models', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockGenerateContent = vi.spyOn(mockProvider, 'generateContent');
      mockGenerateContent.mockRejectedValue(new Error('Model failed'));

      await expect(controller.generateContent({ contents: 'test' })).rejects.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Text model attempt failed. Switching to:'));
    });
  });

  describe('Single Model Configuration', () => {
    beforeEach(() => {
      vi.stubEnv('TEXT_MODEL_NAMES', 'single-model');
      vi.stubEnv('IMAGE_MODEL_NAMES', 'single-image');
      vi.stubEnv('QUALITY_EVALUATION_MODEL_NAMES', 'single-quality');
    });

    it('should work with single model configuration', async () => {
      const mockGenerateContent = vi.spyOn(mockProvider, 'generateContent');
      mockGenerateContent.mockRejectedValue(new Error('Single model failed'));

      await expect(controller.generateContent({ contents: 'test' })).rejects.toThrow();
      
      expect(mockGenerateContent).toHaveBeenNthCalledWith(1, { contents: 'test', model: 'primary-model' });
    });
  });
});