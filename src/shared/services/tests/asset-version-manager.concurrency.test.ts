import "#shared/mocks/mock-db.js";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AssetVersionManager } from "../asset-version-manager.js";
import {
  buildEntityCreatableAssetImageArgs,
  ENTITY_IMAGE_SCOPE_KEYS,
} from "#shared/utils/entity.utils.js";
import { InsertEntitiesInput } from "#shared/types/editable.types.ts";
import {
  buildEntityCreatableAssetDescriptionArgs,
  ENTITY_DESCRIPTION_SCOPE_KEYS,
} from "#shared/utils/entity.utils.js";
import { GenerateEntitiesPayload } from "#shared/types/editable.types.ts";

// Mock the db module - factory must not reference top-level variables (vi.mock is hoisted)
// The pattern below works because fn(db) is lazily evaluated when transaction is called
vi.mock("#shared/db/index.js", () => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn((fn: any) => fn(db)),
  };
  return { db };
});

describe("buildLayerOperations", () => {
  const projectId = "proj-123";

  describe("entity type skipping", () => {
    it("returns nothing for scene type (not in ENTITY_CONFIG)", () => {
      expect("scene" in ENTITY_IMAGE_SCOPE_KEYS).toBe(false);
      expect("file" in ENTITY_IMAGE_SCOPE_KEYS).toBe(false);
    });

    it("returns [] when entities list is empty", () => {
      const ops = buildEntityCreatableAssetImageArgs("character", [], projectId);
      expect(ops).toHaveLength(0);
    });

    it("returns [] when no entity has images", () => {
      const entities: InsertEntitiesInput = [
        { data: { id: "c1" } },
        { data: { id: "c2" }, images: [] },
      ] as InsertEntitiesInput;
      const ops = buildEntityCreatableAssetImageArgs("character", entities, projectId);
      expect(ops).toHaveLength(0);
    });
  });

  describe("layer construction — single entity", () => {
    it("produces one layer per image when one entity has N images", () => {
      const entities: InsertEntitiesInput = [
        {
          data: { id: "c1" },
          images: [
            { gcsUri: "gs://img1" },
            { gcsUri: "gs://img2" },
            { gcsUri: "gs://img3" },
          ],
        },
      ] as InsertEntitiesInput;
      const ops = buildEntityCreatableAssetImageArgs("character", entities, projectId);
      expect(ops).toHaveLength(3);
    });

    it("each layer contains the correct gcsUri for that image index", () => {
      const entities: InsertEntitiesInput = [
        {
          data: { id: "c1" },
          images: [{ gcsUri: "gs://a" }, { gcsUri: "gs://b" }],
        },
      ] as InsertEntitiesInput;
      const ops = buildEntityCreatableAssetImageArgs("character", entities, projectId);
      expect(ops[0][3]).toEqual(["gs://a"]);
      expect(ops[1][3]).toEqual(["gs://b"]);
    });
  });

  describe("layer construction — multiple entities, equal image counts", () => {
    const entities: InsertEntitiesInput = [
      {
        data: { id: "c1" },
        images: [{ gcsUri: "gs://c1-img1" }, { gcsUri: "gs://c1-img2" }],
      },
      {
        data: { id: "c2" },
        images: [{ gcsUri: "gs://c2-img1" }, { gcsUri: "gs://c2-img2" }],
      },
      {
        data: { id: "c3" },
        images: [{ gcsUri: "gs://c3-img1" }, { gcsUri: "gs://c3-img2" }],
      },
    ] as InsertEntitiesInput;

    it("produces exactly maxImages layers", () => {
      const ops = buildEntityCreatableAssetImageArgs("character", entities, projectId);
      expect(ops).toHaveLength(2);
    });

    it("layer 0 contains all entities first images in order", () => {
      const ops = buildEntityCreatableAssetImageArgs("character", entities, projectId);
      expect(ops[0][3]).toEqual(["gs://c1-img1", "gs://c2-img1", "gs://c3-img1"]);
    });

    it("layer 1 contains all entities second images in order", () => {
      const ops = buildEntityCreatableAssetImageArgs("character", entities, projectId);
      expect(ops[1][3]).toEqual(["gs://c1-img2", "gs://c2-img2", "gs://c3-img2"]);
    });

    it("scope entityIds are parallel-ordered with dataList", () => {
      const ops = buildEntityCreatableAssetImageArgs("character", entities, projectId);
      const scope = ops[0][0] as { projectId: string; characterIds: string[] };
      expect(scope.characterIds).toEqual(["c1", "c2", "c3"]);
    });

    it("metadata length matches dataList length", () => {
      const ops = buildEntityCreatableAssetImageArgs("character", entities, projectId);
      ops.forEach((op) => {
        expect(op[4]).toHaveLength(op[3].length);
      });
    });
  });

  describe("layer construction — ragged image counts (entities drop off)", () => {
    const entities: InsertEntitiesInput = [
      {
        data: { id: "c1" },
        images: [
          { gcsUri: "gs://c1-img1" },
          { gcsUri: "gs://c1-img2" },
          { gcsUri: "gs://c1-img3" },
        ],
      },
      {
        data: { id: "c2" },
        images: [{ gcsUri: "gs://c2-img1" }, { gcsUri: "gs://c2-img2" }],
      },
      { data: { id: "c3" }, images: [{ gcsUri: "gs://c3-img1" }] },
    ] as InsertEntitiesInput;

    it("produces maxImages layers (driven by the longest entity)", () => {
      const ops = buildEntityCreatableAssetImageArgs("character", entities, projectId);
      expect(ops).toHaveLength(3);
    });

    it("layer 0 includes all three entities", () => {
      const ops = buildEntityCreatableAssetImageArgs("character", entities, projectId);
      expect(ops[0][3]).toEqual(["gs://c1-img1", "gs://c2-img1", "gs://c3-img1"]);
    });

    it("layer 1 excludes entity that has no second image", () => {
      const ops = buildEntityCreatableAssetImageArgs("character", entities, projectId);
      expect(ops[1][3]).toEqual(["gs://c1-img2", "gs://c2-img2"]);
      const scope = ops[1][0] as { projectId: string; characterIds: string[] };
      expect(scope.characterIds).toEqual(["c1", "c2"]);
    });

    it("layer 2 contains only the entity with three images", () => {
      const ops = buildEntityCreatableAssetImageArgs("character", entities, projectId);
      expect(ops[2][3]).toEqual(["gs://c1-img3"]);
      const scope = ops[2][0] as { projectId: string; characterIds: string[] };
      expect(scope.characterIds).toEqual(["c1"]);
    });

    it("entities without images are omitted from all layers", () => {
      const withNoImages: InsertEntitiesInput = [
        ...entities,
        { data: { id: "c4" } },
        { data: { id: "c5" }, images: [] },
      ] as InsertEntitiesInput;
      const ops = buildEntityCreatableAssetImageArgs(
        "character",
        withNoImages,
        projectId,
      );
      ops.forEach((op) => {
        const scope = op[0] as { projectId: string; characterIds: string[] };
        expect(scope.characterIds).not.toContain("c4");
        expect(scope.characterIds).not.toContain("c5");
      });
    });
  });

  describe("scope key & tag per entity type", () => {
    const singleEntity: InsertEntitiesInput = [
      {
        data: { id: "e1" },
        images: [{ gcsUri: "gs://img" }],
      },
    ] as InsertEntitiesInput;

    it("character uses characterIds scope and character_image tag", () => {
      const ops = buildEntityCreatableAssetImageArgs(
        "character",
        singleEntity,
        projectId,
      );
      expect(ops[0][0]).toMatchObject({ characterIds: ["e1"] });
      expect(ops[0][1]).toEqual(["character_image"]);
    });

    it("location uses locationIds scope and location_image tag", () => {
      const ops = buildEntityCreatableAssetImageArgs("location", singleEntity, projectId);
      expect(ops[0][0]).toMatchObject({ locationIds: ["e1"] });
      expect(ops[0][1]).toEqual(["location_image"]);
    });

    it("prop uses propIds scope and image_file tag", () => {
      const ops = buildEntityCreatableAssetImageArgs("prop", singleEntity, projectId);
      expect(ops[0][0]).toMatchObject({ propIds: ["e1"] });
      expect(ops[0][1]).toEqual(["image_file"]);
    });

    it("all operations carry projectId in scope", () => {
      const ops = buildEntityCreatableAssetImageArgs(
        "character",
        singleEntity,
        projectId,
      );
      expect((ops[0][0] as { projectId: string }).projectId).toBe(projectId);
    });

    it("type is always image", () => {
      const ops = buildEntityCreatableAssetImageArgs(
        "character",
        singleEntity,
        projectId,
      );
      expect(ops[0][2]).toBe("image");
    });

    it("setBestVersion is always true", () => {
      const ops = buildEntityCreatableAssetImageArgs(
        "character",
        singleEntity,
        projectId,
      );
      expect(ops[0][5]).toBe(true);
    });
  });
});

