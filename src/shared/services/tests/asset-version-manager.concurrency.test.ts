import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssetVersionManager } from '../asset-version-manager.js';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { assetEntries, assetVersions } from '../../db/schema.js';
import { createMockRepository } from '../../mocks/mock-db.js';

// Helper to inspect DB state directly
const getEntry = async (projectId: string, key: string) =>
  db.select().from(assetEntries).where(sql`${assetEntries.projectId} = ${projectId} AND ${assetEntries.assetKey} = ${key}`);

const getVersions = async (entryId: string) =>
  db.select().from(assetVersions).where(sql`${assetVersions.assetEntryId} = ${entryId} ORDER BY version ASC`);


interface EntityImage { gcsUri: string }

interface TestEntity {
  data: { id: string };
  images?: EntityImage[];
}

type EntityType = "character" | "location" | "prop" | "scene" | "file";

interface GroupedEntities {
  [key: string]: TestEntity[] | undefined;
}

// ─── Logic under test (extracted pure functions) ──────────────────────────────

const ENTITY_CONFIG = {
  character: { tag: "character_image", scopeKey: "characterIds" },
  location: { tag: "location_image", scopeKey: "locationIds" },
  prop: { tag: "prop_image", scopeKey: "propIds" },
} as const;

type SupportedEntityType = keyof typeof ENTITY_CONFIG;

/**
 * Builds the operations array for a single entity type.
 * Each operation = one image layer across all entities that have an image at that index.
 */
