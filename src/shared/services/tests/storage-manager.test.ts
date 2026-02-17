import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GCPStorageManager } from '../storage-manager.js';
import { Storage } from '@google-cloud/storage';
import { Readable } from 'stream';

const mocks = vi.hoisted(() => {
  const mFile = {
    name: 'mock-file.jsonl',
    createReadStream: vi.fn(),
    save: vi.fn(),
    download: vi.fn(),
    exists: vi.fn(),
    getMetadata: vi.fn(),
  };
  const mBucket = {
    file: vi.fn(() => mFile),
    getFiles: vi.fn(),
    getFilesStream: vi.fn(),
    upload: vi.fn(),
    iam: {
      testPermissions: vi.fn().mockResolvedValue([{ 'storage.objects.create': true }]),
    }
  };
  const mStorage = {
    bucket: vi.fn(() => mBucket),
  };
  return { mFile, mBucket, mStorage };
});

vi.mock('@google-cloud/storage', () => {
  return {
    Storage: class {
      constructor() {
        return mocks.mStorage;
      }
    }
  };
});

describe('GCPStorageManager - processBatchInternal', () => {
  let storageManager: GCPStorageManager;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLOUD_BUCKET = 'test-bucket';
    storageManager = new GCPStorageManager('test-project');
    
    // Reset default mock implementations if needed
    mocks.mBucket.iam.testPermissions.mockResolvedValue([{ 'storage.objects.create': true }]);
  });

  const createMockStream = (data: string[]) => {
    const stream = new Readable();
    data.forEach(line => stream.push(line + '\n'));
    stream.push(null);
    return stream;
  };

  it('should process batch results correctly with valid input', async () => {
    const gcsUri = 'gs://test-bucket/batch-output/';
    const mockFile = {
      name: 'batch-output/predictions.jsonl',
      createReadStream: vi.fn().mockReturnValue(createMockStream([
        JSON.stringify({
          metadata: { custom_id: '123', version: 1, assetKey: 'test' },
          response: { candidates: [{ content: { parts: [{ text: 'response text' }] } }] } 
        })
      ]))
    };

    // Prepare for new implementation using getFilesStream
    const mockStream = Readable.from([mockFile]);
    mocks.mBucket.getFilesStream.mockReturnValue(mockStream);
    
    // Existing implementation uses getFiles
    mocks.mBucket.getFiles.mockResolvedValue([[mockFile]]);

    const results = await storageManager.processTextBatchResults('test-project', gcsUri);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
        customId: '123',
        version: 1,
        assetKey: 'test',
        text: 'response text',
        status: 'SUCCESS',
        error: undefined
    });
  });

  it('should handle gcsUri with and without trailing slash', async () => {
     const gcsUri = 'gs://test-bucket/batch-output'; // No trailing slash
     const mockFile = {
      name: 'batch-output/predictions.jsonl',
      createReadStream: vi.fn().mockReturnValue(createMockStream([
        JSON.stringify({
          metadata: { custom_id: '123', version: 1, assetKey: 'test' },
          response: { candidates: [{ content: { parts: [{ text: 'response text' }] } }] } 
        })
      ]))
    };

    mocks.mBucket.getFilesStream.mockReturnValue(Readable.from([mockFile]));
    mocks.mBucket.getFiles.mockResolvedValue([[mockFile]]);

    const results = await storageManager.processTextBatchResults('test-project', gcsUri);
    expect(results).toHaveLength(1);
  });
  
  it('should filter out input.jsonl, errors, and metadata files', async () => {
    const gcsUri = 'gs://test-bucket/batch-output/';
    const validFile = {
        name: 'batch-output/valid.jsonl',
        createReadStream: vi.fn().mockReturnValue(createMockStream([
            JSON.stringify({
                metadata: { custom_id: '123', version: 1, assetKey: 'test' },
                response: { candidates: [{ content: { parts: [{ text: 'response' }] } }] }
            })
        ]))
    };
    const inputFile = { name: 'batch-output/input.jsonl', createReadStream: vi.fn() };
    const errorFile = { name: 'batch-output/errors.jsonl', createReadStream: vi.fn() };
    const metadataFile = { name: 'batch-output/metadata.jsonl', createReadStream: vi.fn() };
    const otherFile = { name: 'batch-output/other.txt', createReadStream: vi.fn() };

    const allFiles = [validFile, inputFile, errorFile, metadataFile, otherFile];
    mocks.mBucket.getFilesStream.mockReturnValue(Readable.from(allFiles));
    mocks.mBucket.getFiles.mockResolvedValue([allFiles]);

    const results = await storageManager.processTextBatchResults('test-project', gcsUri);

    expect(results).toHaveLength(1);
    expect(validFile.createReadStream).toHaveBeenCalled();
    expect(inputFile.createReadStream).not.toHaveBeenCalled();
    expect(errorFile.createReadStream).not.toHaveBeenCalled();
  });

  it('should handle missing metadata gracefully', async () => {
      const gcsUri = 'gs://test-bucket/batch-output/';
      const mockFile = {
        name: 'batch-output/predictions.jsonl',
        createReadStream: vi.fn().mockReturnValue(createMockStream([
          JSON.stringify({
            // Missing metadata
            response: { candidates: [{ content: { parts: [{ text: 'response text' }] } }] } 
          }),
          JSON.stringify({
             metadata: { custom_id: '124', version: 1, assetKey: 'test2' },
             response: { candidates: [{ content: { parts: [{ text: 'response 2' }] } }] } 
          })
        ]))
      };
  
      mocks.mBucket.getFilesStream.mockReturnValue(Readable.from([mockFile]));
      mocks.mBucket.getFiles.mockResolvedValue([[mockFile]]);
  
      const results = await storageManager.processTextBatchResults('test-project', gcsUri);
  
      expect(results).toHaveLength(1);
      expect(results[0].customId).toBe('124');
  });

  it('should handle malformed JSON gracefully', async () => {
    const gcsUri = 'gs://test-bucket/batch-output/';
    const mockFile = {
      name: 'batch-output/predictions.jsonl',
      createReadStream: vi.fn().mockReturnValue(createMockStream([
        'INVALID JSON',
        JSON.stringify({
           metadata: { custom_id: '125', version: 1, assetKey: 'test3' },
           response: { candidates: [{ content: { parts: [{ text: 'response 3' }] } }] } 
        })
      ]))
    };

    mocks.mBucket.getFilesStream.mockReturnValue(Readable.from([mockFile]));
    mocks.mBucket.getFiles.mockResolvedValue([[mockFile]]);

    const results = await storageManager.processTextBatchResults('test-project', gcsUri);

    expect(results).toHaveLength(1);
    expect(results[0].customId).toBe('125');
  });

   it('should throw error if no files found', async () => {
    const gcsUri = 'gs://test-bucket/batch-output/';
    mocks.mBucket.getFilesStream.mockReturnValue(Readable.from([]));
    mocks.mBucket.getFiles.mockResolvedValue([[]]);

    await expect(storageManager.processTextBatchResults('test-project', gcsUri))
        .rejects.toThrow('No batch result files (.jsonl) found');
  });
});
