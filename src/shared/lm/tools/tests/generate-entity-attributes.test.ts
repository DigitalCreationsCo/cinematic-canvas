import '#shared/mocks/mock-config.js';

vi.mock('#shared/lm/tools/tools.utils.js', () => ({
    filterDefined: vi.fn((obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))),
}));

vi.mock('#shared/utils/utils.js', () => ({
    getModelCompatibleSchema: vi.fn((schema) => schema),
}));

import { createMockTextModel } from '#shared/mocks/mock-model.js';
import { createMockToolContext } from '#shared/mocks/mock-tools.js';

import { describe, it, expect, vi, beforeEach, afterEach, Mocked } from 'vitest';
import { z } from 'zod';
import type { ToolContext } from '#shared/lm/tools/tools.utils.js';
import type { TextModelController } from '#shared/lm/text-model-controller.js';
import { generateEntityAttributes } from '#shared/lm/tools/generate-entity-attributes.js';

describe('generateEntityAttributes - Output Order Preservation', () => {
    let mockProvider: Mocked<TextModelController>;
    let mockContext: ToolContext<TextModelController>;

    const testSchema = z.object({
        id: z.string(),
        name: z.string(),
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mockProvider = createMockTextModel();
        mockContext = createMockToolContext({
            provider: mockProvider,
        })
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
            } as any);

            const results = await generateEntityAttributes(
                {
                    schema: testSchema,
                    entities: inputEntities.map((e) => ({
                        data: { id: e.id, name: e.name },
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