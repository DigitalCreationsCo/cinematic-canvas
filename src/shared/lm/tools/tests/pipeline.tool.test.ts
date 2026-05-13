/**
 * pipeline.tool.test.ts
 *
 * Tests for the four entity pipeline tools (characters, locations, props,
 * scenes). Each pipeline owns three injected dependencies:
 *   - attributesTool  (mocked: returns entity attributes)
 *   - insertCallback  (mocked: persists to DB, returns minimal refs)
 *   - imagesTool      (mocked: generates images, returns enriched entities)
 *
 * What we test here:
 *   ✓ Full pipeline success → returns EntityWithAssets[]
 *   ✓ All attribute generations fail → insert/images never called
 *   ✓ Insert throws → error surfaced per entity, pipeline re-throws
 *   ✓ Image generation throws → non-fatal, falls back to inserted entity
 *   ✓ Partial attribute failures → only successes proceed through pipeline
 *   ✓ Image enrichment takes precedence over post-insert entity fetch
 *   ✓ ENTITY_CREATED published after insert, before image generation
 *   ✓ _call serialises EntityWithAssets results in expected JSON format
 */

import "#shared/mocks/mock-config.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateId } from "#shared/utils/id.ts";

import { createGenerateCharactersPipelineTool } from "#shared/lm/tools/characters/characters-pipeline.tool.js";
import { createGenerateLocationsPipelineTool } from "#shared/lm/tools/locations/locations-pipeline.tool.js";
import { createGeneratePropsPipelineTool } from "#shared/lm/tools/props/props-pipeline.tool.js";
import { createGenerateScenesPipelineTool } from "#shared/lm/tools/scenes/scenes-pipeline.tool.js";
import { createMockCharacter } from "#shared/mocks/mock-character.js";

// =============================================================================
// SHARED HELPERS
// =============================================================================

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    projectId: generateId(),
    worldId: "test-world",
    traceId: "pipeline-trace",
    projectRepository: {
      getEntities: vi.fn().mockResolvedValue([]),
    },
    publishPipelineEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Builds a minimal EntityWithAssets-like object that satisfies the pipeline's
 *  assembled result shape. Entity-specific fields are spread in by the caller. */
function makeEntityWithAssets(id: string, name: string, extra: Record<string, unknown> = {}) {
  return { id, name, assets: {}, ...extra };
}

// =============================================================================
// CHARACTERS
// =============================================================================

