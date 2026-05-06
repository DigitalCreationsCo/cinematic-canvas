import { createBuilder, createMockDb } from "#shared/mocks/mock-db.js";
import { createMockScene } from "#shared/mocks/mock-scene.js";
import { createMockLocation } from "#shared/mocks/mock-location.js";
import { createMockProp } from "#shared/mocks/mock-prop.js";
import { createMockCharacter } from "#shared/mocks/mock-character.js";

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { AssetVersionManager } from "#shared/services/asset-version-manager.js";
import { generateId } from "#shared/utils/id.js";
import { db } from "#shared/db/index.js";

describe("ProjectRepository Asset Persistence", () => {
  let repo: ProjectRepository;
  let assetManager: AssetVersionManager;
  let projectId: string;

  beforeEach(async () => {
    repo = new ProjectRepository();
    assetManager = new AssetVersionManager(repo);
    projectId = generateId();
  });

  describe("mixed-type input", () => {
    it("returns all entity types in a single flat array", async () => {
      const mockCharacter = createMockCharacter({ name: "Test Char" });
      const mockLocation = createMockLocation({ name: "Test Location" });
      const mockProp = createMockProp({ name: "Test Prop" });

      repo.getEntities = vi.fn().mockResolvedValue([
        { entityType: "character", entity: mockCharacter },
        { entityType: "location", entity: mockLocation },
        { entityType: "prop", entity: mockProp },
      ]);

      const result = await repo.getEntities([
        { entityId: "char-1", entityType: "character" },
        { entityId: "loc-1", entityType: "location" },
        { entityId: "prop-1", entityType: "prop" },
      ]);

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.entityType)).toEqual(expect.arrayContaining(["character", "location", "prop"]));
    });

    it("preserves entity data integrity across types", async () => {
      const mockCharacter = createMockCharacter({ name: "Test Char" });
      const mockScene = createMockScene({ name: "Test Scene", characterIds: [mockCharacter.id] });

      repo.getEntities = vi.fn().mockResolvedValue([
        { entityType: "character", entity: mockCharacter },
        { entityType: "scene", entity: mockScene },
      ]);

      const result = await repo.getEntities([
        { entityId: "char-1", entityType: "character" },
        { entityId: "scene-1", entityType: "scene" },
      ]);

      const charResult = result.find((r) => r.entityType === "character");
      const sceneResult = result.find((r) => r.entityType === "scene");

      expect(charResult?.entity).toEqual(mockCharacter);
      expect(sceneResult?.entity).toEqual(mockScene);
    });

    // it('output preserves entity order', async () => {

    //   const mockCharacter = createMockCharacter({ name: 'Test Char' });
    //   const mockScene1 = createMockScene({ name: "Test Scene", characterIds: [mockCharacter.id] });
    //   const mockScene2 = createMockScene({ name: "Test Scene 2", characterIds: [mockCharacter.id] });
    //   const mockScene3 = createMockScene({ name: "Test Scene 3", characterIds: [mockCharacter.id] });

    //   repo.getCharactersByIds = vi.fn().mockResolvedValue([mockCharacter]);
    //   repo.getScenesByIds = vi.fn().mockResolvedValue([mockScene1, mockScene2, mockScene3]);

    //     const results = await repo.getEntities([
    //       { entityId: 'char-1',  entityType: 'character' },
    //       { entityId: 'scene-2', entityType: 'scene'     },
    //       { entityId: 'scene-3', entityType: 'scene'     },
    //       { entityId: 'scene-1', entityType: 'scene'     },
    //     ]);

    //     expect(results[0].entity.name).toEqual('Test Char');
    //     expect(results[1].entity.name).toEqual('Test Scene 2');
    //     expect(results[2].entity.name).toEqual('Test Scene 3');
    //     expect(results[3].entity.name).toEqual('Test Scene');
    //   });
  });

  // -------------------------------------------------------------------------

  describe("error handling", () => {
    it("rejects if any underlying helper throws", async () => {
      const selectBuilder = createBuilder();
      selectBuilder.where = vi.fn().mockRejectedValue("DB timeout");
      db.select = vi.fn(() => selectBuilder);

      await expect(
        repo.getEntities([
          { entityId: "char-1", entityType: "character" },
          { entityId: "loc-1", entityType: "location" },
        ]),
      ).rejects.toThrow("DB timeout");
    });
  });
});
