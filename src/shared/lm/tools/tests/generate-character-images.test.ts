import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateCharacterImages } from '../characters/generate-character-images.js';
import { ToolContext } from '../tools.utils.js';
import { TextModelController } from '../../text-model-controller.js';

type GenerateCharacterImagesResult = 
    | { success: true; id: string; output: string; metadata: { model: string; prompt: string } }
    | { success: false; id: string; error: Error };

vi.mock('#shared/config.js', () => ({
    getExecutionMode: vi.fn(),
    imageMimeType: 'image/png',
    aspectRatios: {
        widescreen: { aspectRatio: '16:9' },
        vertical: { aspectRatio: '9:16' },
    },
}));

const { getExecutionMode, imageMimeType } = await import('#shared/config.js');

describe('generateCharacterImages - Output Order Preservation', () => {
    let mockProvider: any;
    let mockContext: ToolContext<TextModelController>;

    beforeEach(() => {
        vi.clearAllMocks();

        mockProvider = {
            generateImages: vi.fn(),
            generateBatchImages: vi.fn(),
            imageModel: 'gemini-2.5-flash-image',
        };

        mockContext = {
            projectId: 'test-project',
            traceId: 'test-trace',
            provider: mockProvider,
            options: { signal: undefined },
            storageManager: {
                getObjectPath: vi.fn((params: any) => `gs://bucket/${params.type}/${params.characterId}/v${params.version}`),
                uploadBuffer: vi.fn((buffer, path) => Promise.resolve(path)),
                getPublicUrl: vi.fn((uri) => uri),
            },
            safetyRetries: 3,
        } as unknown as ToolContext<TextModelController>;
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('BATCH mode - order preservation', () => {
        it('should return results in same order as input in BATCH mode', async () => {
            vi.mocked(getExecutionMode).mockReturnValue('BATCH');

            const inputCharacters = [
                { id: 'char-1', name: 'Alice', version: 1 },
                { id: 'char-2', name: 'Bob', version: 2 },
                { id: 'char-3', name: 'Charlie', version: 3 },
            ];

            mockProvider.generateBatchImages.mockResolvedValue([
                { customId: 'char-3', status: 'SUCCESS', imageBytes: 'abc123' },
                { customId: 'char-1', status: 'SUCCESS', imageBytes: 'def456' },
                { customId: 'char-2', status: 'SUCCESS', imageBytes: 'ghi789' },
            ]);

            const results = await generateCharacterImages(
                {
                    characters: inputCharacters as any,
                    generationRules: [],
                    attempt: 1,
                    incrementAttempt: vi.fn(),
                },
                mockContext
            );

            expect(results).toHaveLength(3);
            expect(results[0].id).toBe('char-1');
            expect(results[1].id).toBe('char-2');
            expect(results[2].id).toBe('char-3');
        });

        it('should preserve order when batch has failures', async () => {
            vi.mocked(getExecutionMode).mockReturnValue('BATCH');

            const inputCharacters = [
                { id: 'char-1', name: 'Alice', version: 1 },
                { id: 'char-2', name: 'Bob', version: 2 },
                { id: 'char-3', name: 'Charlie', version: 3 },
            ];

            mockProvider.generateBatchImages.mockResolvedValue([
                { customId: 'char-2', status: 'SUCCESS', imageBytes: 'abc123' },
                { customId: 'char-3', status: 'FAILED', error: new Error('Generation failed') },
                { customId: 'char-1', status: 'SUCCESS', imageBytes: 'def456' },
            ]);

            const results = await generateCharacterImages(
                {
                    characters: inputCharacters as any,
                    generationRules: [],
                    attempt: 1,
                    incrementAttempt: vi.fn(),
                },
                mockContext
            );

            expect(results).toHaveLength(3);
            expect(results[0].id).toBe('char-1');
            expect(results[1].id).toBe('char-2');
            expect(results[2].id).toBe('char-3');
        });
    });

    describe('PARALLEL mode - order preservation', () => {
        it('should return results in same order as input in PARALLEL mode', async () => {
            vi.mocked(getExecutionMode).mockReturnValue('PARALLEL');

            const inputCharacters = [
                { id: 'char-1', name: 'Alice', version: 1 },
                { id: 'char-2', name: 'Bob', version: 2 },
                { id: 'char-3', name: 'Charlie', version: 3 },
            ];

            mockProvider.generateImages.mockImplementation(() => 
                Promise.resolve({ generatedImages: [{ image: { imageBytes: 'test' } }] })
            );

            const results = await generateCharacterImages(
                {
                    characters: inputCharacters as any,
                    generationRules: [],
                    attempt: 1,
                    incrementAttempt: vi.fn(),
                },
                mockContext
            );

            expect(results).toHaveLength(3);
            expect(results[0].id).toBe('char-1');
            expect(results[1].id).toBe('char-2');
            expect(results[2].id).toBe('char-3');
        });
    });

    describe('SEQUENTIAL mode - order preservation', () => {
        it('should return results in same order as input in SEQUENTIAL mode', async () => {
            vi.mocked(getExecutionMode).mockReturnValue('SEQUENTIAL');

            const inputCharacters = [
                { id: 'char-1', name: 'Alice', version: 1 },
                { id: 'char-2', name: 'Bob', version: 2 },
                { id: 'char-3', name: 'Charlie', version: 3 },
            ];

            mockProvider.generateImages.mockImplementation(() => 
                Promise.resolve({ generatedImages: [{ image: { imageBytes: 'test' } }] })
            );

            const results = await generateCharacterImages(
                {
                    characters: inputCharacters as any,
                    generationRules: [],
                    attempt: 1,
                    incrementAttempt: vi.fn(),
                },
                mockContext
            );

            expect(results).toHaveLength(3);
            expect(results[0].id).toBe('char-1');
            expect(results[1].id).toBe('char-2');
            expect(results[2].id).toBe('char-3');
        });
    });
});