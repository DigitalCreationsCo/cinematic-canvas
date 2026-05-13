import "#shared/mocks/mock-config.js";
import { createMockTextModel } from "#shared/mocks/mock-model.js";
import { createMockToolContext } from "#shared/mocks/mock-tools.js";

vi.mock("#shared/lm/tools/tools.utils.js", () => ({
  filterDefined: vi.fn((obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))),
}));

vi.mock("#shared/utils/utils.js", () => ({
  getModelCompatibleSchema: vi.fn((schema) => schema),
}));

vi.mock("#shared/lm/tools/generate-entity-attributes.js", () => ({
  generateEntityAttributes: vi.fn(),
}));

import { describe, it, expect, vi, beforeEach, afterEach, Mocked } from "vitest";
import { z } from "zod";
import type { ToolContext } from "#shared/lm/tools/tools.utils.js";
import type { TextModelController } from "#shared/lm/text-model-controller.js";
import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { generateId } from "#shared/utils/id.ts";
import { createGenerateCharacterAttributesTool } from "#shared/lm/tools/characters/generate-characters-attributes.tool.js";
import { createGenerateLocationAttributesTool } from "#shared/lm/tools/locations/generate-locations-attributes.tool.js";
import { createGeneratePropAttributesTool } from "#shared/lm/tools/props/generate-props-attributes.tool.js";
import { createGenerateSceneAttributesTool } from "#shared/lm/tools/scenes/generate-scenes-attributes.tool.js";

describe("generateEntityAttributes - Output Order Preservation", () => {
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
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("SEQUENTIAL mode - order preservation", () => {
    it("should return results in same order as input in SEQUENTIAL mode", async () => {
      const inputEntities = [
        { id: "entity-1", name: "Alice" },
        { id: "entity-2", name: "Bob" },
        { id: "entity-3", name: "Charlie" },
      ];
      mockProvider.generateContent.mockResolvedValue({
        text: '{ "id": "test", "name": "test" }',
      } as any);

      const results = await generateEntityAttributes(
        {
          schema: testSchema,
          entities: inputEntities.map((e) => ({
            entity: { id: e.id, name: e.name },
            entityType: "character" as const,
          })),
          entityDescription: "character",
        },
        mockContext,
      );

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe("entity-1");
      expect(results[1].id).toBe("entity-2");
      expect(results[2].id).toBe("entity-3");
    });
  });
});

/**
 * generate-attributes.tool.test.ts
 *
 * Tests for the four entity attribute tools (characters, locations, props,
 * scenes). Each tool's only job after the pipeline extraction is to delegate
 * to generateEntityAttributes and pass results through. No insert, no images,
 * no events — those live in the pipeline tests.
 */



// ── Minimal context — no projectRepository, no imagesTool, no insertCallback ──

