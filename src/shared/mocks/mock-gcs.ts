import { vi, type Mock } from 'vitest';

/**
 * Mock GCS Storage API
 * 
 * This module provides mocks for the @google-cloud/storage library.
 * It reflects the real Storage API structure: Storage -> Bucket -> File
 */

export interface MockGcsStorage {
    bucket: Mock;
}

export interface MockGcsBucket {
    file: Mock;
    upload: Mock;
    getFiles: Mock;
    getFilesStream: Mock;
    getMetadata: Mock;
    exists: Mock;
    createBucket: Mock;
    iam: {
        testPermissions: Mock;
    };
}

export interface MockGcsFile {
    save: Mock;
    download: Mock;
    exists: Mock;
    getMetadata: Mock;
    delete: Mock;
    createReadStream: Mock;
    name: string;
}

export interface MockGcsStorageResult {
    storage: MockGcsStorage;
    bucket: MockGcsBucket;
    file: MockGcsFile;
}

/**
 * Creates a mock GCS Storage instance with bucket and file
 */
export const createMockStorage = (): MockGcsStorageResult => {
    const file = createMockGcsFile();
    
    const bucket: MockGcsBucket = {
        file: vi.fn(() => file),
        upload: vi.fn().mockResolvedValue([{ name: 'uploaded-file' }]),
        getFiles: vi.fn().mockResolvedValue([[]]),
        getFilesStream: vi.fn(() => {
            // Return an async iterator matching GCS getFilesStream
            return {
                [Symbol.asyncIterator]: () => ({
                    async next() {
                        return { done: true, value: undefined };
                    }
                })
            };
        }),
        getMetadata: vi.fn().mockResolvedValue([{ name: 'test-bucket' }]),
        exists: vi.fn().mockResolvedValue([true]),
        createBucket: vi.fn().mockResolvedValue([{}]),
        iam: {
            testPermissions: vi.fn().mockResolvedValue([{
                'storage.objects.get': true,
                'storage.objects.list': true,
                'storage.objects.create': true,
                'storage.objects.delete': true
            }]),
        },
    };

    const storage: MockGcsStorage = {
        bucket: vi.fn(() => bucket),
    };

    return { storage, bucket, file };
};

/**
 * Creates a mock GCS File object
 */
export const createMockGcsFile = (overrides?: Partial<MockGcsFile>): MockGcsFile => ({
    save: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue([Buffer.from('test')]),
    exists: vi.fn().mockResolvedValue([true]),
    getMetadata: vi.fn().mockResolvedValue([{ contentType: 'image/png', size: '1000' }]),
    delete: vi.fn().mockResolvedValue([{}]),
    createReadStream: vi.fn(() => {
        // Return a simple mock stream
        return {
            on: vi.fn(),
        };
    }),
    name: 'test-file',
    ...overrides,
});

/**
 * Legacy export - creates a simple object for backward compatibility
 */
export const createMockGcsStorage = (): { mockStorage: MockGcsStorage; mockBucket: MockGcsBucket; mockFile: MockGcsFile } => {
    const { storage, bucket, file } = createMockStorage();
    return {
        mockStorage: storage,
        mockBucket: bucket,
        mockFile: file,
    };
};

/**
 * Mock the @google-cloud/storage module
 * Use this in your test files to mock the storage library
 */
export const mockGcsStorageModule = () => {
    const { storage, bucket, file } = createMockStorage();
    
    return {
        Storage: class {
            constructor() {
                return storage;
            }
        },
    };
};

// Default mock for vi.mock()
export default mockGcsStorageModule;