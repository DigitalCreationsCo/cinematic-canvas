import { createBuilder } from "#shared/mocks/mock-db.js";
import { createMockAssetEntry } from "#shared/mocks/mock-assets.js";
import { createMockProject } from "#shared/mocks/mock-project.js";
import { createMockScene } from "#shared/mocks/mock-scene.js";
import { createMockLocation } from "#shared/mocks/mock-location.ts";
import { createMockCharacter } from "#shared/mocks/mock-character.ts";
import { createMockProp } from "#shared/mocks/mock-prop.ts";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssetVersionManager } from "#shared/services/asset-version-manager.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { db } from "#shared/db/index.js";
import { generateId } from "#shared/utils/id.ts";
import { SceneQueryResult } from "#shared/types/schema.types.ts";

// Mock the database - factory must not reference top-level variables (vi.mock is hoisted)
vi.mock("#shared/db/index.js", () => {
  const createMockTable = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
  });

  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {
      characters: createMockTable(),
      locations: createMockTable(),
      scenes: createMockTable(),
      props: createMockTable(),
    },
    transaction: vi.fn((fn: any) => fn(db)),
  };
  return { db };
});

describe("AssetVersionManager", () => {
  let manager: AssetVersionManager;
  let mockProjectRepo: ProjectRepository;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockProjectRepo = new ProjectRepository();
    manager = new AssetVersionManager(mockProjectRepo);
  });

  describe("createVersionedAssets", () => {
    it("should throw for empty dataList with sceneIds scope", async () => {
      const scope = {
        projectId: "proj-1",
        sceneIds: ["scene-1"],
      };

      await expect(
        manager.createVersionedAssets(
          scope,
          ["image_file"],
          "image",
          [], // Empty data list - should fail
          { model: "test-model", jobId: "test-job-id" },
        ),
      ).rejects.toThrow();
    });

    it("should validate imageIds scope correctly", async () => {
      const scope = {
        projectId: "proj-1",
        imageIds: ["img-1"],
      };

      await expect(
        manager.createVersionedAssets(
          scope,
          ["image_file"],
          "image",
          [], // Empty data list - should fail
          {},
        ),
      ).rejects.toThrow();
    });
  });

  describe("getNextVersionNumber", () => {
    it("should return next version numbers for entities", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "entry-1",
              head: 1,
              best: 1,
              projectId: "proj-1",
              sceneId: "scene-1",
              assetKey: "image_file",
            },
          ]),
        }),
      } as any);

      const scope = {
        projectId: "proj-1",
        sceneIds: ["scene-1"],
      };

      const versions = await manager.getNextVersionNumber(scope, ["image_file"]);
      expect(versions).toEqual([2]); // head is 1, so next is 2
    });

    it("should return 1 for entities with no existing entries", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const scope = {
        projectId: "proj-1",
        sceneIds: ["new-scene"],
      };

      const versions = await manager.getNextVersionNumber(scope, ["image_file"]);
      expect(versions).toEqual([1]); // No entry, so next is 1
    });

    it("should return next version number for image entity", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "entry-1",
              head: 3,
              best: 2,
              projectId: "proj-1",
              imageId: "img-1",
              assetKey: "image_file",
            },
          ]),
        }),
      } as any);

      const scope = {
        projectId: "proj-1",
        imageIds: ["img-1"],
      };

      const versions = await manager.getNextVersionNumber(scope, ["image_file"]);
      expect(versions).toEqual([4]); // head is 3, so next is 4
    });
  });

  describe("getBestVersion", () => {
    it("should return null for assets with no entries", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const scope = {
        projectId: "proj-1",
        sceneIds: ["scene-1"],
      };

      const bestVersions = await manager.getBestVersion(scope, ["image_file"]);
      expect(bestVersions).toEqual([null]); // No entry, so null
    });
  });

  describe("setBestVersion", () => {
    it("should throw if entity count does not match version count", async () => {
      const scope = {
        projectId: "proj-1",
        sceneIds: ["scene-1", "scene-2"],
      };

      await expect(manager.setBestVersion(scope, ["image_file"], [1])).rejects.toThrow(
        "Scope has 2 entities but 1 version numbers were provided",
      );
    });

    it("should set best version for image entity", async () => {
      // setBestVersion calls fetchEntriesFull twice:
      // 1. Before update to validate versions exist
      // 2. After update in resolveHistoriesFull

      // First call - before update (best is still 2)
      const mockBuilder1 = createBuilder([
        {
          entry: {
            id: "entry-1",
            head: 3,
            best: 2,
            projectId: "proj-1",
            imageId: "img-1",
            assetKey: "image_file",
          },
          version: {
            version: 2,
            data: "gs://bucket/v2.png",
            type: "image",
            metadata: {},
          },
        },
        {
          entry: {
            id: "entry-1",
            head: 3,
            best: 2,
            projectId: "proj-1",
            imageId: "img-1",
            assetKey: "image_file",
          },
          version: {
            version: 3,
            data: "gs://bucket/v3.png",
            type: "image",
            metadata: {},
          },
        },
      ]);

      // Second call - after update (best should be 3)
      const mockBuilder2 = createBuilder([
        {
          entry: {
            id: "entry-1",
            head: 3,
            best: 3,
            projectId: "proj-1",
            imageId: "img-1",
            assetKey: "image_file",
          },
          version: {
            version: 2,
            data: "gs://bucket/v2.png",
            type: "image",
            metadata: {},
          },
        },
        {
          entry: {
            id: "entry-1",
            head: 3,
            best: 3,
            projectId: "proj-1",
            imageId: "img-1",
            assetKey: "image_file",
          },
          version: {
            version: 3,
            data: "gs://bucket/v3.png",
            type: "image",
            metadata: {},
          },
        },
      ]);

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBuilder1 as any)
        .mockReturnValueOnce(mockBuilder2 as any);

      // Mock update chain for setBestVersion
      const mockUpdateBuilder = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: "entry-1", best: 3 }]),
      };
      vi.mocked(db.update).mockReturnValue(mockUpdateBuilder as any);

      const scope = {
        projectId: "proj-1",
        imageIds: ["img-1"],
      };

      const result = await manager.setBestVersion(scope, ["image_file"], [3]);
      expect(result[0].best).toBe(3);
    });
  });

  describe("deleteVersions", () => {
    it("should throw if trying to delete the best version", async () => {
      // Mock select chain for fetchEntriesFull (called inside deleteVersions)
      // Drizzle leftJoin returns objects with .entry and .version properties
      const mockBuilder = createBuilder([
        {
          entry: {
            id: "entry-1",
            head: 1,
            best: 1,
            projectId: "proj-1",
            sceneId: "scene-1",
            assetKey: "image_file",
          },
          version: {
            version: 1,
            data: "gs://bucket/v1.png",
            type: "image",
            metadata: {},
          },
        },
      ]);
      vi.mocked(db.select).mockReturnValue(mockBuilder as any);

      const scope = {
        projectId: "proj-1",
        sceneIds: ["scene-1"],
      };

      await expect(manager.deleteVersions(scope, ["image_file"], [1])).rejects.toThrow(
        "Cannot delete version 1 - it is currently marked as best",
      );
    });

    it("should throw if trying to delete the best version for image", async () => {
      // Mock select chain for fetchEntriesFull
      const mockBuilder = createBuilder([
        {
          entry: {
            id: "entry-1",
            head: 2,
            best: 1,
            projectId: "proj-1",
            imageId: "img-1",
            assetKey: "image_file",
          },
          version: {
            version: 1,
            data: "gs://bucket/v1.png",
            type: "image",
            metadata: {},
          },
        },
        {
          entry: {
            id: "entry-1",
            head: 2,
            best: 1,
            projectId: "proj-1",
            imageId: "img-1",
            assetKey: "image_file",
          },
          version: {
            version: 2,
            data: "gs://bucket/v2.png",
            type: "image",
            metadata: {},
          },
        },
      ]);
      vi.mocked(db.select).mockReturnValue(mockBuilder as any);

      const scope = {
        projectId: "proj-1",
        imageIds: ["img-1"],
      };

      await expect(manager.deleteVersions(scope, ["image_file"], [1])).rejects.toThrow(
        "Cannot delete version 1 - it is currently marked as best",
      );
    });
  });

  describe("getAllSceneAssets", () => {
    it("should return empty registry for non-existent scene", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const registry = await manager.getAllSceneAssets("non-existent-scene");
      expect(registry).toEqual({});
    });
  });

  describe("getAllProjectAssets", () => {
    it("should return empty registry for non-existent project", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const registry = await manager.getAllProjectAssets("non-existent-project");
      expect(registry).toEqual({});
    });
  });

  describe("getAllCharacterAssets", () => {
    it("should return empty registry for non-existent character", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const registry = await manager.getAllCharacterAssets("non-existent-character");
      expect(registry).toEqual({});
    });
  });

  describe("getAllLocationAssets", () => {
    it("should return empty registry for non-existent location", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const registry = await manager.getAllLocationAssets("non-existent-location");
      expect(registry).toEqual({});
    });
  });

  describe("getAllFileAssets", () => {
    it("should return empty registry for non-existent file", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const registry = await manager.getAllFileAssets("non-existent-file");
      expect(registry).toEqual({});
    });
  });

  describe("getAssetRegistryForEntity", () => {
    it("should call getAllCharacterAssets for character entity type", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await manager.getAssetRegistryForEntity("char-1", "character");
      expect(db.select).toHaveBeenCalled();
    });

    it("should call getAllLocationAssets for location entity type", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await manager.getAssetRegistryForEntity("loc-1", "location");
      expect(db.select).toHaveBeenCalled();
    });

    it("should call getAllSceneAssets for scene entity type", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await manager.getAssetRegistryForEntity("scene-1", "scene");
      expect(db.select).toHaveBeenCalled();
    });

    it("should call getAllFileAssets for image entity type", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await manager.getAssetRegistryForEntity("img-1", "image");
      expect(db.select).toHaveBeenCalled();
    });

    it("should call getAllProjectAssets for project entity type", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await manager.getAssetRegistryForEntity("proj-1", "project");
      expect(db.select).toHaveBeenCalled();
    });
  });

  describe("getCompletedProjectVideos", () => {
    it("should return videos with optional filters", async () => {
      // Mock the complex query chain for getCompletedProjectVideos
      const mockBuilder = createBuilder([]);
      vi.mocked(db.select).mockReturnValue(mockBuilder);

      const videos = await manager.getCompletedProjectVideos({ limit: 10 });
      expect(videos).toEqual([]);
    });

    it("should apply minDuration filter when provided", async () => {
      // Mock the complex query chain for getCompletedProjectVideos
      const mockBuilder = createBuilder([]);
      vi.mocked(db.select).mockReturnValue(mockBuilder);

      const videos = await manager.getCompletedProjectVideos({ minDuration: 5 });
      expect(videos).toEqual([]);
    });
  });
});

