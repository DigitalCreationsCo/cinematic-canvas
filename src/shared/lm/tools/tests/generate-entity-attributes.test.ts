import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

vi.mock('#shared/lm/tools/tools.utils.js', () => ({
    filterDefined: vi.fn((obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))),
}));

vi.mock('#shared/config.js', () => ({
    getExecutionMode: vi.fn(() => 'SEQUENTIAL'),
}));

vi.mock('#shared/utils/utils.js', () => ({
    getModelCompatibleSchema: vi.fn((schema) => schema),
}));

const { getExecutionMode } = await import('#shared/config.js');
const { generateEntityAttributes } = await import('../generate-entity-attributes.js');
import type { ToolContext } from '../tools.utils.js';
import type { TextModelController } from '../../text-model-controller.js';

describe('generateEntityAttributes - Output Order Preservation', () => {
    let mockProvider: any;
    let mockContext: ToolContext<TextModelController>;

    const testSchema = z.object({
        id: z.string(),
        name: z.string(),
    });

    beforeEach(() => {
        vi.clearAllMocks();

        mockProvider = {
            generateContent: vi.fn(),
            generateBatchContent: vi.fn(),
            textModel: 'gemini-2.5-pro',
        };

        mockContext = {
            projectId: 'test-project',
            traceId: 'test-trace',
            provider: mockProvider,
            options: {},
            storageManager: {
                getObjectPath: vi.fn(),
                uploadBuffer: vi.fn(),
            },
        } as unknown as ToolContext<TextModelController>;
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('SEQUENTIAL mode - order preservation', () => {
        it('should return results in same order as input in SEQUENTIAL mode', async () => {
            const inputEntities = [
                { id: 'entity-1', name: 'Alice' },
                { id: 'entity-2', name: 'Bob' },
                { id: 'entity-3', name: 'Charlie' },
            ];

            mockProvider.generateContent.mockResolvedValue({
                text: '{ "id": "test", "name": "test" }',
            });

            const results = await generateEntityAttributes(
                {
                    schema: testSchema,
                    entities: inputEntities.map((e) => ({
                        attributes: { id: e.id, name: e.name },
                        entityType: 'character' as const,
                    })),
                    entityDescription: 'character',
                },
                mockContext
            );

            expect(results).toHaveLength(3);
            expect(results[0].id).toBe('entity-1');
            expect(results[1].id).toBe('entity-2');
            expect(results[2].id).toBe('entity-3');
        });
    });
});