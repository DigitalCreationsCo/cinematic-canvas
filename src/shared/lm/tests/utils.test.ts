import { describe, it, expect, vi } from 'vitest';
import { buildReferenceImageInputs, toContentsFromReferenceImages } from '../utils.js';
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

  describe('toContentsFromReferenceImages', () => {
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

      const results = toContentsFromReferenceImages(input);

      expect(results).toHaveLength(2);

      const baseContent = results.find(r => r.referenceType === 'base');
      expect(baseContent).toBeDefined();
      expect(baseContent?.parts).toHaveLength(2);
      expect(baseContent?.parts![0]).toEqual({ text: 'base.png' });
      expect(baseContent?.parts![1].fileData).toEqual({
        displayName: 'base.png',
        mimeType: 'image/png',
        fileUri: 'gs://b/base.png'
      });

      const styleContent = results.find(r => r.referenceType === 'style');
      expect(styleContent).toBeDefined();
      expect(styleContent?.parts![0]).toEqual({ text: 'style.jpg' });
      expect(styleContent?.imageConfig).toEqual({ styleDescription: 'Pop Art' });
    });

    it('should handle undefined reference images gracefully', () => {
      // @ts-ignore
      const results = toContentsFromReferenceImages(undefined);
      expect(results).toHaveLength(0);
    });

    it('should handle empty reference image sets', () => {
      const input: any = {
        base: [],
        style: undefined
      };
      const results = toContentsFromReferenceImages(input);
      expect(results).toHaveLength(0);
    });

    it('should skip images without gcsUri', () => {
        const input: ReferenceImageInputs = {
            base: [
                { referenceType: 'base', referenceImage: {} as any }
            ]
        };
        const results = toContentsFromReferenceImages(input);
        expect(results).toHaveLength(0);
    });
  });
});
