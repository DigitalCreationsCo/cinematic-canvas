import { describe, it, expect } from 'vitest';
import { resolvePublicUrl } from './utils.js';

describe('resolvePublicUrl', () => {
    it('should return empty string for null/undefined', () => {
        expect(resolvePublicUrl(null)).toBe('');
        expect(resolvePublicUrl(undefined)).toBe('');
    });

    it('should return http/https URLs as is', () => {
        expect(resolvePublicUrl('https://example.com/image.png')).toBe('https://example.com/image.png');
        expect(resolvePublicUrl('http://localhost:3000/video.mp4')).toBe('http://localhost:3000/video.mp4');
    });

    it('should resolve gs:// URIs to public https URLs', () => {
        expect(resolvePublicUrl('gs://my-bucket/folder/file.png')).toBe('https://storage.googleapis.com/my-bucket/folder/file.png');
    });

    it('should handle paths without protocol by assuming they are relative to storage', () => {
        expect(resolvePublicUrl('my-bucket/folder/file.png')).toBe('https://storage.googleapis.com/my-bucket/folder/file.png');
    });

    it('should handle undefined or empty string by returning empty string', () => {
        // @ts-ignore - testing runtime safety
        expect(resolvePublicUrl('')).toBe('');
    });
});

