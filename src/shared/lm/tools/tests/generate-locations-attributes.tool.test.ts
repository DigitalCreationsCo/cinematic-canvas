import "#shared/mocks/mock-config.js";
import { createMockTextModel } from "#shared/mocks/mock-model.ts";
import { mockProjectRepository } from "#shared/mocks/mock-project-repository.ts";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGenerateLocationAttributesTool } from "#shared/lm/tools/locations/generate-locations.tool.js";
import { generateId } from "#shared/utils/id.ts";

// Mock generateEntityAttributes to control LLM output directly
vi.mock("#shared/lm/tools/generate-entity-attributes.js", () => ({
  generateEntityAttributes: vi.fn(),
}));

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";

describe("GenerateLocationAttributesTool", () => {
  let mockProvider: any;
  let mockContext: any;
  let mockImagesTool: any;
  let projectId = generateId();

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = createMockTextModel();
    mockImagesTool = { run: vi.fn().mockResolvedValue([]) };

    mockContext = {
      projectId,
      worldId: "test-world",
      provider: mockProvider,
      projectRepository: mockProjectRepository,
      publishPipelineEvent: vi.fn(),
      saveAssets: vi.fn(),
      traceId: "test-trace",
    };
  });

  it("should execute the full location pipeline successfully", async () => {
    const inputLocations = [{ id: generateId(), name: "Cyberpunk Bar" }];
    const generatedAttr = { name: "Cyberpunk Bar", description: "Neon-soaked dive", version: 1 };
    const insertedRefs = [{ id: inputLocations[0].id, name: "Cyberpunk Bar" }];

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: inputLocations[0].id, data: generatedAttr },
    ]);

    const insertLocations = vi.fn().mockResolvedValue(insertedRefs);

    // 3. Mock Repository entity fetch for ENTITY_CREATED
    mockProjectRepository.getEntities.mockResolvedValue([
      { entityType: "location", entity: { ...generatedAttr, id: insertedRefs[0].id } },
    ]);

    const consoleSpy = vi.spyOn(console, "log");
    const tool = createGenerateLocationAttributesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertLocations,
    });

    const results = await tool.run({
      locations: inputLocations as any,
      generationRules: ["high quality"],
      attempt: 1,
    });

    expect(insertLocations).toHaveBeenCalledWith([expect.objectContaining({ name: "Cyberpunk Bar" })]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Inserted ${insertedRefs.length} location(s) into DB`),
    );
    expect(mockContext.saveAssets).toHaveBeenCalled();
    expect(mockContext.publishPipelineEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "ENTITY_CREATED" }));
    expect(mockImagesTool.run).toHaveBeenCalledWith(
      expect.objectContaining({
        locations: [expect.objectContaining({ id: insertedRefs[0].id })],
      }),
    );
    expect(results[0].success).toBe(true);
  });

  // ==========================================================================
  // Full pipeline success
  // ==========================================================================

  it("should execute the full location pipeline: generate → insert → save assets → ENTITY_CREATED → images", async () => {
    const locationId = generateId();
    const generatedAttr = {
      name: "Cyberpunk Bar",
      description: "Neon-soaked dive bar with holographic dancers",
      type: "interior",
      referenceId: "loc_bar",
      lightingConditions: {},
      mood: "neon-noir",
      timeOfDay: "night",
      weather: "rainy",
      colorPalette: ["neon pink", "cyan"],
      architecture: ["neon signage"],
      naturalElements: [],
      manMadeObjects: ["bar counter", "stools"],
      groundSurface: "worn tiles",
      skyOrCeiling: "low ceiling with neon strips",
      state: { mood: "neutral", timeOfDay: "night", weather: "rainy" },
      version: 1,
    };

    const insertedRef = { id: locationId, name: "Cyberpunk Bar" };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: locationId, data: generatedAttr, entityType: "location" },
    ]);

    const insertLocations = vi.fn().mockResolvedValue([insertedRef]);
    mockProjectRepository.getEntities.mockResolvedValue([
      { entity: { ...generatedAttr, id: locationId, assets: {} }, entityType: "location" },
    ]);

    const tool = createGenerateLocationAttributesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertLocations,
    });

    const results = await tool.run({
      locations: [{ id: locationId, name: "Cyberpunk Bar" }] as any,
      generationRules: ["high quality"],
      attempt: 1,
    });

    // ── Assert: attributes generated ──
    expect(generateEntityAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ entityDescription: "location profile" }),
      expect.anything(),
    );

    // ── Assert: insert called with generated attributes ──
    expect(insertLocations).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "Cyberpunk Bar" })]),
    );

    // ── Assert: saveAssets called for description ──
    // Note: metadata is empty because generateEntityAttributes does not capture LLM metadata
    expect(mockContext.saveAssets).toHaveBeenCalledWith(
      { locationIds: [locationId], projectId: expect.any(String) },
      ["description"],
      "text",
      [generatedAttr.description],
      [],
      true,
    );

    // ── Assert: ENTITY_CREATED published ──
    expect(mockContext.publishPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ENTITY_CREATED",
        worldId: "test-world",
      }),
    );

    // ── Assert: images tool called with inserted refs and correct version ──
    expect(mockImagesTool.run).toHaveBeenCalledWith(
      expect.objectContaining({
        locations: expect.arrayContaining([
          expect.objectContaining({ id: locationId, name: "Cyberpunk Bar", version: 1 }),
        ]),
        generationRules: ["high quality"],
        attempt: 1,
      }),
    );

    // ── Assert: success result ──
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].id).toBe(locationId);
      expect(results[0].output.name).toBe("Cyberpunk Bar");
    }
  });

  // ==========================================================================
  // All attribute generation fails
  // ==========================================================================

  it("should skip insert/assets/events/images when all attribute generations fail", async () => {
    const locationId = generateId();

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      {
        success: false,
        id: locationId,
        data: { id: locationId },
        entityType: "location",
        error: new Error("LLM attribute generation failed"),
      },
    ]);

    const insertLocations = vi.fn();

    const tool = createGenerateLocationAttributesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertLocations,
    });

    const results = await tool.run({
      locations: [{ id: locationId, name: "Fail Loc" }] as any,
    });

    expect(insertLocations).not.toHaveBeenCalled();
    expect(mockContext.saveAssets).not.toHaveBeenCalled();
    expect(mockContext.publishPipelineEvent).not.toHaveBeenCalled();
    expect(mockImagesTool.run).not.toHaveBeenCalled();

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    if (!results[0].success) {
      expect(results[0].error.message).toBe("LLM attribute generation failed");
    }
  });

  // ==========================================================================
  // Insert throws - error propagation
  // ==========================================================================

  it("should throw when insertLocations fails", async () => {
    const locationId = generateId();
    const generatedAttr = {
      name: "Fail Insert",
      description: "test",
      type: "exterior",
      referenceId: "loc_fail",
      lightingConditions: {},
      mood: "neutral",
      timeOfDay: "day",
      weather: "clear",
      colorPalette: [],
      architecture: [],
      naturalElements: [],
      manMadeObjects: [],
      groundSurface: "",
      skyOrCeiling: "",
      state: {},
      version: 1,
    };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: locationId, data: generatedAttr, entityType: "location" },
    ]);

    const insertLocations = vi.fn().mockRejectedValue(new Error("DB constraint violation"));

    const tool = createGenerateLocationAttributesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertLocations,
    });

    await expect(tool.run({ locations: [{ id: locationId, name: "Fail Insert" }] as any })).rejects.toThrow(
      "DB constraint violation",
    );
  });

  // ==========================================================================
  // Image generation failure is non-fatal
  // ==========================================================================

  it("should still return attribute results when imagesTool.run() throws", async () => {
    const locationId = generateId();
    const generatedAttr = {
      name: "Img Fail Loc",
      description: "test",
      type: "interior",
      referenceId: "loc_img_fail",
      lightingConditions: {},
      mood: "neutral",
      timeOfDay: "day",
      weather: "clear",
      colorPalette: [],
      architecture: [],
      naturalElements: [],
      manMadeObjects: [],
      groundSurface: "",
      skyOrCeiling: "",
      state: {},
      version: 1,
    };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: locationId, data: generatedAttr, entityType: "location" },
    ]);

    const insertLocations = vi.fn().mockResolvedValue([{ id: locationId, name: "Img Fail Loc" }]);
    mockImagesTool.run = vi.fn().mockRejectedValue(new Error("Image API unavailable"));
    mockProjectRepository.getEntities.mockResolvedValue([
      { entity: { id: locationId, name: "Img Fail Loc", assets: {} }, entityType: "location" },
    ]);

    const tool = createGenerateLocationAttributesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertLocations,
    });

    const results = await tool.run({
      locations: [{ id: locationId, name: "Img Fail Loc" }] as any,
    });

    // Insert and ENTITY_CREATED still happened
    expect(insertLocations).toHaveBeenCalled();
    expect(mockContext.publishPipelineEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "ENTITY_CREATED" }));

    // Attribute result is success
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].output.name).toBe("Img Fail Loc");
    }
  });

  // ==========================================================================
  // Partial failures - mix of success and failure
  // ==========================================================================

  it("should handle partial failures: some locations succeed, some fail", async () => {
    const locId1 = generateId();
    const locId2 = generateId();
    const successAttr = {
      name: "Good Location",
      description: "nice place",
      type: "exterior",
      referenceId: "loc_good",
      lightingConditions: {},
      mood: "peaceful",
      timeOfDay: "day",
      weather: "sunny",
      colorPalette: [],
      architecture: [],
      naturalElements: [],
      manMadeObjects: [],
      groundSurface: "",
      skyOrCeiling: "",
      state: {},
      version: 1,
    };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: locId1, data: successAttr, entityType: "location" },
      {
        success: false,
        id: locId2,
        data: { id: locId2 },
        entityType: "location",
        error: new Error("Location 2 failed"),
      },
    ]);

    const insertLocations = vi.fn().mockResolvedValue([{ id: locId1, name: "Good Location" }]);
    mockProjectRepository.getEntities.mockResolvedValue([
      { entity: { id: locId1, name: "Good Location", assets: {} }, entityType: "location" },
    ]);

    const tool = createGenerateLocationAttributesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertLocations,
    });

    const results = await tool.run({
      locations: [
        { id: locId1, name: "Good Location" },
        { id: locId2, name: "Bad Location" },
      ] as any,
    });

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);

    // Insert only called for success
    expect(insertLocations).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "Good Location" })]),
    );
  });

  // ==========================================================================
  // Empty input - generateEntityAttributes returns empty array for zero items
  // ==========================================================================

  it("should handle empty location array gracefully", async () => {
    vi.mocked(generateEntityAttributes).mockResolvedValue([]);

    const tool = createGenerateLocationAttributesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertLocations: vi.fn(),
    });

    const results = await tool.run({ locations: [] });

    expect(results).toHaveLength(0);
    expect(mockImagesTool.run).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // _call serialisation format
  // ==========================================================================

  it("should serialise results via _call in the expected JSON format", async () => {
    const locationId = generateId();
    const generatedAttr = {
      name: "Serialise Loc",
      description: "test",
      type: "interior",
      referenceId: "loc_serial",
      lightingConditions: {},
      mood: "neutral",
      timeOfDay: "day",
      weather: "clear",
      colorPalette: [],
      architecture: [],
      naturalElements: [],
      manMadeObjects: [],
      groundSurface: "",
      skyOrCeiling: "",
      state: {},
      version: 1,
    };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: locationId, data: generatedAttr, entityType: "location" },
    ]);

    const insertLocations = vi.fn().mockResolvedValue([{ id: locationId, name: "Serialise Loc" }]);
    mockProjectRepository.getEntities.mockResolvedValue([
      { entity: { id: locationId, name: "Serialise Loc", assets: {} }, entityType: "location" },
    ]);

    const tool = createGenerateLocationAttributesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertLocations,
    });

    const serialised = await tool._call({
      locations: [{ id: locationId, name: "Serialise Loc" }] as any,
    });

    const parsed = JSON.parse(serialised);
    expect(parsed).toHaveProperty("summary");
    expect(parsed.summary).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(parsed).toHaveProperty("results");
    expect(parsed.results[0].success).toBe(true);
    expect(parsed.results[0].location.name).toBe("Serialise Loc");
  });
});
