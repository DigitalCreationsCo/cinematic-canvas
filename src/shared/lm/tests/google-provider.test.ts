import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { GoogleProvider } from '../google/provider.js';
import { GCPStorageManager } from '../../services/storage-manager.js';
import { GoogleGenAI } from '@google/genai';

// Mock dependencies
vi.mock('../../services/storage/storage-manager.js');
vi.mock('@google/genai', () => ({
    GoogleGenAI: vi.fn(),
    Modality: { IMAGE: 'IMAGE' }
}));
vi.mock('../google/utils.js', () => ({
    pollForBatchJob: vi.fn().mockImplementation((lm, job) => Promise.resolve(job)),
    toContentsGoogleFromReferenceImages: vi.fn(),
    toReferenceImagesFromContentsFileData: vi.fn(),
    buildAPIReferenceImagesFromParams: vi.fn()
}));
vi.mock('../google/params.js', () => ({
    buildBatchParams: vi.fn().mockImplementation(params => ({ ...params, requests: "jsonl-content" })),
    buildGenerateContentParams: vi.fn(),
    buildGenerateImagesParams: vi.fn(),
    buildGenerateVideosParams: vi.fn()
}));
vi.mock('../parts-extractor.js', () => ({
    extractGeneratedResponse: vi.fn()
}));

describe('GoogleProvider', () => {
    let provider: GoogleProvider;
    let mockStorageManager: any;
    let mockGenAI: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup GCPStorageManager mock
        mockStorageManager = {
            getObjectPath: vi.fn(),
            uploadJSONL: vi.fn(),
            parseGcsUri: vi.fn(),
            processTextBatchResults: vi.fn()
        };
        // When GCPStorageManager is instantiated, return our mock object
        (GCPStorageManager as any).mockImplementation(function () { return mockStorageManager; });

        // Setup GoogleGenAI mock
        mockGenAI = {
            batches: {
                create: vi.fn(),
                get: vi.fn()
            },
            models: {
                generateContent: vi.fn()
            }
        };
        (GoogleGenAI as any).mockImplementation(function () { return mockGenAI; });

        provider = new GoogleProvider();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('executeNativeBatch (via generateBatchContent)', () => {
        it('should construct correct src and dest URIs', async () => {
            const projectId = 'test-project';
            const model = 'gemini-1.5-pro';
            const requests = [{ metadata: { custom_id: '1', version: 1 } }];

            // Mock getObjectPath to return a path consistent with the new schema
            const uniqueId = '123456';
            const inputPath = `test-bucket/${projectId}/batches/${uniqueId}/input.jsonl`;
            const inputGcsUri = `gs://${inputPath}`;

            mockStorageManager.getObjectPath.mockReturnValue(inputPath);
            mockStorageManager.uploadJSONL.mockResolvedValue(inputGcsUri);
            mockStorageManager.parseGcsUri.mockReturnValue({
                bucketName: 'test-bucket',
                fileName: `${projectId}/batches/${uniqueId}/input.jsonl`
            });

            const mockBatchJob = {
                name: 'jobs/123',
                state: 'SUCCEEDED',
                dest: { gcsUri: `gs://test-bucket/${projectId}/batches/${uniqueId}/dest` }
            };
            mockGenAI.batches.create.mockResolvedValue(mockBatchJob);

            await provider.generateBatchContent({
                projectId,
                model,
                requests: requests as any,
                config: {}
            });

            // Verify getObjectPath called with batch type
            expect(mockStorageManager.getObjectPath).toHaveBeenCalledWith(expect.objectContaining({
                type: 'batch-data',
                projectId
            }));

            // Verify uploadJSONL called with correct input path
            expect(mockStorageManager.uploadJSONL).toHaveBeenCalledWith(
                "jsonl-content",
                inputPath
            );

            // Verify batches.create called with correct src and dest
            expect(mockGenAI.batches.create).toHaveBeenCalledWith(expect.objectContaining({
                src: {
                    format: 'jsonl',
                    gcsUri: [inputGcsUri]
                },
                config: expect.objectContaining({
                    dest: {
                        format: 'jsonl',
                        // Verify the dest URI matches the requirement: .../batches/[uniqueId]/dest
                        gcsUri: `gs://test-bucket/${projectId}/batches/${uniqueId}/dest`
                    }
                })
            }));
        });
    });
});
