
import { describe, it, expect, vi } from 'vitest';
import { GCPStorageManager } from './storage-manager.js';

// Mock the Google Cloud Storage dependency
vi.mock('@google-cloud/storage', () => {
    return {
        Storage: class {
            bucket() {
                return {
                    iam: {
                        testPermissions: () => Promise.resolve([ {
                            'storage.objects.get': true,
                            'storage.objects.list': true,
                            'storage.objects.create': true,
                            'storage.objects.delete': true
                        } ])
                    }
                };
            }
        }
    };
});

describe('GCPStorageManager Versioning', () => {
    const projectId = 'test-project';
    const videoId = 'test-video-id';
    const bucketName = 'test-bucket';
    const storageManager = new GCPStorageManager(projectId, videoId, bucketName);

    it('should include version in character_image path', () => {
        const path = storageManager.getObjectPath({
            type: 'character_image',
            characterId: 'char-123',
            version: 5
        });
        expect(path).toBe(`test-bucket/${videoId}/images/characters/char-123_reference_05.png`);
    });

    it('should include version in location_image path', () => {
        const path = storageManager.getObjectPath({
            type: 'location_image',
            locationId: 'loc-456',
            version: 2
        });
        expect(path).toBe(`test-bucket/${videoId}/images/locations/loc-456_reference_02.png`);
    });

    it('should include version in render_video path', () => {
        const path = storageManager.getObjectPath({
            type: 'render_video',
            projectId: 'proj-789',
            version: 3
        });
        expect(path).toBe(`test-bucket/${videoId}/final/movie_03.mp4`);
    });

    it('should include version in final_output path', () => {
        const path = storageManager.getObjectPath({
            type: 'final_output',
            projectId: 'proj-789',
            version: 12
        });
        expect(path).toBe(`test-bucket/${videoId}/final/final_output_12.json`);
    });

    it('should include version in scene_video path (existing functionality)', () => {
        const path = storageManager.getObjectPath({
            type: 'scene_video',
            sceneId: 'scene-001',
            version: 4
        });
        // Note: sceneId is usually part number, but here it's string. The code does .toString().padStart(...)
        // If sceneId is "scene-001", padStart might act weird if it expects a number for padding logic but it just stringifies.
        // Let's check the code: `scene_${params.sceneId.toString().padStart(3, '0')}`.
        // If sceneId is a number 1 -> 001. If it's a UUID string, it won't pad but just use it.
        // The test just needs to verify the version suffix is present: `_04.mp4`
        expect(path).toContain('_04.mp4');
    });
    it('should include version and uniqueId in scene_video path (existing functionality)', () => {
        const path = storageManager.getObjectPath({
            type: 'scene_video',
            sceneId: 'scene-001',
            version: 4,
            uniqueId: 'job-123'
        });
        expect(path).toContain('_04_job-123.mp4');
    });

    it('should include uniqueId in other paths when provided', () => {
        const path = storageManager.getObjectPath({
            type: 'character_image',
            characterId: 'char-123',
            version: 5,
            uniqueId: 'job-999'
        });
        expect(path).toBe(`test-bucket/${videoId}/images/characters/char-123_reference_05_job-999.png`);
    });
});
