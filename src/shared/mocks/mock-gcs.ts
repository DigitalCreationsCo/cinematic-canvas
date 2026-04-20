import { vi, type Mock } from 'vitest';

export const createMockGcsStorage = () => {
    const mockFile = {
        save: vi.fn().mockResolvedValue(undefined),
        download: vi.fn(),
        exists: vi.fn(),
        getMetadata: vi.fn(),
        delete: vi.fn().mockResolvedValue(true),
        name: 'test-file',
        createReadStream: vi.fn(),
    };

    const mockBucket = {
        file: vi.fn(() => mockFile),
        upload: vi.fn().mockResolvedValue([{}]),
        getMetadata: vi.fn().mockResolvedValue([{}]),
        getFiles: vi.fn(),
        iam: {
            testPermissions: vi.fn().mockResolvedValue([
                { 'storage.objects.get': true },
                { 'storage.objects.list': true },
                { 'storage.objects.create': true },
                { 'storage.objects.delete': true }
            ]),
        },
    };

    return {
        Storage: class {
            constructor() {
                return {
                    bucket: vi.fn(() => mockBucket)
                };
            }
        },
        mockFile,
        mockBucket,
    };
};

/**
 * Creates a mock bucket for GCS storage testing
 */
export const createMockBucket = () => {
    const mockFile = {
        save: vi.fn().mockResolvedValue(undefined),
        download: vi.fn().mockResolvedValue([Buffer.from('test')]),
        exists: vi.fn().mockResolvedValue([true]),
        getMetadata: vi.fn().mockResolvedValue([{ contentType: 'image/png', size: '1000' }]),
        delete: vi.fn().mockResolvedValue(true),
        name: 'test-file',
    };

    const mockBucket = {
        file: vi.fn(() => mockFile),
        upload: vi.fn().mockResolvedValue([{ name: 'uploaded-file' }]),
        getMetadata: vi.fn().mockResolvedValue([{ name: 'test-bucket' }]),
        exists: vi.fn().mockResolvedValue([true]),
        iam: {
            testPermissions: vi.fn().mockResolvedValue([
                { 'storage.objects.get': true },
                { 'storage.objects.list': true },
                { 'storage.objects.create': true },
                { 'storage.objects.delete': true }
            ]),
        },
    };

    return { mockBucket, mockFile };
};

/**
 * Creates a mock file object for GCS
 */
export const createMockGcsFile = (overrides?: Partial<{
    save: Mock;
    download: Mock;
    exists: Mock;
    getMetadata: Mock;
    delete: Mock;
}>) => ({
    save: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue([Buffer.from('test')]),
    exists: vi.fn().mockResolvedValue([true]),
    getMetadata: vi.fn().mockResolvedValue([{ contentType: 'image/png', size: '1000' }]),
    delete: vi.fn().mockResolvedValue(true),
    name: 'test-file',
    ...overrides,
});

/**
 * Utility to setup vi.mock for @google-cloud/storage
 * Call this in your test file before importing the module under test
 */
export const mockGcpStorageModule = () => {
    const { mockFile, mockBucket } = createMockGcsStorage();
    
    vi.mock('@google-cloud/storage', () => ({
        Storage: class {
            constructor() {
                return {
                    bucket: vi.fn(() => mockBucket)
                };
            }
        }
    }));
    
    return { mockFile, mockBucket };
};