function makeLeanContext(overrides: Record<string, unknown> = {}) {
  return {
    projectId: generateId(),
    worldId: "test-world",
    traceId: "attr-trace",
    provider: createMockTextModel(),
    ...overrides,
  };
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const characterAttr = {
  name: "Alice",
  description: "A brave hero",
  age: 30,
  gender: "female",
  role: "protagonist",
  version: 1,
};

const locationAttr = {
  name: "Cyberpunk Bar",
  description: "Neon-soaked dive",
  type: "interior",
  referenceId: "loc_bar",
  lightingConditions: {},
  mood: "neon-noir",
  timeOfDay: "night",
  weather: "rainy",
  colorPalette: ["neon pink"],
  architecture: [],
  naturalElements: [],
  manMadeObjects: ["bar counter"],
  groundSurface: "worn tiles",
  skyOrCeiling: "low ceiling",
  state: {},
  version: 1,
};

const propAttr = {
  name: "Plasma Sword",
  description: "A glowing energy blade",
  type: "weapon",
  referenceId: "prop_sword",
  version: 1,
};

const sceneAttr = {
  sceneIndex: 0,
  name: "The Escape",
  description: "A thrilling escape",
  mood: "tense",
  shotType: "Medium Close-Up",
  cameraAngle: "Eye Level",
  cameraMovement: "Static",
  transitionType: "None",
  composition: {},
  startTime: 0,
  endTime: 5,
  duration: 5,
  type: "narrative",
  lyrics: "",
  musicalDescription: "",
  musicChange: "None",
  intensity: "high",
  tempo: "fast",
  audioEvidence: "",
  transientImpact: "sharp",
  audioSync: "Mood Sync",
  lighting: { quality: { hardness: "Soft", colorTemperature: "Neutral", intensity: "Medium" } },
  characterReferenceIds: [],
  locationReferenceId: "loc_test",
  continuityNotes: [],
  version: 1,
};

// =============================================================================
// CHARACTERS
// =============================================================================

describe("GenerateCharacterAttributesTool", () => {
  let context: ReturnType<typeof makeLeanContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    context = makeLeanContext();
  });

  it("calls generateEntityAttributes with entityDescription 'character profile'", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id, entity: characterAttr }, // was `data:` — tools destructure `entity`
    ]);

    const tool = createGenerateCharacterAttributesTool({ context });
    await tool.run([{ id }] as any); // was `{ characters: [{ id }] }` — run() takes a plain array

    expect(generateEntityAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ entityDescription: "character profile" }),
      expect.anything(),
    );
  });

  it("returns success results from generateEntityAttributes unchanged", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id, entity: characterAttr }, // was `data:`
    ]);

    const tool = createGenerateCharacterAttributesTool({ context });
    const results = await tool.run([{ id }] as any); // was `{ characters: [{ id }] }`

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].id).toBe(id);
      expect(results[0].attributes.name).toBe("Alice"); // was `output.name` — tool returns `attributes`
    }
  });

  it("returns failure results from generateEntityAttributes unchanged", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: false, id, error: new Error("LLM failed") }, // removed unused `data` / `entityType`
    ]);

    const tool = createGenerateCharacterAttributesTool({ context });
    const results = await tool.run([{ id }] as any); // was `{ characters: [{ id }] }`

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    if (!results[0].success) {
      expect(results[0].id).toBe(id);
      expect(results[0].error.message).toBe("LLM failed");
    }
  });

  it("handles empty input without calling any side effects", async () => {
    vi.mocked(generateEntityAttributes).mockResolvedValue([]);

    const tool = createGenerateCharacterAttributesTool({ context });
    const results = await tool.run([]);

    expect(results).toHaveLength(0);
    expect(generateEntityAttributes).toHaveBeenCalledWith(expect.objectContaining({ entities: [] }), expect.anything());
  });

  it("handles partial failures: maps success and failure results independently", async () => {
    const id1 = generateId();
    const id2 = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: id1, entity: characterAttr }, // was `data:`
      { success: false, id: id2, error: new Error("id2 failed") }, // removed unused `data` / `entityType`
    ]);

    const tool = createGenerateCharacterAttributesTool({ context });
    const results = await tool.run([{ id: id1 }, { id: id2 }] as any); // was `{ characters: [...] }`

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
  });

  it("serialises _call output in the expected JSON format", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id, entity: characterAttr }, // was `data:`
    ]);

    const tool = createGenerateCharacterAttributesTool({ context });
    const json = await tool._call({ characters: [{ id }] as any });
    const parsed = JSON.parse(json);

    expect(parsed.summary).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(parsed.results[0].success).toBe(true);
    expect(parsed.results[0].attributes.name).toBe("Alice"); // was `character.name` — serialiser emits `attributes` key
  });
});

// =============================================================================
// LOCATIONS
// =============================================================================

describe("GenerateLocationAttributesTool", () => {
  let context: ReturnType<typeof makeLeanContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    context = makeLeanContext();
  });

  it("calls generateEntityAttributes with entityDescription 'location profile'", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id, entity: locationAttr }, // was `data:`
    ]);

    const tool = createGenerateLocationAttributesTool({ context });
    await tool.run([{ id }] as any); // was `{ locations: [{ id }] }`

    expect(generateEntityAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ entityDescription: "location profile" }),
      expect.anything(),
    );
  });

  it("returns success results from generateEntityAttributes unchanged", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id, entity: locationAttr }, // was `data:`
    ]);

    const tool = createGenerateLocationAttributesTool({ context });
    const results = await tool.run([{ id }] as any); // was `{ locations: [{ id }] }`

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].id).toBe(id);
      expect(results[0].attributes.name).toBe("Cyberpunk Bar"); // was `output.name`
    }
  });

  it("returns failure results from generateEntityAttributes unchanged", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: false, id, error: new Error("LLM failed") }, // removed unused `data` / `entityType`
    ]);

    const tool = createGenerateLocationAttributesTool({ context });
    const results = await tool.run([{ id }] as any); // was `{ locations: [{ id }] }`

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    if (!results[0].success) {
      expect(results[0].error.message).toBe("LLM failed");
    }
  });

  it("handles empty input", async () => {
    vi.mocked(generateEntityAttributes).mockResolvedValue([]);

    const tool = createGenerateLocationAttributesTool({ context });
    const results = await tool.run([]);

    expect(results).toHaveLength(0);
  });

  it("serialises _call output in the expected JSON format", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id, entity: locationAttr }, // was `data:`
    ]);

    const tool = createGenerateLocationAttributesTool({ context });
    const json = await tool._call({ locations: [{ id }] as any });
    const parsed = JSON.parse(json);

    expect(parsed.summary).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(parsed.results[0].success).toBe(true);
    expect(parsed.results[0].attributes.name).toBe("Cyberpunk Bar");
  });
});