describe("AssetVersionManager - Concurrency Safe Upserts", () => {
  it("should lexicographically sort entries by ID before dispatching batch to prevent deadlocks", async () => {
    const mockDb = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    const avm = new AssetVersionManager({} as any);

    // Provide entries completely out of order
    const mockEntriesOutOfOrder = [
      { id: "Z-123", assetKey: "audio" },
      { id: "A-123", assetKey: "video" },
      { id: "M-123", assetKey: "prompt" },
    ] as any[];

    // @ts-ignore - testing private method
    await (avm as any).batchUpsertEntries(mockEntriesOutOfOrder, mockDb as any);

    // Verify the db layer received the batch perfectly sorted
    const calledParamsBatch = (mockDb.values as any).mock.calls[0][0];

    expect(calledParamsBatch[0].id).toBe("A-123");
    expect(calledParamsBatch[1].id).toBe("M-123");
    expect(calledParamsBatch[2].id).toBe("Z-123");
  });
});

describe("Requirement 1: Atomic Append-Only History", () => {
  // These tests require database transactions and are skipped because
  // they need a real database to test concurrent behavior properly.
  // The unit tests for the pure logic are covered above.

  it.skip("R1: Should handle simultaneous creation of the FIRST version (The Genesis Race)", async () => {
    // This test requires real database with transaction support
    // Skipped in unit tests - should be tested in integration tests
  });

  it.skip("R1.2: Should handle simultaneous appends to existing history (The Mid-stream Race)", async () => {
    // This test requires real database with transaction support
    // Skipped in unit tests - should be tested in integration tests
  });

  it.skip("R2.1: Updates to best pointer must not modify immutable version payloads", async () => {
    // This test requires real database with transaction support
    // Skipped in unit tests - should be tested in integration tests
  });
});