describe("Architecture Regression Tests", () => {
  describe("AssetVersionManager: Entity & Prop Handling", () => {
    let manager: AssetVersionManager;
    let mockProjectRepo: ProjectRepository;
    let projectId: string;

    beforeEach(() => {
      vi.resetModules();
      vi.clearAllMocks();
      mockProjectRepo = new ProjectRepository();
      vi.spyOn(mockProjectRepo, "getProject").mockResolvedValue(createMockProject());

      manager = new AssetVersionManager(mockProjectRepo);
      projectId = generateId();
    });

    it('should build a valid query filter for "prop" entities (Missing Query Filters)', () => {
      const filter = manager["buildEntityFilter"]("prop", ["prop-123"]);

      // If the switch case is missing, this returns undefined and breaks Drizzle
      expect(filter).toBeDefined();
    });

    it("should correctly match a prop entity in memory (Missing matchesEntity case)", () => {
      const mockEntry = createMockAssetEntry({
        propId: "prop-123",
        assetKey: "description",
      });
      const isMatch = manager["matchesEntity"](mockEntry, "prop", "prop-123");
      const isMismatch = manager["matchesEntity"](mockEntry, "prop", "prop-999");

      expect(isMatch).toBe(true);
      expect(isMismatch).toBe(false);
    });

    it("should fetch characters and props independently", async () => {
      vi.mocked(db.query.characters.findMany).mockResolvedValue([createMockCharacter({ name: "Hero" }) as any]);
      vi.mocked(db.query.props.findMany).mockResolvedValue([createMockProp({ name: "Magic Sword" }) as any]);

      const result = await mockProjectRepo.getProjectFullState(projectId, db);

      // Verify independent results
      expect(result.characters[0].name).toBe("Hero");
      expect((result as any).props[0].name).toBe("Magic Sword");

      // Verify specific DB calls were made
      expect(db.query.characters.findMany).toHaveBeenCalled();
      expect(db.query.props.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ projectId }),
      });
    });

    it('should route "prop" registries to getAllPropAssets, not getAllProjectAssets (Wrong Fallback Query)', async () => {
      const spyGetAllPropAssets = vi.spyOn(manager as any, "getAllPropAssets").mockResolvedValue([]);
      const spyGetAllProjectAssets = vi.spyOn(manager as any, "getAllProjectAssets").mockResolvedValue([]);

      await manager.getAssetRegistryForEntity("prop-123", "prop");

      expect(spyGetAllProjectAssets).not.toHaveBeenCalled();
      expect(spyGetAllPropAssets).toHaveBeenCalledWith("prop-123");
    });

    // it("should catch and return database constraints in the errors array (The Silent Failure Trap)", async () => {
    //   vi.spyOn(manager as any, "batchUpsertEntries").mockRejectedValue(
    //     new Error("DB Constraint Failed"),
    //   );

    //   const mockOperations = [
    //     [
    //       {
    //         projectId: generateId(),
    //         entityIds: "scene-1",
    //         entityType: "scene",
    //         assets: [],
    //       },
    //     ],
    //   ];

    //   const result = await manager.batchCreateVersionedAssets(mockOperations);

    //   expect(result.histories).toHaveLength(0);
    //   expect(result.errors).toHaveLength(1);
    //   expect(result.errors[0].error.message).toBe("DB Constraint Failed");
    // });

    it("should fetch scenes using the Relational Query API", async () => {
      const sceneQueryResult: SceneQueryResult[] = [{ ...createMockScene({}), characters: [{ id: generateId() }] }];
      vi.mocked(db.query.scenes.findMany).mockResolvedValue(sceneQueryResult);
      vi.mocked(db.query.characters.findMany).mockResolvedValue([createMockCharacter() as any]);
      vi.mocked(db.query.props.findMany).mockResolvedValue([createMockProp({ name: "Magic Sword" }) as any]);

      await mockProjectRepo.getProjectFullState(projectId, db);
      expect(db.query.scenes.findMany).toHaveBeenCalled();
    });

    it("should fetch characters using the Relational Query API", async () => {
      const characterQueryResult = [createMockCharacter() as any];
      vi.mocked(db.query.characters.findMany).mockResolvedValue(characterQueryResult);
      vi.mocked(db.query.props.findMany).mockResolvedValue([createMockProp({ name: "Magic Sword" }) as any]);

      await mockProjectRepo.getProjectFullState(projectId, db);

      expect(db.query.characters.findMany).toHaveBeenCalled();
    });
  });

  describe("ProjectRepository: Global State & Manifest handling", () => {
    let repository: ProjectRepository;

    beforeEach(() => {
      vi.resetModules();
      vi.clearAllMocks();
      repository = new ProjectRepository();

      vi.mocked(db.query.scenes.findMany).mockResolvedValue([createMockScene() as any]);
      vi.mocked(db.query.characters.findMany).mockResolvedValue([createMockCharacter() as any]);
      vi.mocked(db.query.locations.findMany).mockResolvedValue([createMockLocation() as any]);
      vi.mocked(db.query.props.findMany).mockResolvedValue([createMockProp({ name: "Magic Sword" }) as any]);
    });

    it("should query props table when fetching the full project state", async () => {
      vi.spyOn(repository, "getProject").mockResolvedValue(createMockProject());
      const sceneQueryResult: SceneQueryResult[] = [{ ...createMockScene({}), characters: [{ id: generateId() }] }];
      vi.spyOn(repository, "queryScenesWithRelationships").mockResolvedValue(sceneQueryResult);

      const projectId = generateId();
      await repository.getProjectFullState(projectId, db);

      expect(db.query.characters.findMany).toHaveBeenCalled();
      expect(db.query.locations.findMany).toHaveBeenCalled();
      expect(db.query.props.findMany).toHaveBeenCalledWith({
        where: { projectId },
      });
    });

    it("should include propId in the generated project manifest (Missing from Manifest)", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ propId: "prop-123", assetKey: "thumbnail", version: 1 }]),
        }),
      });

      const projectId = generateId();
      const manifest = await repository.getProjectManifest(projectId);

      expect(manifest.props).toBeDefined();
      expect(manifest.props["prop-123"]).toBeDefined();
      expect(manifest.props["prop-123"]["thumbnail"]).toBeDefined();
    });
  });
});
