import { vi, type Mock } from 'vitest';
import type { GCPStorageManager } from '../services/storage-manager.js';

export interface MockStorageManager extends Partial<GCPStorageManager> {
    fileExists: Mock;
    uploadBuffer: Mock;
    uploadFile: Mock;
    downloadFile: Mock;
    downloadJSON: Mock;
    downloadToBuffer: Mock;
    deleteObject: Mock;
    getObjectMimeType: Mock;
    uploadJSON: Mock;
    uploadJSONL: Mock;
    uploadAudio: Mock;
    bucketName: string;
}

export const createMockStorageManager = (overrides?: Partial<MockStorageManager>): MockStorageManager => ({
    fileExists: vi.fn().mockResolvedValue(true),
    uploadBuffer: vi.fn().mockResolvedValue('gs://bucket/uploaded-file.png'),
    uploadFile: vi.fn().mockResolvedValue('gs://bucket/uploaded-file.png'),
    downloadFile: vi.fn().mockResolvedValue(undefined),
    downloadJSON: vi.fn().mockResolvedValue({}),
    downloadToBuffer: vi.fn().mockResolvedValue(Buffer.from('test')),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    getObjectMimeType: vi.fn().mockResolvedValue('image/png'),
    uploadJSON: vi.fn().mockResolvedValue('gs://bucket/data.json'),
    uploadJSONL: vi.fn().mockResolvedValue('gs://bucket/data.jsonl'),
    uploadAudio: vi.fn().mockResolvedValue('gs://bucket/audio.mp3'),
    bucketName: 'test-bucket',
    ...overrides,
});