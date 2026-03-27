import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GCPStorageManager } from '../storage-manager.js';
import path from 'path';

// 1. Hoist the mock objects so they exist before vi.mock() runs
const mocks = vi.hoisted(() => {
    const mockFile = {
        save: vi.fn().mockResolvedValue(undefined),
        download: vi.fn(),
        exists: vi.fn(),
        getMetadata: vi.fn(),
        name: 'test-file',
    };

    const mockBucket = {
        file: vi.fn(() => mockFile),
        upload: vi.fn().mockResolvedValue([{}]),
        iam: {
            testPermissions: vi.fn().mockResolvedValue([
                {
                    'storage.objects.get': true,
                    'storage.objects.list': true,
                    'storage.objects.create': true,
                    'storage.objects.delete': true
                }
            ]),
        },
    };

    return { mockFile, mockBucket };
});

// 2. Mock the module using a proper class structure
vi.mock('@google-cloud/storage', () => {
    return {
        Storage: class {
            constructor() {
                return {
                    bucket: vi.fn(() => mocks.mockBucket)
                };
            }
        }
    };
});

describe('GCPStorageManager Core', () => {
    let manager: GCPStorageManager;
    const PROJECT_ID = 'test-project-123';
    const BUCKET_NAME = 'canvas-prod-bucket';

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new GCPStorageManager('gcp-admin-project', BUCKET_NAME);
    });

    describe('Constructor & Permissions', () => {
        it('should initialize and check permissions', () => {
            // verified by the constructor call in beforeEach
            expect(mocks.mockBucket.iam.testPermissions).toHaveBeenCalledWith([
                'storage.objects.get',
                'storage.objects.list',
                'storage.objects.create',
                'storage.objects.delete'
            ]);
        });

        it('should throw if bucket name is missing', () => {
            expect(() => new GCPStorageManager('p', '')).toThrow('Bucket name is required');
        });
    });

    describe('Path Normalization & URLs', () => {
        it('should generate a valid public HTTPS URL', () => {
            const res = manager.getPublicUrl(`${BUCKET_NAME}/assets/image.png`);
            expect(res).toBe(`https://storage.googleapis.com/${BUCKET_NAME}/assets/image.png`);
        });

        it('should handle partial paths in getPublicUrl', () => {
            const res = manager.getPublicUrl('assets/image.png');
            expect(res).toBe(`https://storage.googleapis.com/${BUCKET_NAME}/assets/image.png`);
        });

        it('should generate a valid gs:// URI', () => {
            const res = manager.getGcsUrl(`${BUCKET_NAME}/data/file.json`);
            expect(res).toBe(`gs://${BUCKET_NAME}/data/file.json`);
        });

        it('should parse GCS URIs correctly', () => {
            const { bucketName, fileName } = manager.parseGcsUri(`gs://${BUCKET_NAME}/folder/item.txt`);
            expect(bucketName).toBe(BUCKET_NAME);
            expect(fileName).toBe('folder/item.txt');
        });

        it('should throw error when parsing invalid GCS URI', () => {
            // It throws if the string is empty or just "gs://"
            expect(() => manager.parseGcsUri('')).toThrow();
        });
    });

    describe('Object Path Generation', () => {
        it('should generate thumbnail paths', () => {
            const path = manager.getObjectPath({
                projectId: PROJECT_ID,
                type: 'thumbnail',
                version: 1,
                uniqueId: 'abc'
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/images/thumbnails/${PROJECT_ID}_01_abc.png`);
        });

        it('should generate character reference paths', () => {
            const path = manager.getObjectPath({
                projectId: PROJECT_ID,
                type: 'character_image',
                characterId: 'char_hero',
                version: 5
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/images/characters/char_hero_reference_05.png`);
        });

        it('should generate scene start frame paths', () => {
            const path = manager.getObjectPath({
                projectId: PROJECT_ID,
                type: 'scene_start_frame',
                sceneId: '10',
                version: 2
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/images/frames/scene_010_frame_start_02.png`);
        });

        it('should generate scene end frame paths', () => {
            const path = manager.getObjectPath({
                projectId: PROJECT_ID,
                type: 'scene_end_frame',
                sceneId: '10',
                version: 2
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/images/frames/scene_010_frame_end_02.png`);
        });

        it('should generate scene video paths', () => {
            const path = manager.getObjectPath({
                projectId: PROJECT_ID,
                type: 'scene_video',
                sceneId: '10',
                version: 2
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/scenes/scene_010_02.mp4`);
        });

        it('should generate render video paths', () => {
            const path = manager.getObjectPath({
                projectId: PROJECT_ID,
                type: 'render_video',
                version: 1
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/final/movie_01.mp4`);
        });

        it('should generate final output paths', () => {
            const path = manager.getObjectPath({
                projectId: PROJECT_ID,
                type: 'final_output',
                version: 1,
            } as any);
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/final/final_output_01.json`);
        });

        it('should generate batch input paths', () => {
            const path = manager.getObjectPath({
                projectId: PROJECT_ID,
                type: 'batch',
                uniqueId: 'batch-job-xyz'
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/batches/batch-job-xyz/input.jsonl`);
        });

        it('should throw for batch without uniqueId', () => {
            expect(() => manager.getObjectPath({
                projectId: PROJECT_ID,
                type: 'batch',
            } as any)).toThrow('Batch path requires uniqueId');
        });

        it('should throw for unknown type', () => {
            expect(() => manager.getObjectPath({
                projectId: PROJECT_ID,
                type: 'unknown' as any,
                version: 1
            })).toThrow('Unknown GCS object type');
        });

        it('should generate location image paths', () => {
            const path = manager.getObjectPath({
                projectId: PROJECT_ID,
                type: 'location_image',
                locationId: 'loc_1',
                version: 1
            });
            expect(path).toBe(`${BUCKET_NAME}/${PROJECT_ID}/images/locations/loc_1_reference_01.png`);
        });

        it('should generate project paths', () => {
            expect(manager.getProjectPath(PROJECT_ID, 'characters')).toBe(`${BUCKET_NAME}/${PROJECT_ID}/images/characters`);
            expect(manager.getProjectPath(PROJECT_ID, 'locations')).toBe(`${BUCKET_NAME}/${PROJECT_ID}/images/locations`);
            expect(manager.getProjectPath(PROJECT_ID, 'scenes')).toBe(`${BUCKET_NAME}/${PROJECT_ID}/scenes`);
        });
    });

    describe('I/O Operations', () => {
        it('uploadFile should normalize path and strip bucket for GCS SDK', async () => {
            const local = './local.png';
            const dest = `gs://${BUCKET_NAME}/remote/image.png`;

            const res = await manager.uploadFile(local, dest);

            expect(mocks.mockBucket.upload).toHaveBeenCalledWith(local, expect.objectContaining({
                destination: 'remote/image.png',
                metadata: { cacheControl: 'public, max-age=31536000' }
            }));
            expect(res).toBe(dest);
        });

        it('uploadBuffer should save with correct metadata', async () => {
            const buf = Buffer.from('data');
            await manager.uploadBuffer(buf, 'folder/img.png', 'image/png');

            expect(mocks.mockBucket.file).toHaveBeenCalledWith('folder/img.png');
            expect(mocks.mockFile.save).toHaveBeenCalledWith(buf, expect.objectContaining({
                contentType: 'image/png',
                metadata: { cacheControl: 'public, max-age=31536000' }
            }));
        });

        it('uploadBuffer should handle errors', async () => {
            mocks.mockFile.save.mockRejectedValueOnce(new Error('Upload failed'));
            await expect(manager.uploadBuffer(Buffer.from(''), 'dest', 'text/plain'))
                .rejects.toThrow('Upload failed');
        });

        it('uploadJSON should serialize and upload', async () => {
            const data = { key: 'value' };
            await manager.uploadJSON(data, 'data.json');

            expect(mocks.mockBucket.file).toHaveBeenCalledWith('data.json');
            expect(mocks.mockFile.save).toHaveBeenCalledWith(
                expect.any(Buffer),
                expect.objectContaining({ contentType: 'application/json' })
            );
        });

        it('uploadJSON should handle errors', async () => {
            mocks.mockFile.save.mockRejectedValueOnce(new Error('Fail'));
            await expect(manager.uploadJSON({}, 'dest')).rejects.toThrow('Fail');
        });

        it('uploadJSONL should save string directly', async () => {
            const content = '{"a":1}\n{"b":2}';
            await manager.uploadJSONL(content, 'batch.jsonl');

            expect(mocks.mockBucket.file).toHaveBeenCalledWith('batch.jsonl');
            expect(mocks.mockFile.save).toHaveBeenCalledWith(content, expect.objectContaining({
                contentType: 'application/jsonl',
                resumable: false,
                validation: 'md5'
            }));
        });

        it('uploadJSONL should handle errors', async () => {
            mocks.mockFile.save.mockRejectedValueOnce(new Error('Fail'));
            await expect(manager.uploadJSONL('', 'dest')).rejects.toThrow('Fail');
        });

        it('uploadAudioFile should skip if exists', async () => {
            mocks.mockFile.exists.mockResolvedValueOnce([true]);
            const res = await manager.uploadAudio('local/audio.mp3');

            expect(mocks.mockFile.exists).toHaveBeenCalled();
            expect(mocks.mockBucket.upload).not.toHaveBeenCalled();
            expect(res).toContain('audio/audio.mp3');
        });

        it('uploadAudioFile should upload if not exists', async () => {
            mocks.mockFile.exists.mockResolvedValueOnce([false]);
            const res = await manager.uploadAudio('local/audio.mp3');

            expect(mocks.mockBucket.upload).toHaveBeenCalledWith(
                'local/audio.mp3',
                expect.objectContaining({ destination: 'audio/audio.mp3' })
            );
        });

        it('downloadJSON should parse buffer to object', async () => {
            const mockData = { foo: 'bar' };
            mocks.mockFile.download.mockResolvedValue([Buffer.from(JSON.stringify(mockData))]);

            const result = await manager.downloadJSON(`gs://${BUCKET_NAME}/data.json`);
            expect(result).toEqual(mockData);
        });

        it('downloadFile should download to local destination', async () => {
            await manager.downloadFile('remote.file', 'local.file');
            expect(mocks.mockFile.download).toHaveBeenCalledWith({ destination: 'local.file' });
        });

        it('downloadToBuffer should return buffer', async () => {
            const buf = Buffer.from('content');
            mocks.mockFile.download.mockResolvedValue([buf]);
            const res = await manager.downloadToBuffer('file');
            expect(res).toBe(buf);
        });

        it('fileExists should return boolean', async () => {
            mocks.mockFile.exists.mockResolvedValue([true]);
            const exists = await manager.fileExists('some/path');
            expect(exists).toBe(true);
        });

        it('getObjectMimeType should return content type', async () => {
            mocks.mockFile.getMetadata.mockResolvedValue([{ contentType: 'video/mp4' }]);
            const type = await manager.getObjectMimeType('video.mp4');
            expect(type).toBe('video/mp4');
        });

        it('getObjectMimeType should return undefined if no path', async () => {
            const type = await manager.getObjectMimeType(undefined);
            expect(type).toBeUndefined();
        });
    });
});
