import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInsertEntitiesTool, InsertEntitiesToolDeps } from '../insert-entities.tool.js';
import { mapDomainEntityToInsertEntity } from '#shared/utils/entity.utils.js';
import { InsertEntitiesInput } from '#shared/types/index.js';

// 1. Mock external utility functions
vi.mock('#shared/utils/entity.utils.js', () => ({
    mapDomainEntityToInsertEntity: vi.fn(),
}));

describe('InsertEntitiesTool', () => {
    let mockProjectRepository: any;
    let mockContext: InsertEntitiesToolDeps['context'];

    beforeEach(() => {
        vi.clearAllMocks();

        // 2. Setup mock repository and context state
        mockProjectRepository = {
            createEntities: vi.fn(),
        };

        mockContext = {
            projectId: 'test-project-123',
            traceId: 'trace-456',
            projectRepository: mockProjectRepository,
            // Add other TextModelController/ToolContext mocks here if necessary
        } as unknown as InsertEntitiesToolDeps['context'];
    });

    it('should successfully insert entities and serialise the summary', async () => {
        // Arrange
        const inputEntities = [
            { entityType: 'character', name: 'Alice' },
            { entityType: 'location', name: 'Wonderland' }
        ] as any; // Cast to bypass Zod schema typing in test setup

        // Mock the mapper to return transformed data
        vi.mocked(mapDomainEntityToInsertEntity).mockImplementation((projectId, entity) => ({
            mappedData: true,
            original: entity
        }));

        // Mock repository to return wrapped entities expected by serialiseResults
        mockProjectRepository.createEntities.mockResolvedValue([
            { entity: { id: '1', ...inputEntities[0] } },
            { entity: { id: '2', ...inputEntities[1] } }
        ]);

        const tool = createInsertEntitiesTool({ context: mockContext });

        // Act
        const resultJSON = await tool.invoke(inputEntities);
        const result = JSON.parse(resultJSON);

        // Assert
        expect(mapDomainEntityToInsertEntity).toHaveBeenCalledTimes(2);
        expect(mockProjectRepository.createEntities).toHaveBeenCalledWith(
            'test-project-123',
            expect.arrayContaining([
                expect.objectContaining({ data: { mappedData: true, original: inputEntities[0] } })
            ])
        );

        expect(result.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
        expect(result.results).toHaveLength(2);
        expect(result.results[0].success).toBe(true);
        expect(result.results[0].entity.id).toBe('1');
    });

    it('should handle repository exceptions and return failed serialisation', async () => {
        // Arrange
        const inputEntities = [{ entityType: 'scene', name: 'Opening' }] as any;
        const dbError = new Error('Database connection timeout');

        vi.mocked(mapDomainEntityToInsertEntity).mockReturnValue({} as any);
        mockProjectRepository.createEntities.mockRejectedValue(dbError);

        const tool = createInsertEntitiesTool({ context: mockContext });

        // Act
        const resultJSON = await tool.invoke(inputEntities);
        const result = JSON.parse(resultJSON);

        // Assert
        expect(result.summary).toEqual({ total: 1, succeeded: 0, failed: 1 });
        expect(result.results[0].success).toBe(false);
        expect(result.results[0].error).toBe('Database connection timeout');
    });

    it('should handle non-Error exceptions gracefully during failure', async () => {
        // Arrange
        const inputEntities = [{ entityType: 'scene', name: 'Opening' }] as any;

        // Simulating a thrown string or unknown object
        mockProjectRepository.createEntities.mockRejectedValue('String Error Without Message Property');

        const tool = createInsertEntitiesTool({ context: mockContext });

        // Act
        const resultJSON = await tool.invoke(inputEntities);
        const result = JSON.parse(resultJSON);

        // Assert
        expect(result.summary.failed).toBe(1);
        expect(result.results[0].success).toBe(false);
        expect(result.results[0].error).toBe('unknown'); // Tests the fallback logic
    });
});