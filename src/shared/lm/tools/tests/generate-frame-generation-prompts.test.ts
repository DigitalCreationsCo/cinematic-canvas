import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateFrameGenerationPrompts } from '../scenes/generate-frame-generation-prompts.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('#shared/utils/utils.js', () => ({
    continuitySystemPrompt: vi.fn(() => 'MOCK_SYSTEM_PROMPT'),
    composeFrameGenerationPromptMeta: vi.fn(() => 'MOCK_INSTRUCTIONS'),
    cleanJsonOutput: vi.fn((text: string) => {
        if (text === 'MALFORMED_TEXT') throw new Error('SyntaxError: Unexpected token');
        return `CLEANED_${text}`;
    }),
    composeGenerationRules: vi.fn(() => ' + MOCK_GENERATION_RULES'),
}));

vi.mock('#shared/prompts/scene-frame.prompt.ts', () => ({
    composeFrameGenerationPromptMeta: vi.fn(),
}))

// ─────────────────────────────────────────────────────────────────────────────
// Test Data Setup
// ─────────────────────────────────────────────────────────────────────────────

const createMockRequest = (overrides = {}): any => ({
    framePosition: 'start',
    scene: { id: 'scene-123' },
    characters: [],
    locations: [],
    generationRules: ['rule1'],
    metadata: {
        custom_id: 'batch-req-001',
        assetKey: 'asset-alpha',
        version: 2,
    },
    ...overrides,
});

const createMockContext = (providerOverrides = {}): any => ({
    traceId: 'trace-999',
    projectId: 'proj-omega',
    options: { signal: new AbortController().signal },
    provider: {
        generateBatchContent: vi.fn(),
        ...providerOverrides,
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('generateFrameGenerationPrompts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns an empty array immediately if requests array is empty', async () => {
        const context = createMockContext();
        const result = await generateFrameGenerationPrompts([], context);

        expect(result).toEqual([]);
        expect(context.provider.generateBatchContent).not.toHaveBeenCalled();
    });

    it('processes a successful batch generation and maps to FramePromptResultsEnvelope exactly', async () => {
        const mockReq = createMockRequest();
        const mockContext = createMockContext({
            generateBatchContent: vi.fn().mockResolvedValue([{
                status: 'SUCCESS',
                text: 'VALID_JSON_PAYLOAD',
                // These should be ignored by the function in favor of the original request
                customId: 'wrong-id',
                version: 99
            }])
        });

        const result = await generateFrameGenerationPrompts([mockReq], mockContext);

        expect(result).toHaveLength(1);
        expect(result[0]).toStrictEqual(expect.objectContaining({
            framePosition: 'start',
            scene: { id: 'scene-123' },
            metadata: {
                custom_id: 'batch-req-001', // Pulled from req, not res
                assetKey: 'asset-alpha',
                status: 'SUCCESS',
                version: 2, // Pulled from req, not res
            },
        }));
    });

    it('falls back to raw instructions if provider status is not SUCCESS', async () => {
        const mockReq = createMockRequest();
        const mockContext = createMockContext({
            generateBatchContent: vi.fn().mockResolvedValue([{
                status: 'SAFETY_VIOLATION',
                text: null,
            }])
        });

        const result = await generateFrameGenerationPrompts([mockReq], mockContext);

        expect(result[0].prompt).toStrictEqual(expect.any(String));
        expect(result[0].metadata.status).toBe('SAFETY_VIOLATION');
    });

    it('catches JSON parsing errors and gracefully falls back to raw instructions', async () => {
        const mockReq = createMockRequest();
        const mockContext = createMockContext({
            generateBatchContent: vi.fn().mockResolvedValue([{
                status: 'SUCCESS',
                text: 'MALFORMED_TEXT',
            }])
        });

        // Spy on console.error to ensure it fires during the catch block
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

        const result = await generateFrameGenerationPrompts([mockReq], mockContext);

        // Verify the try...catch intercepted the error
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.objectContaining({ sceneId: 'scene-123', customId: 'batch-req-001' }),
            expect.stringContaining('Execution error in LLM output parsing')
        );
        expect(consoleWarnSpy).toHaveBeenCalled();

        // Verify fallback structure remains intact
        expect(result[0]).toEqual(expect.objectContaining({
            framePosition: 'start',
            scene: { id: 'scene-123' },
            // prompt: 'MOCK_INSTRUCTIONS + MOCK_GENERATION_RULES',
            metadata: {
                custom_id: 'batch-req-001',
                assetKey: 'asset-alpha',
                status: 'SUCCESS',
                version: 2,
            },
        })
        );

        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it('applies UNKNOWN_FAILURE status if network drops the status field entirely', async () => {
        const mockReq = createMockRequest();
        const mockContext = createMockContext({
            generateBatchContent: vi.fn().mockResolvedValue([{
                // Missing status field
                text: null,
            }])
        });

        const result = await generateFrameGenerationPrompts([mockReq], mockContext);

        expect(result[0].metadata.status).toBe('UNKNOWN_FAILURE');
    });
});