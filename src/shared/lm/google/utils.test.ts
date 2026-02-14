import { describe, it, expect, vi } from 'vitest';
import { toContentsFileData, fromContentsFileData } from './your-file-path';

// Mocking mime-types to ensure consistent test results
vi.mock('mime-types', () => ({
    lookup: vi.fn((path) => path.endsWith('.png') ? 'image/png' : 'image/jpeg')
}));

describe('ReferenceImage Data Transformations', () => {
    const mockImages = [
        {
            referenceImage: { gcsUri: 'gs://bucket/folder/image1.png' }
        },
        {
            referenceImage: { gcsUri: 'gs://bucket/photo.jpg' }
        }
    ];

    it('toContentsFileData: should correctly flatten images into text and fileData pairs', () => {
        const result = toContentsFileData(mockImages);

        expect(result).toHaveLength(4); // 2 pairs of [text, fileData]
        expect(result[ 0 ]).toEqual({ text: 'image1.png' });
        expect(result[ 1 ].fileData).toMatchObject({
            displayName: 'image1.png',
            mimeType: 'image/png',
            fileUri: 'gs://bucket/folder/image1.png'
        });
    });

    it('fromContentsFileData: should reconstruct ReferenceImage objects from flattened data', () => {
        const flattened = toContentsFileData(mockImages);
        const reconstructed = fromContentsFileData(flattened);

        expect(reconstructed).toHaveLength(2);
        expect(reconstructed[ 0 ].referenceImage?.gcsUri).toBe(mockImages[ 0 ].referenceImage.gcsUri);
        expect(reconstructed[ 1 ].referenceImage?.gcsUri).toBe(mockImages[ 1 ].referenceImage.gcsUri);
    });

    it('Round-trip: data should be consistent after to and from operations', () => {
        const result = fromContentsFileData(toContentsFileData(mockImages));

        // Check that the core data (gcsUri) survived the round trip
        expect(result.map(img => img.referenceImage?.gcsUri))
            .toEqual(mockImages.map(img => img.referenceImage.gcsUri));
    });

    it('Edge Case: should handle undefined and images without gcsUri', () => {
        const mixedInput = [
            undefined,
            { referenceImage: {} }, // Missing gcsUri
            { referenceImage: { gcsUri: 'gs://valid/path.png' } }
        ];

        const result = toContentsFileData(mixedInput);
        expect(result).toHaveLength(2); // Only the valid one should produce a pair
        expect(result[ 0 ].text).toBe('path.png');
    });
});