describe("buildEntityCreatableAssetDescriptionArgs", () => {
  const projectId = "proj-123";

  // -------------------------------------------------------------------------
  describe("entity type skipping", () => {
    it("returns nothing for scene type (not in ENTITY_DESCRIPTION_SCOPE_KEYS)", () => {
      expect("scene" in ENTITY_DESCRIPTION_SCOPE_KEYS).toBe(false);
      expect("file" in ENTITY_DESCRIPTION_SCOPE_KEYS).toBe(false);
    });

    it("returns [] when entities list is empty", () => {
      const ops = buildEntityCreatableAssetDescriptionArgs("character", [], projectId);
      expect(ops).toHaveLength(0);
    });

    it("returns [] when no entity has a description", () => {
      const entities = [
        { data: { id: "c1" } },
        { data: { id: "c2", description: "" } }, // falsy — excluded
        { data: { id: "c3", description: null } }, // falsy — excluded
      ] as unknown as GenerateEntitiesPayload;
      const ops = buildEntityCreatableAssetDescriptionArgs(
        "character",
        entities,
        projectId,
      );
      expect(ops).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  describe("always at most one operation (no multiplexing)", () => {
    it("produces exactly one operation when at least one entity has a description", () => {
      const entities = [
        { data: { id: "c1", description: "A brave hero" } },
        { data: { id: "c2", description: "A cunning rogue" } },
      ] as unknown as GenerateEntitiesPayload;
      const ops = buildEntityCreatableAssetDescriptionArgs(
        "character",
        entities,
        projectId,
      );
      expect(ops).toHaveLength(1);
    });

    it("produces exactly one operation even when only a single entity has a description", () => {
      const entities = [
        { data: { id: "c1", description: "Only one" } },
      ] as unknown as GenerateEntitiesPayload;
      const ops = buildEntityCreatableAssetDescriptionArgs(
        "character",
        entities,
        projectId,
      );
      expect(ops).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  describe("filtering — entities without descriptions are excluded", () => {
    it("omits entities with no description from dataList and scope", () => {
      const entities = [
        { data: { id: "c1", description: "Has one" } },
        { data: { id: "c2" } }, // no description field
        { data: { id: "c3", description: "" } }, // empty string — falsy
      ] as unknown as GenerateEntitiesPayload;
      const ops = buildEntityCreatableAssetDescriptionArgs(
        "character",
        entities,
        projectId,
      );
      const scope = ops[0][0] as { projectId: string; characterIds: string[] };
      expect(scope.characterIds).toEqual(["c1"]);
      expect(ops[0][3]).toEqual(["Has one"]);
    });

    it("dataList and scope ids stay parallel after filtering", () => {
      const entities = [
        { data: { id: "c1" } },
        { data: { id: "c2", description: "Second" } },
        { data: { id: "c3" } },
        { data: { id: "c4", description: "Fourth" } },
      ] as unknown as GenerateEntitiesPayload;
      const ops = buildEntityCreatableAssetDescriptionArgs(
        "character",
        entities,
        projectId,
      );
      const scope = ops[0][0] as { projectId: string; characterIds: string[] };
      expect(scope.characterIds).toEqual(["c2", "c4"]);
      expect(ops[0][3]).toEqual(["Second", "Fourth"]);
    });
  });

  // -------------------------------------------------------------------------
  describe("operation tuple shape", () => {
    const entities = [
      { data: { id: "c1", description: "A hero" } },
      { data: { id: "c2", description: "A villain" } },
    ] as unknown as GenerateEntitiesPayload;

    it("dataList contains all descriptions in entity order", () => {
      const ops = buildEntityCreatableAssetDescriptionArgs(
        "character",
        entities,
        projectId,
      );
      expect(ops[0][3]).toEqual(["A hero", "A villain"]);
    });

    it("metadata array is parallel to dataList", () => {
      const ops = buildEntityCreatableAssetDescriptionArgs(
        "character",
        entities,
        projectId,
      );
      expect(ops[0][4]).toHaveLength(ops[0][3].length);
    });

    it('asset type is "text", not "image"', () => {
      const ops = buildEntityCreatableAssetDescriptionArgs(
        "character",
        entities,
        projectId,
      );
      expect(ops[0][2]).toBe("text");
    });

    it("setBestVersion is always true", () => {
      const ops = buildEntityCreatableAssetDescriptionArgs(
        "character",
        entities,
        projectId,
      );
      expect(ops[0][5]).toBe(true);
    });

    it("scope carries projectId", () => {
      const ops = buildEntityCreatableAssetDescriptionArgs(
        "character",
        entities,
        projectId,
      );
      expect((ops[0][0] as { projectId: string }).projectId).toBe(projectId);
    });
  });

  // -------------------------------------------------------------------------
  describe("scope key & tag per entity type", () => {
    const singleEntity = [
      { data: { id: "e1", description: "Test description" } },
    ] as unknown as GenerateEntitiesPayload;

    it("character uses characterIds scope and description tag", () => {
      const ops = buildEntityCreatableAssetDescriptionArgs(
        "character",
        singleEntity,
        projectId,
      );
      expect(ops[0][0]).toMatchObject({ characterIds: ["e1"] });
      expect(ops[0][1]).toEqual(["description"]);
    });

    it("location uses locationIds scope and description tag", () => {
      const ops = buildEntityCreatableAssetDescriptionArgs(
        "location",
        singleEntity,
        projectId,
      );
      expect(ops[0][0]).toMatchObject({ locationIds: ["e1"] });
      expect(ops[0][1]).toEqual(["description"]);
    });

    it("prop uses propIds scope and description tag", () => {
      const ops = buildEntityCreatableAssetDescriptionArgs(
        "prop",
        singleEntity,
        projectId,
      );
      expect(ops[0][0]).toMatchObject({ propIds: ["e1"] });
      expect(ops[0][1]).toEqual(["description"]);
    });
  });
});
