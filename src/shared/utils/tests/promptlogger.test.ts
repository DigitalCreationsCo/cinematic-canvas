import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fsPromises } from 'fs';
import { PromptLogger } from '../prompt-logger.js';
import { logContextStore } from '../../logger/index.js';
import * as promptlayer from "promptlayer";
const { PromptLayer } = promptlayer.default || promptlayer;

// Mock External Dependencies
vi.mock('fs', () => ({
    promises: {
        mkdir: vi.fn(),
        writeFile: vi.fn()
    }
}));

vi.mock('promptlayer', () => {
    const mockLogRequest = vi.fn();
    return {
        PromptLayer: vi.fn(() => ({
            logRequest: mockLogRequest
        }))
    };
});

vi.mock('../logger/index.js', () => ({
    logContextStore: {
        getStore: vi.fn()
    }
}));

describe('SuitePromptLogger', () => {
    const mockStoreGet = vi.mocked(logContextStore.getStore);
    const mockFsMkdir = vi.mocked(fsPromises.mkdir);
    const mockFsWriteFile = vi.mocked(fsPromises.writeFile);
    const spyConsoleError = vi.spyOn(console, 'error').mockImplementation(() => { });
    const spyConsoleTrace = vi.spyOn(console, 'trace').mockImplementation(() => { });

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.LOG_PROMPTS = 'true';
        process.env.PROMPTLAYER_API_KEY = 'test-key';

        mockStoreGet.mockReturnValue({
            projectId: 'proj-123',
            jobId: 'job-456',
            jobType: 'generation',
            attempt: 1,
            w_id: 'w-123',
            correlationId: 'corr-123',
            shouldPublish: false
        });
    });

    afterEach(() => {
        delete process.env.LOG_PROMPTS;
        delete process.env.PROMPTLAYER_API_KEY;
    });

    // Helper to flush the microtask queue since log() uses Promise.resolve().then()
    const flushPromisesQueue = async () => new Promise(process.nextTick);

    it('should bypass logging completely if all targets are disabled', async () => {
        process.env.LOG_PROMPTS = 'false';
        delete process.env.PROMPTLAYER_API_KEY;

        PromptLogger.log({ model: 'test-model', type: 'text', input: 'test' });
        await flushPromisesQueue();

        expect(mockFsWriteFile).not.toHaveBeenCalled();
    });

    it('should successfully write local log files with correct path and payload', async () => {
        const payloadLogRequest = {
            model: 'gpt-4o',
            type: 'text' as const,
            input: 'Hello'
        };

        PromptLogger.log(payloadLogRequest);
        await flushPromisesQueue();

        expect(mockFsMkdir).toHaveBeenCalledWith(
            expect.stringContaining('proj-123/generation/job-456'.replace(/\//g, require('path').sep)),
            { recursive: true }
        );
        expect(mockFsWriteFile).toHaveBeenCalledWith(
            expect.stringContaining('1-text.json'),
            expect.stringContaining('"input": "Hello"')
        );
    });

    it('should safely catch and isolate local file system errors', async () => {
        const errorWriteFailure = new Error('Disk full');
        mockFsWriteFile.mockRejectedValueOnce(errorWriteFailure);

        PromptLogger.log({ model: 'gpt-4o', type: 'text', input: 'Hello' });
        await flushPromisesQueue();

        expect(spyConsoleError).toHaveBeenCalledWith(
            '[PromptLogger] Uncaught error during local file logging:',
            errorWriteFailure
        );
        // Ensure remote logging wasn't blocked by the local failure
        expect(spyConsoleTrace).toHaveBeenCalledWith(expect.stringContaining('Successfully transmitted log to PromptLayer'));
    });

    it('should correctly format payload and transmit to PromptLayer', async () => {
        const payloadLogRequestOpenAi = {
            provider: 'openai',
            model: 'gpt-4o',
            type: 'chat' as const,
            input: { messages: [] },
            output: { usage: { prompt_tokens: 10, completion_tokens: 20 } },
            tags: [ 'feature-x' ]
        };

        PromptLogger.log(payloadLogRequestOpenAi);
        await flushPromisesQueue();

        // Retrieve the mock instance of PromptLayer created by vi.mock
        const instanceMockPromptLayer = vi.mocked(PromptLayer).mock.results[ 0 ].value;

        expect(instanceMockPromptLayer.logRequest).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'openai',
            model: 'gpt-4o',
            input_tokens: 10,
            output_tokens: 20,
            tags: [ 'feature-x', 'project:proj-123', 'job:job-456', 'stage:generation' ]
        }));
    });

    it('should aggressively sanitize large base64 strings and binary buffers', async () => {
        const stringOversizedBase64 = 'a'.repeat(6000);
        const stringOversizedImage = 'b'.repeat(1500);

        const payloadDirtyInput = {
            model: 'gpt-4o',
            type: 'image' as const,
            input: {
                inlineData: { data: stringOversizedBase64, mimeType: 'image/png' },
                image: stringOversizedImage,
                video: stringOversizedImage,
                imageBytes: new Uint8Array([ 1, 2, 3 ]),
                metadata: [ stringOversizedBase64 ]
            }
        };

        PromptLogger.log(payloadDirtyInput);
        await flushPromisesQueue();

        const stringOutputWrittenFile = mockFsWriteFile.mock.calls[ 0 ][ 1 ] as string;
        const objectParsedOutput = JSON.parse(stringOutputWrittenFile);

        expect(objectParsedOutput.input.inlineData.data).toContain('<base64_data_truncated_len_6000>');
        expect(objectParsedOutput.input.image).toContain('<binary_data_truncated_len_1500>');
        expect(objectParsedOutput.input.video).toContain('<binary_data_truncated_len_1500>');
        expect(objectParsedOutput.input.imageBytes).toBe('<image_bytes_truncated>');
        expect(objectParsedOutput.input.metadata[ 0 ]).toContain('<truncated_string_len_6000>');
    });

    it('should fallback to default context values if logContextStore is empty', async () => {
        mockStoreGet.mockReturnValue(undefined);

        PromptLogger.log({ model: 'gpt-4o', type: 'text', input: 'Hello' });
        await flushPromisesQueue();

        expect(mockFsMkdir).toHaveBeenCalledWith(
            expect.stringContaining('unknown-project/unknown-stage/unknown-job'.replace(/\//g, require('path').sep)),
            { recursive: true }
        );
    });
});