import { describe, it, expect, vi } from 'vitest';
import { toContentsFileDataFromReferenceImages, toReferenceImagesFromContentsFileData } from './utils.js';

// Mocking mime-types to ensure consistent test results
vi.mock('mime-types', () => ({
    lookup: vi.fn((path) => path.endsWith('.png') ? 'image/png' : 'image/jpeg')
}));

describe('ReferenceImage Data Transformations', () => {
    const incompleteMockReferenceImages = [
        {
            referenceImage: { gcsUri: 'gs://bucket/folder/image1.png' }
        },
        {
            referenceImage: { gcsUri: 'gs://bucket/photo.jpg' }
        }
    ];
    const completeMockReferenceImages = [
        {
            referenceImage: { gcsUri: 'gs://bucket/folder/image1.png' },
            configuration: {
                subjectType: 'SUBJECT_TYPE_DEFAULT' as const,
                subjectDescription: 'A cinematic sunset'
            }
        },
        {
            referenceImage: { gcsUri: 'gs://bucket/photo.jpg' },
            configuration: {
                subjectType: 'SUBJECT_TYPE_DEFAULT' as const,
                subjectDescription: 'A cinematic sunset'
            }
        }
    ];

    it('toContentsFileDataFromReferenceImages: should correctly flatten images into text and fileData pairs', () => {
        const result = toContentsFileDataFromReferenceImages(completeMockReferenceImages);

        expect(result).toHaveLength(4); // 2 pairs of [text, fileData]
        expect(result[ 0 ]).toEqual({ text: 'image1.png' });
        expect(result[ 1 ].parts?.[ 0 ]?.fileData).toMatchObject({
            displayName: 'image1.png',
            mimeType: 'image/png',
            fileUri: 'gs://bucket/folder/image1.png'
        });
    });

    it('toReferenceImagesFromContentsFileData: should reconstruct ReferenceImage objects from flattened data', () => {
        const flattened = toContentsFileDataFromReferenceImages(completeMockReferenceImages);
        const reconstructed = toReferenceImagesFromContentsFileData(flattened);

        expect(reconstructed).toHaveLength(2);
        expect(reconstructed[ 0 ].referenceImage?.gcsUri).toBe(completeMockReferenceImages[ 0 ].referenceImage.gcsUri);
        expect(reconstructed[ 1 ].referenceImage?.gcsUri).toBe(completeMockReferenceImages[ 1 ].referenceImage.gcsUri);
    });

    it('Round-trip: data should be consistent after to and from operations', () => {
        const result = toReferenceImagesFromContentsFileData(toContentsFileDataFromReferenceImages(completeMockReferenceImages));

        // Check that the core data (gcsUri) survived the round trip
        expect(result.map(img => img.referenceImage?.gcsUri))
            .toEqual(completeMockReferenceImages.map(img => img.referenceImage.gcsUri));
    });

    it('incomplete reference images should not return any pairs', () => {
        const result = toContentsFileDataFromReferenceImages(incompleteMockReferenceImages as any);
        expect(result).toHaveLength(0);
    });

    it('Edge Case: should handle undefined and images without gcsUri', () => {
        const mixedInput = [
            undefined,
            { referenceImage: {} }, // Missing gcsUri
            { referenceImage: { gcsUri: 'gs://valid/path.png' } }
        ];

        const result = toContentsFileDataFromReferenceImages(mixedInput as any);
        expect(result).toHaveLength(1); // Only the valid one should produce a pair
        expect(result[ 0 ].parts?.[ 0 ]?.text).toBe('path.png');
    });
});

describe('toReferenceImagesFromContentsFileData', () => {
    it('should correctly map fields when imageConfig is present', () => {
        const mockContent = [ {
            parts: [ { fileData: { fileUri: 'gs://bucket/test.jpg' } } ],
            imageConfig: { subjectDescription: 'A cinematic sunset', subjectType: 'SCENE' }
        } ];
        const result = toReferenceImagesFromContentsFileData(mockContent as any);
        expect(result[ 0 ].configuration.subjectDescription).toBe('A cinematic sunset');
    });

    it('should not throw error and return empty config if imageConfig is missing', () => {
        const mockContent = [ {
            parts: [ { fileData: { fileUri: 'gs://bucket/test.jpg' } } ]
        } ];
        const result = toReferenceImagesFromContentsFileData(mockContent as any);
        expect(result[ 0 ].referenceImage.gcsUri).toBe('gs://bucket/test.jpg');
        expect(result[ 0 ].configuration).toEqual({});
    });
});

// Mocking mime-types to ensure predictable test results
vi.mock('mime-types', () => ({
    default: {
        lookup: (path: string) => path.endsWith('.png') ? 'image/png' : 'image/jpeg'
    }
}));

describe('toContentsFileDataFromReferenceImages', () => {

    const mockReferenceImages = [
        {
            referenceImage: { gcsUri: 'gs://bucket/assets/hero_character.png' },
            configuration: {
                subjectType: "SUBJECT_TYPE_PERSON" as const,
                subjectDescription: "A rugged explorer in a futuristic suit"
            },
            maskImageConfig: { someMaskData: [ 1, 2, 3 ] }
        },
        {
            // This entry should be filtered out (missing gcsUri)
            referenceImage: { gcsUri: '' },
            configuration: { subjectType: "SUBJECT_TYPE_DEFAULT" as const, subjectDescription: "" }
        },
        {
            referenceImage: { gcsUri: 'gs://bucket/assets/background_mountain.jpg' },
            configuration: {
                subjectType: "SUBJECT_TYPE_DEFAULT" as const,
                subjectDescription: "Snowy peaks at sunset"
            }
            // maskImageConfig is undefined here to test optionality
        }
    ];

    it('should filter out images without a gcsUri', () => {
        const result = toContentsFileDataFromReferenceImages(mockReferenceImages as any);
        expect(result).toHaveLength(2);
    });

    it('should correctly parse the displayName and mimeType from the URI', () => {
        const result = toContentsFileDataFromReferenceImages(mockReferenceImages as any);

        expect(result[ 0 ].parts?.[ 0 ]?.text).toBe('hero_character.png');
        expect(result[ 0 ].parts?.[ 1 ]?.fileData?.mimeType).toBe('image/png');

        expect(result[ 1 ].parts?.[ 0 ]?.text).toBe('background_mountain.jpg');
        expect(result[ 1 ].parts?.[ 1 ]?.fileData?.mimeType).toBe('image/jpeg');
    });

    it('should preserve the imageConfig and maskImageConfig for narrative continuity', () => {
        const result = toContentsFileDataFromReferenceImages(mockReferenceImages as any);

        // Check first item (Complete data)
        expect(result[ 0 ].imageConfig).toEqual({
            subjectType: "SUBJECT_TYPE_PERSON",
            subjectDescription: "A rugged explorer in a futuristic suit",
            maskImageConfig: { someMaskData: [ 1, 2, 3 ] }
        });

        // Check second item (Missing maskImageConfig)
        expect(result[ 1 ].imageConfig?.subjectType).toBe("SUBJECT_TYPE_DEFAULT");
        expect(result[ 1 ].imageConfig?.maskImageConfig).toBeUndefined();
    });

    it('should map the fileUri accurately', () => {
        const result = toContentsFileDataFromReferenceImages(mockReferenceImages as any);
        expect(result[ 0 ].parts?.[ 1 ].fileData?.fileUri).toBe('gs://bucket/assets/hero_character.png');
    });
});