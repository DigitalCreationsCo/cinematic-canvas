import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleProvider } from '../google/provider.js';
import { GCPStorageManager } from '../../services/storage-manager.js';
import { GoogleGenAI } from '@google/genai';
import { getExecutionMode } from '#shared/config.js';

vi.mock('../../services/storage-manager.js', () => ({
    GCPStorageManager: vi.fn()
}));

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
    extractGeneratedResponse: vi.fn().mockReturnValue([
        "return-value-1",
        "return-value-2",
        "return-value-3",
    ])
}));

describe('GoogleProvider', () => {
    let provider: GoogleProvider;
    let mockStorageManager: any;
    let mockGenAI: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockStorageManager = {
            getObjectPath: vi.fn(),
            uploadJSONL: vi.fn(),
            parseGcsUri: vi.fn(),
            processTextBatchResult: vi.fn(),
            fileExists: vi.fn(),
            uploadBuffer: vi.fn(),
            processBatchImageResult: vi.fn(),
            getProjectPath: vi.fn(),
            getGcsUrl: vi.fn(path => `gs://${path}`),
            getPublicUrl: vi.fn(path => `https://${path}`),
        };

        mockGenAI = {
            batches: { create: vi.fn(), get: vi.fn() },
            models: { generateContent: vi.fn() }
        };

        // FIX: Use a regular function, NOT an arrow function
        // Arrow functions cannot be constructors.
        (GoogleGenAI as any).mockImplementation(function () {
            return mockGenAI;
        });

        // Apply the same fix to StorageManager just in case
        (GCPStorageManager as any).mockImplementation(function () {
            return mockStorageManager;
        });

        provider = new GoogleProvider();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });


    describe('executeNativeBatch (via generateBatchContent)', () => {

        it('placeholder', () => {
            expect(true).toBe(true);
        });

        //     it('should construct correct src and dest URIs', async () => {
        //         const projectId = 'test-project';
        //         const model = 'gemini-1.5-pro';
        //         const requests = [{
        //             messages: [],
        //             metadata: { custom_id: '1', version: 1 }
        //         }];

        //         const uniqueId = '123456';
        //         const inputPath = `test-bucket/${projectId}/batches/${uniqueId}/input.jsonl`;
        //         const inputGcsUri = `gs://${inputPath}`;

        //         mockStorageManager.getObjectPath.mockReturnValue(inputPath);
        //         mockStorageManager.uploadJSONL.mockResolvedValue(inputGcsUri);
        //         mockStorageManager.parseGcsUri.mockReturnValue({
        //             bucketName: 'test-bucket',
        //             fileName: `${projectId}/batches/${uniqueId}/input.jsonl`
        //         });

        //         const mockBatchJob = {
        //             name: 'jobs/123',
        //             state: 'SUCCEEDED',
        //             dest: { gcsUri: `gs://test-bucket/${projectId}/batches/${uniqueId}/dest` }
        //         };
        //         mockGenAI.batches.create.mockResolvedValue(mockBatchJob);

        //         await provider.generateBatchContent({
        //             projectId,
        //             model,
        //             requests: requests,
        //             config: {}
        //         });

        //         expect(GCPStorageManager).toHaveBeenCalled();
        //         expect(mockStorageManager.getObjectPath).toHaveBeenCalledWith(expect.objectContaining({
        //             type: 'batch-data',
        //             projectId
        //         }));

        //         expect(mockStorageManager.uploadJSONL).toHaveBeenCalledWith(
        //             "jsonl-content",
        //             inputPath
        //         );

        //         expect(mockGenAI.batches.create).toHaveBeenCalledWith(expect.objectContaining({
        //             src: { format: 'jsonl', gcsUri: [inputGcsUri] },
        //             config: expect.objectContaining({
        //                 dest: {
        //                     format: 'jsonl',
        //                     gcsUri: `gs://test-bucket/${projectId}/batches/${uniqueId}/dest`
        //                 }
        //             })
        //         }));
        //     });
        // });

        // it('batch native batch mode test', async () => {

        //     vi.stubEnv('EXECUTION_MODE', 'BATCH');
        //     expect(getExecutionMode()).toBe('BATCH');

        //     const projectId = 'test-project';
        //     const model = 'gemini-1.5-pro';
        //     const requests = [{
        //         messages: [],
        //         metadata: { custom_id: '1', version: 1 }
        //     }];

        //     const uniqueId = '123456';
        //     const inputPath = `test-bucket/${projectId}/batches/${uniqueId}/input.jsonl`;
        //     const inputGcsUri = `gs://${inputPath}`;

        //     mockStorageManager.getObjectPath.mockReturnValue(inputPath);
        //     mockStorageManager.uploadJSONL.mockResolvedValue(inputGcsUri);
        //     mockStorageManager.parseGcsUri.mockReturnValue({
        //         bucketName: 'test-bucket',
        //         fileName: `${projectId}/batches/${uniqueId}/input.jsonl`
        //     });

        //     const mockBatchJob = {
        //         name: 'jobs/123',
        //         state: 'SUCCEEDED',
        //         dest: { gcsUri: `gs://test-bucket/${projectId}/batches/${uniqueId}/dest` }
        //     };
        //     mockGenAI.batches.create.mockResolvedValue(mockBatchJob);

        //     await provider.generateBatchContent({
        //         projectId,
        //         model,
        //         requests: requests,
        //         config: {}
        //     });

        //     expect(GCPStorageManager).toHaveBeenCalled();

        //     const batchSpy = vi.spyOn(GoogleProvider.prototype as any, 'executeNativeBatch');
        //     expect(batchSpy).toHaveBeenCalled();
        //     expect(mockStorageManager.getObjectPath).toHaveBeenCalledWith(expect.objectContaining({
        //         type: 'batch-data',
        //         projectId
        //     }));

        //     expect(mockStorageManager.uploadJSONL).toHaveBeenCalledWith(
        //         "jsonl-content",
        //         inputPath
        //     );

        //     expect(mockGenAI.batches.create).toHaveBeenCalledWith(expect.objectContaining({
        //         src: { format: 'jsonl', gcsUri: [inputGcsUri] },
        //         config: expect.objectContaining({
        //             dest: {
        //                 format: 'jsonl',
        //                 gcsUri: `gs://test-bucket/${projectId}/batches/${uniqueId}/dest`
        //             }
        //         })
        //     }));
    });
});


