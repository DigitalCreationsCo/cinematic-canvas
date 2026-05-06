import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockStorageManager } from '../../mocks/mock-storage-manager.js';

describe('GCPStorageManager Batch Processing', () => {
    let manager: ReturnType<typeof createMockStorageManager>;
    const PROJECT_ID = 'test-proj';
    const BUCKET = 'test-bucket';

    beforeEach(() => {
        vi.clearAllMocks();
        manager = createMockStorageManager({ bucketName: BUCKET });
    });

    describe('Utility & Orchestration', () => {
        it('should accurately parse GCS URIs', () => {
            const { bucketName, fileName } = manager.parseGcsUri!('gs://my-bucket/folder/file.jsonl');
            expect(bucketName).toBe('my-bucket');
            expect(fileName).toBe('folder/file.jsonl');
        });
        
        it('should throw invalid URI', () => {
            expect(() => manager.parseGcsUri!('')).toThrow();
        });
    });
});