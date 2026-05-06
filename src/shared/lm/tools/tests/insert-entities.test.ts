import "#shared/mocks/mock-googlegenai.js";
import { createMockProjectRepository } from "#shared/mocks/mock-project-repository.js";
import { createMockToolContext } from "#shared/mocks/mock-tools.js";
import { createMockCharacter } from "#shared/mocks/mock-character.js";
import { createMockLocation } from "#shared/mocks/mock-location.js";
import { createMockScene } from "#shared/mocks/mock-scene.js";

import { describe, it, expect, vi, beforeEach, Mocked } from "vitest";
import { createInsertEntitiesTool, InsertEntitiesToolDeps } from "#shared/lm/tools/insert-entities.tool.js";
import { InsertEntitiesInput } from "#shared/types/editable.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

vi.mock("#shared/utils/entity.utils.js", () => ({
  hydrateEntity: vi.fn(),
  mapDomainEntityToInsertEntity: vi.fn((projectId: string, entity: any) => ({
    mappedData: true,
    original: entity,
  })),
}));

import { mapDomainEntityToInsertEntity as mockMapDomainEntity } from "#shared/utils/entity.utils.js";

describe("InsertEntitiesTool", () => {
  let mockProjectRepository: Mocked<ProjectRepository>;
  let mockContext: InsertEntitiesToolDeps["context"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectRepository = createMockProjectRepository();
    mockContext = createMockToolContext({ projectRepository: mockProjectRepository });
  });

  it("should successfully insert entities and serialise the summary", async () => {
    const character = createMockCharacter({ assets: { description: "description from character assets" } });
    const location = createMockLocation({ assets: { description: "location description" } });
    const inputEntities: InsertEntitiesInput = [
      { entityType: "character" as const, data: character, images: [] },
      { entityType: "location" as const, data: location, images: [] },
    ];

    mockProjectRepository.createEntities.mockResolvedValue([
      { entityId: "1", entityType: "character", entity: { id: "1", name: "Alice" } } as any,
      { entityId: "2", entityType: "location", entity: { id: "2", name: "Wonderland" } } as any,
    ]);
    const tool = createInsertEntitiesTool({ context: mockContext });

    const resultJSON = await tool.invoke(inputEntities);
    const result = JSON.parse(resultJSON);

    expect(mockMapDomainEntity).toHaveBeenCalledTimes(2);
    expect(result.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
    expect(result.results).toHaveLength(2);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].entity.id).toBe("1");
  });

  it("should handle repository exceptions and return failed serialisation", async () => {
    const scene = createMockScene({ name: "Opening", assets: { description: "description" } });
    const inputEntities: InsertEntitiesInput = [{ entityType: "scene" as const, data: scene, images: [] }];

    mockProjectRepository.createEntities.mockRejectedValue(new Error("Database connection timeout"));
    const tool = createInsertEntitiesTool({ context: mockContext });

    const resultJSON = await tool.invoke(inputEntities);
    const result = JSON.parse(resultJSON);

    expect(result.summary).toEqual({ total: 1, succeeded: 0, failed: 1 });
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toBe("Database connection timeout");
  });

  it("should handle non-Error exceptions gracefully during failure", async () => {
    const character = createMockCharacter({ assets: { description: "description" } });
    const inputEntities: InsertEntitiesInput = [{ entityType: "character" as const, data: character, images: [] }];

    mockProjectRepository.createEntities.mockRejectedValue("String Error Without Message Property");
    const tool = createInsertEntitiesTool({ context: mockContext });

    const resultJSON = await tool.invoke(inputEntities);
    const result = JSON.parse(resultJSON);

    expect(result.summary.failed).toBe(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toBe("unknown");
  });
});