// =============================================================================
// PROPS
// =============================================================================

describe("GeneratePropAttributesTool", () => {
  let context: ReturnType<typeof makeLeanContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    context = makeLeanContext();
  });

  it("calls generateEntityAttributes with entityDescription 'prop profile'", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id, entity: propAttr }, // was `data:`
    ]);

    const tool = createGeneratePropAttributesTool({ context });
    await tool.run([{ id }] as any); // was `{ props: [{ id }] }`

    expect(generateEntityAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ entityDescription: "prop profile" }),
      expect.anything(),
    );
  });

  it("returns success results from generateEntityAttributes unchanged", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id, entity: propAttr }, // was `data:`
    ]);

    const tool = createGeneratePropAttributesTool({ context });
    const results = await tool.run([{ id }] as any); // was `{ props: [{ id }] }`

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].id).toBe(id);
      expect(results[0].attributes.name).toBe("Plasma Sword"); // was `output.name`
    }
  });

  it("returns failure results from generateEntityAttributes unchanged", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: false, id, error: new Error("LLM failed") }, // removed unused `data` / `entityType`
    ]);

    const tool = createGeneratePropAttributesTool({ context });
    const results = await tool.run([{ id }] as any); // was `{ props: [{ id }] }`

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    if (!results[0].success) {
      expect(results[0].error.message).toBe("LLM failed");
    }
  });

  it("handles empty input", async () => {
    vi.mocked(generateEntityAttributes).mockResolvedValue([]);

    const tool = createGeneratePropAttributesTool({ context });
    const results = await tool.run([]); // was `{ props: [] }`

    expect(results).toHaveLength(0);
  });

  it("serialises _call output in the expected JSON format", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id, entity: propAttr }, // was `data:`
    ]);

    const tool = createGeneratePropAttributesTool({ context });
    const json = await tool._call({ props: [{ id }] as any });
    const parsed = JSON.parse(json);

    expect(parsed.summary).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(parsed.results[0].success).toBe(true);
    expect(parsed.results[0].attributes.name).toBe("Plasma Sword");
  });
});

// =============================================================================
// SCENES
// =============================================================================

describe("GenerateSceneAttributesTool", () => {
  let context: ReturnType<typeof makeLeanContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    context = makeLeanContext();
  });

  it("calls generateEntityAttributes with entityDescription 'scene specification'", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id, entity: sceneAttr }, // was `data:`
    ]);

    const tool = createGenerateSceneAttributesTool({ context });
    await tool.run([{ id }] as any); // was `{ scenes: [{ partial: { id }, images: [] }] }` — run() takes a plain array

    expect(generateEntityAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ entityDescription: "scene specification" }),
      expect.anything(),
    );
  });

  it("returns success results from generateEntityAttributes unchanged", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id, entity: sceneAttr }, // was `data:`
    ]);

    const tool = createGenerateSceneAttributesTool({ context });
    const results = await tool.run([{ id }] as any); // was `{ scenes: [...] }`

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].id).toBe(id);
      expect(results[0].attributes.name).toBe("The Escape"); // was `output.name`
    }
  });

  it("returns failure results from generateEntityAttributes unchanged", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: false, id, error: new Error("LLM failed") }, // removed unused `data` / `entityType`
    ]);

    const tool = createGenerateSceneAttributesTool({ context });
    const results = await tool.run([{ id }] as any); // was `{ scenes: [...] }`

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    if (!results[0].success) {
      expect(results[0].error.message).toBe("LLM failed");
    }
  });

  it("handles empty input", async () => {
    vi.mocked(generateEntityAttributes).mockResolvedValue([]);

    const tool = createGenerateSceneAttributesTool({ context });
    const results = await tool.run([]); // was `{ scenes: [] }`

    expect(results).toHaveLength(0);
  });

  it("serialises _call output in the expected JSON format", async () => {
    const id = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id, entity: sceneAttr }, // was `data:`
    ]);

    const tool = createGenerateSceneAttributesTool({ context });
    const json = await tool._call({ scenes: [{ id }] as any }); // _call takes the schema object — correct
    const parsed = JSON.parse(json);

    expect(parsed.summary).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(parsed.results[0].success).toBe(true);
    expect(parsed.results[0].attributes.name).toBe("The Escape"); // `scene` key is correct per serialiser
  });
});