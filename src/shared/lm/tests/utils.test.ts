import { describe, it, expect, vi } from 'vitest';
import { buildReferenceImageInputs } from '../utils.js';
import { toContentsGoogleFromReferenceImages } from '../google/utils.js';
import { ReferenceImage, ReferenceImageInputs } from '../provider.js';

// Mock mime-types
vi.mock('mime-types', () => ({
  default: {
    lookup: (path: string) => path.endsWith('.png') ? 'image/png' : 'image/jpeg'
  },
  lookup: (path: string) => path.endsWith('.png') ? 'image/png' : 'image/jpeg'
}));

describe('LM Utils', () => {
  describe('buildReferenceImageInputs', () => {
    it('should categorize reference images by type', () => {
      const input: ReferenceImage[] = [
        {
          referenceType: 'base',
          referenceImage: { gcsUri: 'gs://bucket/base1.png' }
        },
        {
          referenceType: 'style',
          referenceImage: { gcsUri: 'gs://bucket/style1.jpg' },
          config: { styleDescription: 'Impressionist' }
        },
        {
          referenceType: 'base',
          referenceImage: { gcsUri: 'gs://bucket/base2.png' }
        }
      ] as any;

      const result = buildReferenceImageInputs(input);

      expect(result.base).toHaveLength(2);
      expect(result.base[0].referenceImage.gcsUri).toBe('gs://bucket/base1.png');
      expect(result.base[1].referenceImage.gcsUri).toBe('gs://bucket/base2.png');

      expect(result.style).toHaveLength(1);
      expect(result.style![0].referenceImage.gcsUri).toBe('gs://bucket/style1.jpg');
      expect(result.style![0].config.styleDescription).toBe('Impressionist');

      expect(result.mask).toBeUndefined();
    });

    it('should filter out undefined inputs', () => {
      const input = [
        { referenceType: 'base', referenceImage: { gcsUri: 'base.png' } },
        undefined,
        null
      ] as any;

      const result = buildReferenceImageInputs(input);
      expect(result.base).toHaveLength(1);
    });

    it('should handle empty input', () => {
      const result = buildReferenceImageInputs([]);
      expect(result).toEqual({});
    });
  });

  describe('toContentsGoogleFromReferenceImages', () => {
    it('should transform reference images object into content array', () => {
      const input: ReferenceImageInputs = {
        base: [
          { referenceType: 'base', referenceImage: { gcsUri: 'gs://b/base.png' } }
        ],
        style: [
          {
            referenceType: 'style',
            referenceImage: { gcsUri: 'gs://b/style.jpg' },
            config: { styleDescription: 'Pop Art' }
          }
        ]
      };

      const results = toContentsGoogleFromReferenceImages(input);

      expect(results).toHaveLength(2);

      expect(results[0].parts![0]).toEqual({ text: 'base.png' });
      expect(results[0].parts![1].fileData).toEqual({
        displayName: 'base.png',
        mimeType: 'image/png',
        fileUri: 'gs://b/base.png'
      });
      expect(results[1].parts![0]).toEqual({ text: 'style.jpg' });
      expect(results[1].imageConfig).toEqual({ styleDescription: 'Pop Art' });
    });

    // arguments are required now, so this test is not needed
    // it('should handle undefined reference images gracefully', () => {
    //   const results = toContentsGoogleFromReferenceImages(undefined);
    //   expect(results).toHaveLength(0);
    // });

    it('should handle empty reference image sets', () => {
      const input: any = {
        base: [],
        style: undefined
      };
      const results = toContentsGoogleFromReferenceImages(input);
      expect(results).toHaveLength(0);
    });

    it('should skip images without gcsUri', () => {
      const input: ReferenceImageInputs = {
        base: [
          { referenceType: 'base', referenceImage: {} as any }
        ]
      };
      const results = toContentsGoogleFromReferenceImages(input);
      expect(results).toHaveLength(0);
    });
  });
});