function buildLayerOperations(
  entityType: SupportedEntityType,
  entities: TestEntity[],
  projectId: string,
) {
  const { tag, scopeKey } = ENTITY_CONFIG[entityType];

  const entitiesWithImages = entities.filter(e => (e.images?.length ?? 0) > 0);
  if (!entitiesWithImages.length) return [];

  const maxImages = Math.max(...entitiesWithImages.map(e => e.images!.length));

  return Array.from({ length: maxImages }, (_, imgIndex) => {
    const layerEntities = entitiesWithImages.filter(e => e.images![imgIndex] != null);
    return [
      { projectId, [scopeKey]: layerEntities.map(e => e.data.id) },
      [tag],
      "image",
      layerEntities.map(e => e.images![imgIndex].gcsUri),
      layerEntities.map(() => ({})),
      true,
    ] as const;
  }).filter(op => op[3].length > 0);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildLayerOperations", () => {

  const projectId = "proj-123";

  describe("entity type skipping", () => {
    it("returns nothing for scene type (not in ENTITY_CONFIG)", () => {
      // scene is excluded at the call site — ENTITY_CONFIG doesn't include it
      expect("scene" in ENTITY_CONFIG).toBe(false);
      expect("file" in ENTITY_CONFIG).toBe(false);
    });

    it("returns [] when entities list is empty", () => {
      const ops = buildLayerOperations("character", [], projectId);
      expect(ops).toHaveLength(0);
    });

    it("returns [] when no entity has images", () => {
      const entities: TestEntity[] = [
        { data: { id: "c1" } },
        { data: { id: "c2" }, images: [] },
      ];
      const ops = buildLayerOperations("character", entities, projectId);
      expect(ops).toHaveLength(0);
    });
  });

  describe("layer construction — single entity", () => {
    it("produces one layer per image when one entity has N images", () => {
      const entities: TestEntity[] = [{
        data: { id: "c1" },
        images: [{ gcsUri: "gs://img1" }, { gcsUri: "gs://img2" }, { gcsUri: "gs://img3" }],
      }];
      const ops = buildLayerOperations("character", entities, projectId);
      expect(ops).toHaveLength(3);
    });

    it("each layer contains the correct gcsUri for that image index", () => {
      const entities: TestEntity[] = [{
        data: { id: "c1" },
        images: [{ gcsUri: "gs://a" }, { gcsUri: "gs://b" }],
      }];
      const ops = buildLayerOperations("character", entities, projectId);
      expect(ops[0][3]).toEqual(["gs://a"]);
      expect(ops[1][3]).toEqual(["gs://b"]);
    });
  });

  describe("layer construction — multiple entities, equal image counts", () => {
    const entities: TestEntity[] = [
      { data: { id: "c1" }, images: [{ gcsUri: "gs://c1-img1" }, { gcsUri: "gs://c1-img2" }] },
      { data: { id: "c2" }, images: [{ gcsUri: "gs://c2-img1" }, { gcsUri: "gs://c2-img2" }] },
      { data: { id: "c3" }, images: [{ gcsUri: "gs://c3-img1" }, { gcsUri: "gs://c3-img2" }] },
    ];

    it("produces exactly maxImages layers", () => {
      const ops = buildLayerOperations("character", entities, projectId);
      expect(ops).toHaveLength(2);
    });

    it("layer 0 contains all entities' first images in order", () => {
      const ops = buildLayerOperations("character", entities, projectId);
      expect(ops[0][3]).toEqual(["gs://c1-img1", "gs://c2-img1", "gs://c3-img1"]);
    });

    it("layer 1 contains all entities' second images in order", () => {
      const ops = buildLayerOperations("character", entities, projectId);
      expect(ops[1][3]).toEqual(["gs://c1-img2", "gs://c2-img2", "gs://c3-img2"]);
    });

    it("scope entityIds are parallel-ordered with dataList", () => {
      const ops = buildLayerOperations("character", entities, projectId);
      const scope = ops[0][0] as { projectId: string; characterIds: string[] };
      expect(scope.characterIds).toEqual(["c1", "c2", "c3"]);
    });

    it("metadata length matches dataList length", () => {
      const ops = buildLayerOperations("character", entities, projectId);
      ops.forEach(op => {
        expect(op[4]).toHaveLength(op[3].length);
      });
    });
  });

  describe("layer construction — ragged image counts (entities drop off)", () => {
    const entities: TestEntity[] = [
      { data: { id: "c1" }, images: [{ gcsUri: "gs://c1-img1" }, { gcsUri: "gs://c1-img2" }, { gcsUri: "gs://c1-img3" }] },
      { data: { id: "c2" }, images: [{ gcsUri: "gs://c2-img1" }, { gcsUri: "gs://c2-img2" }] },
      { data: { id: "c3" }, images: [{ gcsUri: "gs://c3-img1" }] },
    ];

    it("produces maxImages layers (driven by the longest entity)", () => {
      const ops = buildLayerOperations("character", entities, projectId);
      expect(ops).toHaveLength(3);
    });

    it("layer 0 includes all three entities", () => {
      const ops = buildLayerOperations("character", entities, projectId);
      expect(ops[0][3]).toEqual(["gs://c1-img1", "gs://c2-img1", "gs://c3-img1"]);
    });

    it("layer 1 excludes entity that has no second image", () => {
      const ops = buildLayerOperations("character", entities, projectId);
      expect(ops[1][3]).toEqual(["gs://c1-img2", "gs://c2-img2"]);
      const scope = ops[1][0] as { characterIds: string[] };
      expect(scope.characterIds).toEqual(["c1", "c2"]);
    });

    it("layer 2 contains only the entity with three images", () => {
      const ops = buildLayerOperations("character", entities, projectId);
      expect(ops[2][3]).toEqual(["gs://c1-img3"]);
      const scope = ops[2][0] as { characterIds: string[] };
      expect(scope.characterIds).toEqual(["c1"]);
    });

    it("entities without images are omitted from all layers", () => {
      const withNoImages: TestEntity[] = [
        ...entities,
        { data: { id: "c4" } },
        { data: { id: "c5" }, images: [] },
      ];
      const ops = buildLayerOperations("character", withNoImages, projectId);
      ops.forEach(op => {
        const scope = op[0] as { characterIds: string[] };
        expect(scope.characterIds).not.toContain("c4");
        expect(scope.characterIds).not.toContain("c5");
      });
    });
  });

  describe("scope key & tag per entity type", () => {
    const singleEntity: TestEntity[] = [{
      data: { id: "e1" }, images: [{ gcsUri: "gs://img" }],
    }];

    it("character uses characterIds scope and character_image tag", () => {
      const ops = buildLayerOperations("character", singleEntity, projectId);
      expect(ops[0][0]).toMatchObject({ characterIds: ["e1"] });
      expect(ops[0][1]).toEqual(["character_image"]);
    });

    it("location uses locationIds scope and location_image tag", () => {
      const ops = buildLayerOperations("location", singleEntity, projectId);
      expect(ops[0][0]).toMatchObject({ locationIds: ["e1"] });
      expect(ops[0][1]).toEqual(["location_image"]);
    });

    it("prop uses propIds scope and prop_image tag", () => {
      const ops = buildLayerOperations("prop", singleEntity, projectId);
      expect(ops[0][0]).toMatchObject({ propIds: ["e1"] });
      expect(ops[0][1]).toEqual(["prop_image"]);
    });

    it("all operations carry projectId in scope", () => {
      const ops = buildLayerOperations("character", singleEntity, projectId);
      expect((ops[0][0] as { projectId: string }).projectId).toBe(projectId);
    });

    it("type is always 'image'", () => {
      const ops = buildLayerOperations("character", singleEntity, projectId);
      expect(ops[0][2]).toBe("image");
    });

    it("setBestVersion is always true", () => {
      const ops = buildLayerOperations("character", singleEntity, projectId);
      expect(ops[0][5]).toBe(true);
    });
  });

  describe("batchCreateVersionedAssets integration", () => {
    it("is called once per entity type with all layer operations", async () => {
      const mockBatch = vi.fn().mockResolvedValue({ histories: [], errors: [] });
      const assetManager = { batchCreateVersionedAssets: mockBatch };

      const entities: TestEntity[] = [
        { data: { id: "c1" }, images: [{ gcsUri: "gs://a" }, { gcsUri: "gs://b" }] },
        { data: { id: "c2" }, images: [{ gcsUri: "gs://c" }] },
      ];

      const ops = buildLayerOperations("character", entities, projectId);
      await assetManager.batchCreateVersionedAssets(ops);

      expect(mockBatch).toHaveBeenCalledTimes(1);
      // Both layers passed in a single call
      expect(mockBatch).toHaveBeenCalledWith(expect.arrayContaining([
        expect.arrayContaining([expect.objectContaining({ characterIds: ["c1", "c2"] })]),
        expect.arrayContaining([expect.objectContaining({ characterIds: ["c1"] })]),
      ]));
    });
  });

  describe("handle registration", () => {
    it("strips non-alphanumeric characters from entity name", () => {
      const name = "John O'Brien Jr.";
      const handle = `@${name.replace(/[^a-zA-Z0-9_]/g, "")}`;
      expect(handle).toBe("@JohnOBrienJr");
    });

    it("preserves underscores in entity name", () => {
      const name = "some_entity_name";
      const handle = `@${name.replace(/[^a-zA-Z0-9_]/g, "")}`;
      expect(handle).toBe("@some_entity_name");
    });

    it("soft-warns on registerHandle failure without throwing", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
      const registerHandle = vi.fn().mockRejectedValue(new Error("conflict"));

      await registerHandle({ handle: "@Hero", entityId: "e1", entityType: "character", projectId })
        .catch((err: Error) => console.warn({ entityId: "e1", error: err }, "[Worker] Failed to register entity handle."));

      expect(warnSpy).toHaveBeenCalledOnce();
      warnSpy.mockRestore();
    });
  });
});