describe("GenerateCharactersPipelineTool", () => {
  let context: ReturnType<typeof makeContext>;
  let mockAttributesTool: { run: ReturnType<typeof vi.fn> };
  let mockImagesTool: { run: ReturnType<typeof vi.fn> };
  let mockInsert: ReturnType<typeof vi.fn>;

  const charAttr = { name: "Alice", description: "A brave hero", version: 1 };

  beforeEach(() => {
    vi.clearAllMocks();
    context = makeContext();
    mockAttributesTool = { run: vi.fn() };
    mockImagesTool = { run: vi.fn().mockResolvedValue([]) };
    mockInsert = vi.fn();
  });

  function makeTool() {
    return createGenerateCharactersPipelineTool({
      context: context as any,
      attributesTool: mockAttributesTool as any,
      imagesTool: mockImagesTool as any,
      insertCharacters: mockInsert,
    });
  }

  // ── Full pipeline success ───────────────────────────────────────────────────

  it("runs the full pipeline and returns CharacterWithAssets on success", async () => {
    const id = generateId();
    const insertedEntity = makeEntityWithAssets(id, "Alice");

    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: charAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "Alice" }]);
    context.projectRepository.getEntities.mockResolvedValue([{ entity: insertedEntity, entityType: "character" }]);
    mockImagesTool.run.mockResolvedValue([
      {
        success: true,
        id,
        output: "gs://bucket/img",
        entity: { ...insertedEntity, assets: { image: "gs://bucket/img" } },
      },
    ]);

    const results = await makeTool().run({
      characters: [{ id }] as any,
      generationRules: [],
      attempt: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].entity.id).toBe(id);
      expect(results[0].entity.name).toBe("Alice");
    }
  });

  it("calls attributesTool, then insertCharacters, then imagesTool in order", async () => {
    const id = generateId();
    const callOrder: string[] = [];
    const insertedEntity = makeEntityWithAssets(id, "Alice");

    mockAttributesTool.run.mockImplementation(async () => {
      callOrder.push("attributes");
      return [{ success: true, id, output: charAttr }];
    });
    mockInsert.mockImplementation(async () => {
      callOrder.push("insert");
      return [{ id, name: "Alice" }];
    });
    context.projectRepository.getEntities.mockResolvedValue([{ entity: insertedEntity, entityType: "character" }]);
    mockImagesTool.run.mockImplementation(async () => {
      callOrder.push("images");
      return [];
    });

    await makeTool().run({ characters: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(callOrder).toEqual(["attributes", "insert", "images"]);
  });

  it("publishes ENTITY_CREATED after insert with the fetched entity", async () => {
    const id = generateId();
    const insertedEntity = makeEntityWithAssets(id, "Alice");

    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: charAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "Alice" }]);
    context.projectRepository.getEntities.mockResolvedValue([{ entity: insertedEntity, entityType: "character" }]);
    mockImagesTool.run.mockResolvedValue([]);

    await makeTool().run({ characters: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(context.publishPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ENTITY_CREATED",
        worldId: "test-world",
        payload: expect.arrayContaining([expect.objectContaining({ entityId: id, entityType: "character" })]),
      }),
    );
  });

  it("skips insert/ENTITY_CREATED/images when all attribute generations fail", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: false, id, error: new Error("LLM failed") }]);

    const results = await makeTool().run({ characters: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(mockInsert).not.toHaveBeenCalled();
    expect(context.publishPipelineEvent).not.toHaveBeenCalled();
    expect(mockImagesTool.run).not.toHaveBeenCalled();

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    if (!results[0].success) expect(results[0].error.message).toBe("LLM failed");
  });

  it("re-throws when insertCharacters fails", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: charAttr }]);
    mockInsert.mockRejectedValue(new Error("DB constraint violation"));

    await expect(makeTool().run({ characters: [{ id }] as any, generationRules: [], attempt: 1 })).rejects.toThrow(
      "DB constraint violation",
    );

    expect(mockImagesTool.run).not.toHaveBeenCalled();
  });

  it("returns success when imagesTool throws — image failure is non-fatal", async () => {
    const id = generateId();
    const insertedEntity = createMockCharacter({ id, name: "Alice" });

    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: charAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "Alice" }]);
    context.projectRepository.getEntities.mockResolvedValue([{ entity: insertedEntity, entityType: "character" }]);
    mockImagesTool.run.mockRejectedValue(new Error("Image API unavailable"));

    const results = await makeTool().run({ characters: [{ id }] as any, generationRules: [], attempt: 1 });

    // Pipeline still succeeds, falling back to post-insert entity
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].entity.id).toBe(id);
    }
  });

  it("uses image-enriched entity when available, falls back to inserted entity", async () => {
    const id = generateId();
    const insertedEntity = createMockCharacter({ id, name: "Alice" });
    const enrichedEntity = createMockCharacter({ id, name: "Alice", assets: { character_image: "gs://img" } });

    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: charAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "Alice" }]);
    context.projectRepository.getEntities.mockResolvedValue([{ entity: insertedEntity, entityType: "character" }]);
    mockImagesTool.run.mockResolvedValue([{ success: true, id, output: "gs://img", entity: enrichedEntity }]);

    const results = await makeTool().run({ characters: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].entity.assets).toHaveProperty("character_image");
    }
  });

  it("only inserts and generates images for attribute successes in a partial-failure batch", async () => {
    const character1 = createMockCharacter({ name: "Alice" });
    const character2 = createMockCharacter({ name: "Jeff" });

    mockAttributesTool.run.mockResolvedValue([
      { success: true, id: character1.id, attributes: charAttr },
      { success: false, id: character2.id, error: new Error("Jeff LLM failed") },
    ]);
    mockInsert.mockResolvedValue([{ id: character1.id, name: "Alice" }]);
    context.projectRepository.getEntities.mockResolvedValue([{ entity: character1, entityType: "character" }]);
    mockImagesTool.run.mockResolvedValue([]);

    const results = await makeTool().run({
      characters: [{ id: character1.id }, { id: character2.id }] as any,
      generationRules: [],
      attempt: 1,
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: character1.id })]));
    expect(mockInsert).not.toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: character2.id })]));

    expect(results).toHaveLength(2);
    const success = results.find((r) => r.success);
    const failure = results.find((r) => !r.success);
    expect(success).toBeDefined();
    expect(failure).toBeDefined();
    if (!failure!.success) expect(failure!.error.message).toBe("Jeff LLM failed");
  });

  it("forwards generationRules and attempt to imagesTool", async () => {
    const id = generateId();
    const insertedEntity = makeEntityWithAssets(id, "Alice");

    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: charAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "Alice" }]);
    context.projectRepository.getEntities.mockResolvedValue([{ entity: insertedEntity, entityType: "character" }]);
    mockImagesTool.run.mockResolvedValue([]);

    await makeTool().run({
      characters: [{ id }] as any,
      generationRules: ["cinematic lighting"],
      attempt: 3,
    });

    expect(mockImagesTool.run).toHaveBeenCalledWith(
      expect.objectContaining({ generationRules: ["cinematic lighting"], attempt: 3 }),
    );
  });

  it("serialises _call output as { summary, results } with character field", async () => {
    const id = generateId();
    const insertedEntity = makeEntityWithAssets(id, "Alice");

    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: charAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "Alice" }]);
    context.projectRepository.getEntities.mockResolvedValue([{ entity: insertedEntity, entityType: "character" }]);
    mockImagesTool.run.mockResolvedValue([
      {}
    ]);

    const json = await makeTool()._call({
      characters: [{ id }] as any,
      generationRules: [],
      attempt: 1,
    });
    const parsed = JSON.parse(json);

    expect(parsed.summary).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(parsed.results[0].success).toBe(true);
    expect(parsed.results[0].entity.id).toBe(id);
  });
});

