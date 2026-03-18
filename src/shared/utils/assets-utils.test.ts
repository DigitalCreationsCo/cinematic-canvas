import { extractPatchContent, entityTypeOf, entityIdAt } from '../utils/assets-utils.ts';
import { EntityPatch } from '../types/editable.types.ts';
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

    it('should handle undefined or empty string by returning empty string', () => {
        expect(resolvePublicUrl('')).toBe('');
    });
});

describe('entityTypeOf', () => {
    it('should return "scene" for scope with sceneIds', () => {
        const scope = { projectId: 'proj-1', sceneIds: ['scene-1'] };
        expect(entityTypeOf(scope)).toBe('scene');
    });

    it('should return "character" for scope with characterIds', () => {
        const scope = { projectId: 'proj-1', characterIds: ['char-1'] };
        expect(entityTypeOf(scope)).toBe('character');
    });

    it('should return "location" for scope with locationIds', () => {
        const scope = { projectId: 'proj-1', locationIds: ['loc-1'] };
        expect(entityTypeOf(scope)).toBe('location');
    });

    it('should return "image" for scope with imageIds', () => {
        const scope = { projectId: 'proj-1', imageIds: ['img-1'] };
        expect(entityTypeOf(scope)).toBe('image');
    });

    it('should return "project" for scope with only projectId', () => {
        const scope = { projectId: 'proj-1' };
        expect(entityTypeOf(scope)).toBe('project');
    });
});

describe('entityIdAt', () => {
    it('should return column "sceneId" and ids for sceneIds scope', () => {
        const scope = { projectId: 'proj-1', sceneIds: ['scene-1', 'scene-2'] };
        const result = entityIdAt(scope);
        expect(result.column).toBe('sceneId');
        expect(result.ids).toEqual(['scene-1', 'scene-2']);
    });

    it('should return column "characterId" and ids for characterIds scope', () => {
        const scope = { projectId: 'proj-1', characterIds: ['char-1'] };
        const result = entityIdAt(scope);
        expect(result.column).toBe('characterId');
        expect(result.ids).toEqual(['char-1']);
    });

    it('should return column "locationId" and ids for locationIds scope', () => {
        const scope = { projectId: 'proj-1', locationIds: ['loc-1', 'loc-2', 'loc-3'] };
        const result = entityIdAt(scope);
        expect(result.column).toBe('locationId');
        expect(result.ids).toEqual(['loc-1', 'loc-2', 'loc-3']);
    });

    it('should return column "imageId" and ids for imageIds scope', () => {
        const scope = { projectId: 'proj-1', imageIds: ['img-1'] };
        const result = entityIdAt(scope);
        expect(result.column).toBe('imageId');
        expect(result.ids).toEqual(['img-1']);
    });

    it('should return column "projectId" and ids array for project-only scope', () => {
        const scope = { projectId: 'proj-1' };
        const result = entityIdAt(scope);
        expect(result.column).toBe('projectId');
        expect(result.ids).toEqual(['proj-1']);
    });
});

describe('extractPatchContent', () => {
    it('should process multiple entity types in a single batch', () => {
        const patches: any[] = [
            {
                entityId: 'sc_1',
                entityType: 'scene',
                patch: { title: 'Intro', scene_video: 'vid_01' }
            },
            {
                entityId: 'ch_1',
                entityType: 'character',
                patch: { name: 'Hero', character_image: 'img_01' }
            }
        ];

        const results = extractPatchContent(patches);

        expect(results).toHaveLength(2);
        expect(results[0].assetUpdates).toHaveProperty('scene_video');
        expect(results[1].propertyUpdates).toHaveProperty('name');
    });
});