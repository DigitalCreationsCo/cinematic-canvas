import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GCPStorageManager } from '../storage-manager.js';
import { Readable } from 'stream';
import { extractGeneratedResponse } from '../../lm/parts-extractor.js';

// 1. Hoist Mocks for GCS Client
const mocks = vi.hoisted(() => {
    const mockFile = {
        name: 'batch-output.jsonl',
        save: vi.fn().mockResolvedValue(true),
        createReadStream: vi.fn(),
    };

    const mockBucket = {
        file: vi.fn(() => mockFile),
        getFiles: vi.fn(),
        iam: { testPermissions: vi.fn().mockResolvedValue([ {} ]) }
    };

    return { mockFile, mockBucket };
});

// 2. Mock Module
vi.mock('@google-cloud/storage', () => ({
    Storage: class {
        constructor() {
            return {
                bucket: vi.fn(() => mocks.mockBucket)
            };
        }
    }
}));

// Mock parts-extractor to simplify response handling
vi.mock('../../lm/parts-extractor.js', () => ({
    extractGeneratedResponse: vi.fn(),
    TypeToResponseType: {}
}));

describe('GCPStorageManager Batch Processing', () => {
    let manager: GCPStorageManager;
    const PROJECT_ID = 'test-proj';
    const BUCKET = 'test-bucket';

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new GCPStorageManager(PROJECT_ID, BUCKET);
    });

    describe('Batch Logic Execution (Real processBatchInternal)', () => {
        
        it('should throw if no batch result files found', async () => {
            mocks.mockBucket.getFiles.mockResolvedValue([ [] ]); // Empty files list
            
            await expect(manager.processTextBatchResults(PROJECT_ID, `gs://${BUCKET}/empty/`))
                .rejects.toThrow('No batch result files (.jsonl) found');
        });

        it('should process text batch results correctly', async () => {
            // Setup files
            const jsonLine = JSON.stringify({
                metadata: { custom_id: 'scene_1', version: 1, assetKey: 'k1' },
                response: { some: 'response' }
            });
            
            const mockStream = Readable.from([ jsonLine ]);
            const fileObj = {
                name: 'output-1.jsonl',
                createReadStream: vi.fn().mockReturnValue(mockStream)
            };
            
            mocks.mockBucket.getFiles.mockResolvedValue([ [ fileObj ] ]);
            
            // Mock extractor
            vi.mocked(extractGeneratedResponse).mockReturnValue(['Generated Text']);

            const results = await manager.processTextBatchResults(PROJECT_ID, `gs://${BUCKET}/out/`);

            expect(mocks.mockBucket.getFiles).toHaveBeenCalledWith(expect.objectContaining({
                prefix: 'out/'
            }));
            expect(results).toHaveLength(1);
            expect(results[0]).toEqual({
                customId: 'scene_1',
                version: 1,
                assetKey: 'k1',
                text: 'Generated Text',
                status: 'SUCCESS',
                error: undefined
            });
        });

        it('should process image batch results and upload images', async () => {
            const jsonLine = JSON.stringify({
                metadata: { custom_id: 'char_1', version: 1, assetKey: 'k2' },
                response: { some: 'img_response' }
            });
            
            const mockStream = Readable.from([ jsonLine ]);
            const fileObj = {
                name: 'img-output.jsonl',
                createReadStream: vi.fn().mockReturnValue(mockStream)
            };
            
            mocks.mockBucket.getFiles.mockResolvedValue([ [ fileObj ] ]);
            
            // Mock extractor returning base64
            vi.mocked(extractGeneratedResponse).mockReturnValue(['base64data']);
            
            // Mock uploadBuffer (which is called internally)
            const uploadSpy = vi.spyOn(manager, 'uploadBuffer').mockResolvedValue('gs://uploaded/img.png');

            const results = await manager.processBatchImageResult(PROJECT_ID, `gs://${BUCKET}/img-out/`);

            expect(uploadSpy).toHaveBeenCalledWith(
                Buffer.from('base64data', 'base64'),
                expect.stringContaining('char_1_reference_01.png'),
                'image/png'
            );
            
            // Accessing 'text' property because implementation sets it, even if type definition says imageBytes
            expect(results[0].status).toBe('SUCCESS');
            // The implementation ignores the uploadBuffer return value and reconstructs the path
            const expectedPath = `${BUCKET}/${PROJECT_ID}/images/characters/char_1_reference_01.png`;
            expect((results[0] as any).text).toBe(`gs://${expectedPath}`);
        });
        
        it('should process video batch results and upload video', async () => {
            const jsonLine = JSON.stringify({
                metadata: { custom_id: 'scene_v', version: 2 },
                response: { some: 'vid_response' }
            });
            
            const mockStream = Readable.from([ jsonLine ]);
            const fileObj = {
                name: 'vid-output.jsonl',
                createReadStream: vi.fn().mockReturnValue(mockStream)
            };
            
            mocks.mockBucket.getFiles.mockResolvedValue([ [ fileObj ] ]);
            
            // Mock extractor
            vi.mocked(extractGeneratedResponse).mockReturnValue(['base64video']);
            const uploadSpy = vi.spyOn(manager, 'uploadBuffer').mockResolvedValue('gs://uploaded/vid.mp4');

            const results = await manager.processVideoBatchResults(PROJECT_ID, `gs://${BUCKET}/vid-out/`);
            
            expect(uploadSpy).toHaveBeenCalledWith(
                Buffer.from('base64video', 'base64'),
                expect.stringContaining('scene_scene_v_02.mp4'), // scene_video path schema
                'video/mp4'
            );
            expect(results[0].status).toBe('SUCCESS');
        });

        it('should handle malformed lines or errors gracefully', async () => {
             // 1. Invalid JSON
             // 2. Valid JSON but missing metadata
             const lines = [
                 'invalid-json',
                 JSON.stringify({ no_metadata: true }), 
             ];
             
             const mockStream = Readable.from(lines.join('\n'));
              const fileObj = {
                name: 'bad.jsonl',
                createReadStream: vi.fn().mockReturnValue(mockStream)
            };
            
            mocks.mockBucket.getFiles.mockResolvedValue([ [ fileObj ] ]);
            
            // Should not throw, but return empty or partial results
            const results = await manager.processTextBatchResults(PROJECT_ID, `gs://${BUCKET}/bad/`);
            expect(results).toHaveLength(0);
        });
        
        it('should handle extraction returning empty/null (failed generation)', async () => {
             const jsonLine = JSON.stringify({
                metadata: { custom_id: 'fail_1', version: 1 },
                response: {}
            });
            
            const mockStream = Readable.from([ jsonLine ]);
            const fileObj = {
                name: 'fail.jsonl',
                createReadStream: vi.fn().mockReturnValue(mockStream)
            };
             mocks.mockBucket.getFiles.mockResolvedValue([ [ fileObj ] ]);
             
             // Extractor returns empty or nulls
             vi.mocked(extractGeneratedResponse).mockReturnValue([]);
             
             const results = await manager.processTextBatchResults(PROJECT_ID, 'gs://b/f');
             expect(results).toHaveLength(0);
        });
    });

    describe('Utility & Orchestration', () => {
        it('should accurately parse GCS URIs', () => {
            const { bucketName, fileName } = manager.parseGcsUri('gs://my-bucket/folder/file.jsonl');
            expect(bucketName).toBe('my-bucket');
            expect(fileName).toBe('folder/file.jsonl');
        });
        
        it('should throw invalid URI', () => {
            // It only throws if the bucket name is empty (e.g. empty string or gs://)
            expect(() => manager.parseGcsUri('')).toThrow();
        });
    });
});