// =============================================================================
// LOCATIONS
// =============================================================================

describe("GenerateLocationsPipelineTool", () => {
  let context: ReturnType<typeof makeContext>;
  let mockAttributesTool: { run: ReturnType<typeof vi.fn> };
  let mockImagesTool: { run: ReturnType<typeof vi.fn> };
  let mockInsert: ReturnType<typeof vi.fn>;

  const locAttr = { name: "Cyberpunk Bar", description: "Neon-soaked dive", version: 1 };

  beforeEach(() => {
    vi.clearAllMocks();
    context = makeContext();
    mockAttributesTool = { run: vi.fn() };
    mockImagesTool = { run: vi.fn().mockResolvedValue([]) };
    mockInsert = vi.fn();
  });

  function makeTool() {
    return createGenerateLocationsPipelineTool({
      context: context as any,
      attributesTool: mockAttributesTool as any,
      imagesTool: mockImagesTool as any,
      insertLocations: mockInsert,
    });
  }

  it("runs the full pipeline and returns LocationWithAssets on success", async () => {
    const id = generateId();
    const insertedEntity = makeEntityWithAssets(id, "Cyberpunk Bar");

    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: locAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "Cyberpunk Bar" }]);
    context.projectRepository.getEntities.mockResolvedValue([{ entity: insertedEntity, entityType: "location" }]);
    mockImagesTool.run.mockResolvedValue([
      { success: true, id, output: "gs://img", entity: { ...insertedEntity, assets: { image: "gs://img" } } },
    ]);

    const results = await makeTool().run({
      locations: [{ id }] as any,
      generationRules: [],
      attempt: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) expect(results[0].location.id).toBe(id);
  });

  it("publishes ENTITY_CREATED with entityType 'location'", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: locAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "Cyberpunk Bar" }]);
    context.projectRepository.getEntities.mockResolvedValue([
      { entity: makeEntityWithAssets(id, "Cyberpunk Bar"), entityType: "location" },
    ]);
    mockImagesTool.run.mockResolvedValue([]);

    await makeTool().run({ locations: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(context.publishPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ENTITY_CREATED",
        payload: expect.arrayContaining([expect.objectContaining({ entityType: "location" })]),
      }),
    );
  });

  it("skips insert/images when all attribute generations fail", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: false, id, error: new Error("LLM failed") }]);

    await makeTool().run({ locations: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockImagesTool.run).not.toHaveBeenCalled();
  });

  it("re-throws when insertLocations fails", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: locAttr }]);
    mockInsert.mockRejectedValue(new Error("DB error"));

    await expect(makeTool().run({ locations: [{ id }] as any, generationRules: [], attempt: 1 })).rejects.toThrow(
      "DB error",
    );
  });

  it("is non-fatal when imagesTool throws, falls back to inserted entity", async () => {
    const id = generateId();
    const insertedEntity = makeEntityWithAssets(id, "Cyberpunk Bar");

    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: locAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "Cyberpunk Bar" }]);
    context.projectRepository.getEntities.mockResolvedValue([{ entity: insertedEntity, entityType: "location" }]);
    mockImagesTool.run.mockRejectedValue(new Error("Image API unavailable"));

    const results = await makeTool().run({ locations: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(results[0].success).toBe(true);
    if (results[0].success) expect(results[0].location.id).toBe(id);
  });

  it("handles partial attribute failures: only successes are inserted", async () => {
    const id1 = generateId();
    const id2 = generateId();

    mockAttributesTool.run.mockResolvedValue([
      { success: true, id: id1, output: locAttr },
      { success: false, id: id2, error: new Error("id2 failed") },
    ]);
    mockInsert.mockResolvedValue([{ id: id1, name: "Cyberpunk Bar" }]);
    context.projectRepository.getEntities.mockResolvedValue([
      { entity: makeEntityWithAssets(id1, "Cyberpunk Bar"), entityType: "location" },
    ]);
    mockImagesTool.run.mockResolvedValue([]);

    const results = await makeTool().run({
      locations: [{ id: id1 }, { id: id2 }] as any,
      generationRules: [],
      attempt: 1,
    });

    expect(results).toHaveLength(2);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => !r.success)).toHaveLength(1);
    expect(mockInsert).toHaveBeenCalledWith(expect.not.arrayContaining([expect.objectContaining({ id: id2 })]));
  });

  it("serialises _call output with location field", async () => {
    const id = generateId();
    const insertedEntity = makeEntityWithAssets(id, "Cyberpunk Bar");

    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: locAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "Cyberpunk Bar" }]);
    context.projectRepository.getEntities.mockResolvedValue([{ entity: insertedEntity, entityType: "location" }]);
    mockImagesTool.run.mockResolvedValue([]);

    const json = await makeTool()._call({ locations: [{ id }] as any, generationRules: [], attempt: 1 });
    const parsed = JSON.parse(json);

    expect(parsed.summary).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(parsed.results[0].location.id).toBe(id);
  });
});

