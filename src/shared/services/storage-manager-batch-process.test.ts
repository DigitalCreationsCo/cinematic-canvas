import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GCPStorageManager } from './storage-manager.js';
import { Storage } from '@google-cloud/storage';
import { Readable } from 'stream';

// Mock the Storage module
vi.mock('@google-cloud/storage', () => {
    return {
        Storage: vi.fn().mockImplementation(() => ({
            bucket: vi.fn(),
        })),
    };
});

describe('StorageManager Batch Processing (Vitest)', () => {
    let manager: GCPStorageManager;
    let mockFile: any;
    let mockBucket: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockFile = {
            exists: vi.fn().mockResolvedValue([ true ]),
            createReadStream: vi.fn(),
            save: vi.fn().mockResolvedValue(true),
        };

        mockBucket = {
            file: vi.fn().mockReturnValue(mockFile),
        };

        manager = new GCPStorageManager('gcp-project-id', 'test-project-id', 'test-bucket');
        (manager as any).storage = new Storage();
        vi.spyOn(manager as any, 'storage').mockReturnValue({ bucket: () => mockBucket });
        (manager as any).storage.bucket = vi.fn().mockReturnValue(mockBucket);

        manager.getObjectPath = vi.fn(({ type }) => `path/to/${type}`);
        (manager as any).videoId = 'test-vid';
    });

    it('should process image batch and save as PNG', async () => {
        const mockJsonl = JSON.stringify({
            custom_id: 'img_1',
            metadata: { version: '1.0' },
            response: { candidates: [ { content: { parts: [ { inlineData: { data: 'YmFzZTY0' } } ] } } ] }
        });

        mockFile.createReadStream.mockReturnValue(Readable.from([ mockJsonl ]));

        const results = await manager.processBatchStorageResponse('gs://b/out.jsonl');

        expect(results[ 0 ].status).toBe('SUCCESS');
        expect(mockFile.save).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ contentType: 'image/png' }));
    });

    it('should process text batch and save as JSON', async () => {
        const mockJsonl = JSON.stringify({
            custom_id: 'txt_1',
            metadata: { version: '1.0' },
            response: { candidates: [ { content: { parts: [ { text: 'Hello' } ] } } ] }
        });

        mockFile.createReadStream.mockReturnValue(Readable.from([ mockJsonl ]));

        const results = await manager.processTextBatchResults('gs://b/out.jsonl');

        expect(results[ 0 ].status).toBe('SUCCESS');
        expect(mockFile.save).toHaveBeenCalledWith(expect.stringContaining('Hello'), expect.objectContaining({ contentType: 'application/json' }));
    });

    it('should handle failed status in JSONL', async () => {
        const mockJsonl = JSON.stringify({
            custom_id: 'fail_1',
            metadata: { version: '1.0' },
            status: { message: 'Quota exceeded' }
        });

        mockFile.createReadStream.mockReturnValue(Readable.from([ mockJsonl ]));

        const results = await manager.processVideoBatchResults('gs://b/out.jsonl');

        expect(results[ 0 ].status).toBe('FAILED');
        expect(results[ 0 ].error).toBe('Quota exceeded');
    });

    it('should throw on invalid GCS URI format', async () => {
        await expect(manager.processBatchStorageResponse('invalid-uri')).rejects.toThrow('Invalid GCS URI');
    });

    it('should throw if the batch output file does not exist', async () => {
        mockFile.exists.mockResolvedValue([ false ]);
        await expect(manager.processBatchStorageResponse('gs://b/none.jsonl')).rejects.toThrow('Batch file not found');
    });
});