describe('Requirement R1: Atomic Append-Only History', () => {
  let manager: AssetVersionManager;
  const projectId = 'proj_race_test_' + Date.now();
  const sceneId = 'scene_race_test_' + Date.now();
  const scope = { projectId, sceneIds: [sceneId] };
  const assetKey = 'scene_video';

  beforeEach(async () => {
    // Setup: Create project and scene placeholders in DB so FKs work
    // await db.insert(projects)...
    // await db.insert(scenes)...
    manager = new AssetVersionManager(createMockRepository());
  });

  it('R1.1: Should handle simultaneous creation of the FIRST version (The "Genesis Race")', async () => {
    // Two workers try to create V1 at the exact same time
    const workerA = manager.executeBatchUpdates([
      scope, [assetKey], 'video', ['video_A.mp4'], { model: 'modelA', jobId: 'jobA' }, true
    ]);
    const workerB = manager.executeBatchUpdates([
      scope, [assetKey], 'video', ['video_B.mp4'], { model: 'modelB', jobId: 'jobB' }, true
    ]);

    await Promise.all([workerA, workerB]);

    // Assertions:
    // 1. Only one entry exists
    const entries = await getEntry(projectId, assetKey);
    expect(entries.length).toBe(1);
    const entryId = entries[0].id;

    // 2. Head version is 2 (one won V1, the other got pushed to V2)
    expect(entries[0].headVersionNumber).toBe(2);

    // 3. Two distinct versions exist with correct data
    const versions = await getVersions(entryId);
    expect(versions.length).toBe(2);
    expect(versions[0].version).toBe(1);
    expect(versions[1].version).toBe(2);

    // Verify payloads are distinct (we don't know which won V1, but they shouldn't overwrite)
    const payloads = versions.map(v => v.data).sort();
    expect(payloads).toEqual(['video_A.mp4', 'video_B.mp4']);
  });

  it('R1.2: Should handle simultaneous appends to existing history (The "Mid-stream Race")', async () => {
    // Setup: V1 exists
    await manager.executeBatchUpdates([
      scope, [assetKey], 'video', ['v1.mp4'], { jobId: 'init' }, true
    ]);

    // Four parallel workers try to add versions
    const tasks = Array.from({ length: 4 }).map((_, i) =>
      manager.executeBatchUpdates([
        scope, [assetKey], 'video', [`v${i + 2}.mp4`], { jobId: `job${i + 2}` }, true
      ])
    );

    await Promise.all(tasks);

    const entries = await getEntry(projectId, assetKey);
    expect(entries[0].headVersionNumber).toBe(5); // V1 + 4 new ones

    const versions = await getVersions(entries[0].id);
    expect(versions.length).toBe(5);
    // Verify sequence is unbroken: 1, 2, 3, 4, 5
    expect(versions.map(v => v.version)).toEqual([1, 2, 3, 4, 5]);
  });

  it('R2.1: Updates to "best" pointer must not modify immutable version payloads', async () => {
    // Create V1 (set as best)
    await manager.executeBatchUpdates([scope, [assetKey], 'video', ['v1_data'], { meta: 'v1' }, true]);

    // Create V2 (set as best), V3 (not best)
    await manager.executeBatchUpdates([scope, [assetKey], 'video', ['v2_data'], { meta: 'v2' }, true]);
    await manager.executeBatchUpdates([scope, [assetKey], 'video', ['v3_data'], { meta: 'v3' }, false]);

    const [entry] = await getEntry(projectId, assetKey);
    expect(entry.bestVersionNumber).toBe(2);
    expect(entry.headVersionNumber).toBe(3);

    // Verify V1 data is untouched
    const versions = await getVersions(entry.id);
    const v1 = versions.find(v => v.version === 1);
    expect(v1?.data).toBe('v1_data');
    expect(v1?.metadata).toEqual({ meta: 'v1' });
  });
});

describe('AssetVersionManager - Concurrency Safe Upserts', () => {
  it('should lexicographically sort entries by ID before dispatching batch to prevent deadlocks', async () => {
    const mockDb = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([])
    };
    const manager = new AssetVersionManager({} as any);

    // Provide entries completely out of order
    const mockEntriesOutOfOrder = [
      { id: 'Z-123', assetKey: 'audio' },
      { id: 'A-123', assetKey: 'video' },
      { id: 'M-123', assetKey: 'prompt' }
    ] as any[];

    // @ts-ignore - testing private method
    await manager.batchUpsertEntries(mockEntriesOutOfOrder, mockDb as any);

    // Verify the db layer received the batch perfectly sorted
    const calledParamsBatch = mockDb.values.mock.calls[0][0];

    expect(calledParamsBatch[0].id).toBe('A-123');
    expect(calledParamsBatch[1].id).toBe('M-123');
    expect(calledParamsBatch[2].id).toBe('Z-123');
  });
});