// =============================================================================
// PROPS
// =============================================================================

describe("GeneratePropsPipelineTool", () => {
  let context: ReturnType<typeof makeContext>;
  let mockAttributesTool: { run: ReturnType<typeof vi.fn> };
  let mockImagesTool: { run: ReturnType<typeof vi.fn> };
  let mockInsert: ReturnType<typeof vi.fn>;

  const propAttr = { name: "Plasma Sword", description: "A glowing blade", version: 1 };

  beforeEach(() => {
    vi.clearAllMocks();
    context = makeContext();
    mockAttributesTool = { run: vi.fn() };
    mockImagesTool = { run: vi.fn().mockResolvedValue([]) };
    mockInsert = vi.fn();
  });

  function makeTool() {
    return createGeneratePropsPipelineTool({
      context: context as any,
      attributesTool: mockAttributesTool as any,
      imagesTool: mockImagesTool as any,
      insertProps: mockInsert,
    });
  }

  it("runs the full pipeline and returns PropWithAssets on success", async () => {
    const id = generateId();
    const insertedEntity = makeEntityWithAssets(id, "Plasma Sword");

    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: propAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "Plasma Sword" }]);
    context.projectRepository.getEntities.mockResolvedValue([{ entity: insertedEntity, entityType: "prop" }]);
    mockImagesTool.run.mockResolvedValue([
      { success: true, id, output: "gs://img", entity: { ...insertedEntity, assets: { image: "gs://img" } } },
    ]);

    const results = await makeTool().run({ props: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) expect(results[0].prop.id).toBe(id);
  });

  it("publishes ENTITY_CREATED with entityType 'prop'", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: propAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "Plasma Sword" }]);
    context.projectRepository.getEntities.mockResolvedValue([
      { entity: makeEntityWithAssets(id, "Plasma Sword"), entityType: "prop" },
    ]);
    mockImagesTool.run.mockResolvedValue([]);

    await makeTool().run({ props: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(context.publishPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ENTITY_CREATED",
        payload: expect.arrayContaining([expect.objectContaining({ entityType: "prop" })]),
      }),
    );
  });

  it("skips insert/images when all attribute generations fail", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: false, id, error: new Error("LLM failed") }]);

    await makeTool().run({ props: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockImagesTool.run).not.toHaveBeenCalled();
  });

  it("re-throws when insertProps fails", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: propAttr }]);
    mockInsert.mockRejectedValue(new Error("DB error"));

    await expect(makeTool().run({ props: [{ id }] as any, generationRules: [], attempt: 1 })).rejects.toThrow(
      "DB error",
    );
  });

  it("is non-fatal when imagesTool throws, falls back to inserted entity", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: propAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "Plasma Sword" }]);
    context.projectRepository.getEntities.mockResolvedValue([
      { entity: makeEntityWithAssets(id, "Plasma Sword"), entityType: "prop" },
    ]);
    mockImagesTool.run.mockRejectedValue(new Error("Image API unavailable"));

    const results = await makeTool().run({ props: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(results[0].success).toBe(true);
    if (results[0].success) expect(results[0].prop.id).toBe(id);
  });

  it("handles partial attribute failures: only successes are inserted", async () => {
    const id1 = generateId();
    const id2 = generateId();

    mockAttributesTool.run.mockResolvedValue([
      { success: true, id: id1, output: propAttr },
      { success: false, id: id2, error: new Error("id2 failed") },
    ]);
    mockInsert.mockResolvedValue([{ id: id1, name: "Plasma Sword" }]);
    context.projectRepository.getEntities.mockResolvedValue([
      { entity: makeEntityWithAssets(id1, "Plasma Sword"), entityType: "prop" },
    ]);
    mockImagesTool.run.mockResolvedValue([]);

    const results = await makeTool().run({
      props: [{ id: id1 }, { id: id2 }] as any,
      generationRules: [],
      attempt: 1,
    });

    expect(results).toHaveLength(2);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => !r.success)).toHaveLength(1);
  });

  it("serialises _call output with prop field", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: propAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "Plasma Sword" }]);
    context.projectRepository.getEntities.mockResolvedValue([
      { entity: makeEntityWithAssets(id, "Plasma Sword"), entityType: "prop" },
    ]);
    mockImagesTool.run.mockResolvedValue([]);

    const json = await makeTool()._call({ props: [{ id }] as any, generationRules: [], attempt: 1 });
    const parsed = JSON.parse(json);

    expect(parsed.summary).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(parsed.results[0].prop.id).toBe(id);
  });
});

