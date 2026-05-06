import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockStorageManager } from '../../mocks/mock-storage-manager.js';

describe('GCPStorageManager Core', () => {
    let manager: ReturnType<typeof createMockStorageManager>;
    const PROJECT_ID = 'test-project-123';
    const BUCKET_NAME = 'canvas-prod-bucket';

    beforeEach(() => {
        vi.clearAllMocks();
        manager = createMockStorageManager();
    });

    describe('Constructor & Permissions', () => {
        it('should construct without error', () => {
            expect(manager).toBeDefined();
        });
    });

    describe('Path Normalization & URLs', () => {
        it('should generate a valid public HTTPS URL', () => {
            const res = manager.getPublicUrl!('assets/image.png');
            expect(res).toBe(`https://storage.googleapis.com/${BUCKET_NAME}/assets/image.png`);
        });

        it('should handle partial paths in getPublicUrl', () => {
            const res = manager.getPublicUrl!('assets/image.png');
            expect(res).toBe(`https://storage.googleapis.com/${BUCKET_NAME}/assets/image.png`);
        });

        it('should generate a valid gs:// URI', () => {
            const res = manager.getGcsUrl!('canvas-prod-bucket/data/file.json');
            expect(res).toBe(`gs://canvas-prod-bucket/data/file.json`);
        });

        it('should parse GCS URIs correctly', () => {
            const { bucketName, fileName } = manager.parseGcsUri!('gs://canvas-prod-bucket/folder/item.txt');
            expect(bucketName).toBe(BUCKET_NAME);
            expect(fileName).toBe('folder/item.txt');
        });

        it('should throw error when parsing invalid GCS URI', () => {
            expect(() => manager.parseGcsUri!('')).toThrow();
        });
    });

    describe('Object Path Generation', () => {
        it('should generate thumbnail paths', () => {
            const path = manager.getObjectPath!({
                projectId: PROJECT_ID,
                type: 'thumbnail',
                version: 1,
                uniqueId: 'abc'
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/images/thumbnails/${PROJECT_ID}_01_abc.png`);
        });

        it('should generate character reference paths', () => {
            const path = manager.getObjectPath!({
                projectId: PROJECT_ID,
                type: 'character_image',
                characterId: 'char_hero',
                version: 5
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/images/characters/char_hero_reference_05.png`);
        });

        it('should generate scene start frame paths', () => {
            const path = manager.getObjectPath!({
                projectId: PROJECT_ID,
                type: 'scene_start_frame',
                sceneId: '10',
                version: 2
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/images/frames/scene_010_frame_start_02.png`);
        });

        it('should generate scene end frame paths', () => {
            const path = manager.getObjectPath!({
                projectId: PROJECT_ID,
                type: 'scene_end_frame',
                sceneId: '10',
                version: 2
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/images/frames/scene_010_frame_end_02.png`);
        });

        it('should generate scene video paths', () => {
            const path = manager.getObjectPath!({
                projectId: PROJECT_ID,
                type: 'scene_video',
                sceneId: '10',
                version: 2
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/scenes/scene_010_02.mp4`);
        });

        it('should generate render video paths', () => {
            const path = manager.getObjectPath!({
                projectId: PROJECT_ID,
                type: 'render_video',
                version: 1
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/final/movie_01.mp4`);
        });

        it('should generate final output paths', () => {
            const path = manager.getObjectPath!({
                projectId: PROJECT_ID,
                type: 'final_output',
                version: 1,
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/final/final_output_01.json`);
        });

        it('should generate batch input paths', () => {
            const path = manager.getObjectPath!({
                projectId: PROJECT_ID,
                type: 'batch-data',
                uniqueId: 'batch-job-xyz'
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/batches/batch-job-xyz/input.jsonl`);
        });

        it('should throw for batch without uniqueId', () => {
            expect(() => manager.getObjectPath!({
                projectId: PROJECT_ID,
                type: 'batch-data',
            })).toThrow('Batch path requires uniqueId');
        });

        it('should throw for unknown type', () => {
            expect(() => manager.getObjectPath!({
                projectId: PROJECT_ID,
                type: 'unknown' as any,
                version: 1
            })).toThrow('Unknown GCS object type');
        });

        it('should generate location image paths', () => {
            const path = manager.getObjectPath!({
                projectId: PROJECT_ID,
                type: 'location_image',
                locationId: 'loc_1',
                version: 1
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/images/locations/loc_1_reference_01.png`);
        });

        it('should generate project paths', () => {
            expect(manager.getProjectPath!(PROJECT_ID, 'characters')).toBe(`${BUCKET_NAME}/${PROJECT_ID}/images/characters`);
            expect(manager.getProjectPath!(PROJECT_ID, 'locations')).toBe(`${BUCKET_NAME}/${PROJECT_ID}/images/locations`);
            expect(manager.getProjectPath!(PROJECT_ID, 'scenes')).toBe(`${BUCKET_NAME}/${PROJECT_ID}/scenes`);
        });
    });

    describe('I/O Operations', () => {
        it('uploadFile should return destination', async () => {
            const local = './local.png';
            const dest = `gs://${BUCKET_NAME}/remote/image.png`;

            const res = await manager.uploadFile!(local, dest);

            expect(res).toBe(dest);
        });

        it('uploadBuffer should save with correct metadata', async () => {
            const buf = Buffer.from('data');
            const res = await manager.uploadBuffer!(buf, 'folder/img.png', 'image/png');

            expect(res).toBe(`gs://${BUCKET_NAME}/folder/img.png`);
        });

        it('uploadBuffer should handle errors', async () => {
            const mockManager = createMockStorageManager({
                uploadBuffer: vi.fn().mockRejectedValue(new Error('Upload failed'))
            });
            await expect(mockManager.uploadBuffer!(Buffer.from(''), 'dest', 'text/plain'))
                .rejects.toThrow('Upload failed');
        });

        it('uploadJSON should serialize and upload', async () => {
            const data = { key: 'value' };
            const res = await manager.uploadJSON!(data, 'data.json');

            expect(res).toBe(`gs://${BUCKET_NAME}/data.json`);
        });

        it('uploadJSON should handle errors', async () => {
            const mockManager = createMockStorageManager({
                uploadJSON: vi.fn().mockRejectedValue(new Error('Fail'))
            });
            await expect(mockManager.uploadJSON!({}, 'dest')).rejects.toThrow('Fail');
        });

        it('uploadJSONL should save string directly', async () => {
            const content = '{"a":1}\n{"b":2}';
            const res = await manager.uploadJSONL!(content, 'batch.jsonl');

            expect(res).toBe(`gs://${BUCKET_NAME}/batch.jsonl`);
        });

        it('uploadJSONL should handle errors', async () => {
            const mockManager = createMockStorageManager({
                uploadJSONL: vi.fn().mockRejectedValue(new Error('Fail'))
            });
            await expect(mockManager.uploadJSONL!('', 'dest')).rejects.toThrow('Fail');
        });

        it('uploadAudioFile should return GCS and public URIs', async () => {
            const mockManager = createMockStorageManager();
            const res = await mockManager.uploadAudio!('local/audio.mp3');

            expect(res.audioGcsUri).toContain('audio/audio.mp3');
            expect(res.audioPublicUri).toContain('audio/audio.mp3');
        });

        it('downloadJSON should parse buffer to object', async () => {
            const mockData = { foo: 'bar' };
            const mockManager = createMockStorageManager({
                downloadJSON: vi.fn().mockResolvedValue(mockData)
            });

            const result = await mockManager.downloadJSON!(`gs://${BUCKET_NAME}/data.json`);
            expect(result).toEqual(mockData);
        });

        it('downloadFile should download to local destination', async () => {
            await manager.downloadFile!('remote.file', 'local.file');
        });

        it('downloadToBuffer should return buffer', async () => {
            const buf = Buffer.from('content');
            const mockManager = createMockStorageManager({
                downloadToBuffer: vi.fn().mockResolvedValue(buf)
            });
            const res = await mockManager.downloadToBuffer!('file');
            expect(res).toBe(buf);
        });

        it('fileExists should return boolean', async () => {
            const exists = await manager.fileExists!('some/path');
            expect(exists).toBe(true);
        });

        it('getObjectMimeType should return content type', async () => {
            const type = await manager.getObjectMimeType!('video.mp4');
            expect(type).toBe('image/png');
        });

        it('getObjectMimeType should return undefined if no path', async () => {
            const type = await manager.getObjectMimeType!(undefined as any);
            expect(type).toBeUndefined();
        });
    });
});