// =============================================================================
// SCENES
// =============================================================================

describe("GenerateScenesPipelineTool", () => {
  let context: ReturnType<typeof makeContext>;
  let mockAttributesTool: { run: ReturnType<typeof vi.fn> };
  let mockImagesTool: { run: ReturnType<typeof vi.fn> };
  let mockInsert: ReturnType<typeof vi.fn>;

  const sceneAttr = {
    name: "The Escape",
    description: "A thrilling escape",
    sceneIndex: 0,
    version: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    context = makeContext();
    mockAttributesTool = { run: vi.fn() };
    mockImagesTool = { run: vi.fn().mockResolvedValue([]) };
    mockInsert = vi.fn();
  });

  function makeTool() {
    return createGenerateScenesPipelineTool({
      context: context as any,
      attributesTool: mockAttributesTool as any,
      imagesTool: mockImagesTool as any,
      insertScenes: mockInsert,
    });
  }

  it("runs the full pipeline and returns SceneWithAssets on success", async () => {
    const id = generateId();
    const insertedEntity = makeEntityWithAssets(id, "The Escape", { sceneIndex: 0 });

    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: sceneAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "The Escape" }]);
    context.projectRepository.getEntities.mockResolvedValue([{ entity: insertedEntity, entityType: "scene" }]);
    mockImagesTool.run.mockResolvedValue([
      { success: true, id, output: "gs://img", entity: { ...insertedEntity, assets: { image: "gs://img" } } },
    ]);

    const results = await makeTool().run({ scenes: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) expect(results[0].scene.id).toBe(id);
  });

  it("publishes ENTITY_CREATED with entityType 'scene'", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: sceneAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "The Escape" }]);
    context.projectRepository.getEntities.mockResolvedValue([
      { entity: makeEntityWithAssets(id, "The Escape"), entityType: "scene" },
    ]);
    mockImagesTool.run.mockResolvedValue([]);

    await makeTool().run({ scenes: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(context.publishPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ENTITY_CREATED",
        payload: expect.arrayContaining([expect.objectContaining({ entityType: "scene" })]),
      }),
    );
  });

  it("skips insert/images when all attribute generations fail", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: false, id, error: new Error("LLM failed") }]);

    await makeTool().run({ scenes: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockImagesTool.run).not.toHaveBeenCalled();
  });

  it("re-throws when insertScenes fails", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: sceneAttr }]);
    mockInsert.mockRejectedValue(new Error("DB error"));

    await expect(makeTool().run({ scenes: [{ id }] as any, generationRules: [], attempt: 1 })).rejects.toThrow(
      "DB error",
    );
  });

  it("is non-fatal when imagesTool throws, falls back to inserted entity", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: sceneAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "The Escape" }]);
    context.projectRepository.getEntities.mockResolvedValue([
      { entity: makeEntityWithAssets(id, "The Escape"), entityType: "scene" },
    ]);
    mockImagesTool.run.mockRejectedValue(new Error("Image API unavailable"));

    const results = await makeTool().run({ scenes: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(results[0].success).toBe(true);
    if (results[0].success) expect(results[0].scene.id).toBe(id);
  });

  it("handles partial attribute failures: only successes are inserted", async () => {
    const id1 = generateId();
    const id2 = generateId();

    mockAttributesTool.run.mockResolvedValue([
      { success: true, id: id1, output: sceneAttr },
      { success: false, id: id2, error: new Error("id2 failed") },
    ]);
    mockInsert.mockResolvedValue([{ id: id1, name: "The Escape" }]);
    context.projectRepository.getEntities.mockResolvedValue([
      { entity: makeEntityWithAssets(id1, "The Escape"), entityType: "scene" },
    ]);
    mockImagesTool.run.mockResolvedValue([]);

    const results = await makeTool().run({
      scenes: [{ id: id1 }, { id: id2 }] as any,
      generationRules: [],
      attempt: 1,
    });

    expect(results).toHaveLength(2);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => !r.success)).toHaveLength(1);
    expect(mockInsert).toHaveBeenCalledWith(expect.not.arrayContaining([expect.objectContaining({ id: id2 })]));
  });

  it("imagesTool receives the correct version from attribute output", async () => {
    const id = generateId();
    const attrWithVersion = { ...sceneAttr, version: 7 };
    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: attrWithVersion }]);
    mockInsert.mockResolvedValue([{ id, name: "The Escape" }]);
    context.projectRepository.getEntities.mockResolvedValue([
      { entity: makeEntityWithAssets(id, "The Escape"), entityType: "scene" },
    ]);
    mockImagesTool.run.mockResolvedValue([]);

    await makeTool().run({ scenes: [{ id }] as any, generationRules: [], attempt: 1 });

    expect(mockImagesTool.run).toHaveBeenCalledWith(
      expect.objectContaining({
        scenes: expect.arrayContaining([expect.objectContaining({ id, version: 7 })]),
      }),
    );
  });

  it("serialises _call output with scene field", async () => {
    const id = generateId();
    mockAttributesTool.run.mockResolvedValue([{ success: true, id, output: sceneAttr }]);
    mockInsert.mockResolvedValue([{ id, name: "The Escape" }]);
    context.projectRepository.getEntities.mockResolvedValue([
      { entity: makeEntityWithAssets(id, "The Escape"), entityType: "scene" },
    ]);
    mockImagesTool.run.mockResolvedValue([]);

    const json = await makeTool()._call({ scenes: [{ id }] as any, generationRules: [], attempt: 1 });
    const parsed = JSON.parse(json);

    expect(parsed.summary).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(parsed.results[0].scene.id).toBe(id);
  });
});
