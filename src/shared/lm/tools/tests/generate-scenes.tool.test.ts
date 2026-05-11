import "#shared/mocks/mock-config.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGenerateScenesTool } from "#shared/lm/tools/scenes/generate-scenes.tool.js";
import { generateId } from "#shared/utils/id.ts";

// Mock generateEntityAttributes to control LLM output directly
vi.mock("#shared/lm/tools/generate-entity-attributes.js", () => ({
  generateEntityAttributes: vi.fn(),
}));

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";

describe("GenerateScenesTool", () => {
  let mockContext: any;
  let mockImagesTool: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockImagesTool = { run: vi.fn().mockResolvedValue([]) };
    mockContext = {
      projectId: generateId(),
      worldId: "test-world",
      projectRepository: {
        getEntities: vi.fn().mockResolvedValue([]),
      },
      publishPipelineEvent: vi.fn(),
      saveAssets: vi.fn(),
      traceId: "scene-trace",
      provider: {
        textModel: "test-model",
      },
    };
  });

  // ==========================================================================
  // Full pipeline success
  // ==========================================================================

  it("should execute the full scene pipeline: generate → insert → save assets → ENTITY_CREATED → images", async () => {
    const sceneId = generateId();
    const generatedAttr = {
      sceneIndex: 0,
      name: "The Great Escape",
      description: "A thrilling escape scene",
      mood: "tense",
      shotType: "Medium Close-Up",
      cameraAngle: "Eye Level",
      cameraMovement: "Static",
      transitionType: "None",
      composition: { "Subject Placement": "Center" },
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

    const mockInsert = vi.fn().mockResolvedValue([{ id: sceneId, name: "The Great Escape" }]);
    const mockInsertedEntity = { id: sceneId, name: "The Great Escape", sceneIndex: 0, assets: {} };

    // Mock attribute generation to return success
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: sceneId, data: generatedAttr, entityType: "scene" },
    ]);

    // Mock entity fetch for ENTITY_CREATED
    mockContext.projectRepository.getEntities.mockResolvedValue([
      { entity: mockInsertedEntity, entityType: "scene" },
    ]);

    const tool = createGenerateScenesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertScenes: mockInsert,
    });

    const sceneInput = [
      {
        partial: { name: "The Great Escape", slug: "scene-1", id: sceneId },
        images: [],
      },
    ];

    const results = await tool.run({ scenes: sceneInput as any });

    // ── Assert: attributes generated ──
    expect(generateEntityAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        entityDescription: "scene specification",
      }),
      expect.anything(),
    );

    // ── Assert: insert called with generated attributes ──
    expect(mockInsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "The Great Escape" })]),
    );

    // ── Assert: saveAssets called for description ──
    expect(mockContext.saveAssets).toHaveBeenCalledWith(
      { sceneIds: [sceneId], projectId: expect.any(String) },
      ["description"],
      "text",
      [generatedAttr.description],
      expect.any(Array),
      true,
    );

    // ── Assert: ENTITY_CREATED published ──
    expect(mockContext.publishPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ENTITY_CREATED",
        worldId: "test-world",
      }),
    );

    // ── Assert: images tool called with inserted refs ──
    expect(mockImagesTool.run).toHaveBeenCalledWith(
      expect.objectContaining({
        scenes: expect.arrayContaining([
          expect.objectContaining({ id: sceneId, name: "The Great Escape" }),
        ]),
      }),
    );

    // ── Assert: success result ──
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].id).toBe(sceneId);
      expect(results[0].output.name).toBe("The Great Escape");
    }
  });

  // ==========================================================================
  // All attribute generation fails
  // ==========================================================================

  it("should skip insert/assets/events/images when all attribute generations fail", async () => {
    const sceneId = generateId();
    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: false, id: sceneId, data: { id: sceneId }, entityType: "scene", error: new Error("LLM failed") },
    ]);

    const mockInsert = vi.fn();
    const tool = createGenerateScenesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertScenes: mockInsert,
    });

    const results = await tool.run({
      scenes: [{ partial: { name: "Fail Scene", id: sceneId }, images: [] }] as any,
    });

    // No insert, no assets, no events, no images
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockContext.saveAssets).not.toHaveBeenCalled();
    expect(mockContext.publishPipelineEvent).not.toHaveBeenCalled();
    expect(mockImagesTool.run).not.toHaveBeenCalled();

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    if (!results[0].success) {
      expect(results[0].error.message).toBe("LLM failed");
    }
  });

  // ==========================================================================
  // Insert throws - error propagation
  // ==========================================================================

  it("should throw when insertScenes fails, preserving attribute results", async () => {
    const sceneId = generateId();
    const generatedAttr = {
      sceneIndex: 0, name: "Fail Insert", description: "test",
      mood: "neutral", shotType: "Medium", cameraAngle: "Eye Level",
      cameraMovement: "Static", transitionType: "None", composition: {},
      startTime: 0, endTime: 5, duration: 5, type: "narrative",
      lyrics: "", musicalDescription: "", musicChange: "None",
      intensity: "medium", tempo: "moderate", audioEvidence: "",
      transientImpact: "soft", audioSync: "Mood Sync",
      lighting: { quality: { hardness: "Soft", colorTemperature: "Neutral", intensity: "Medium" } },
      characterReferenceIds: [], locationReferenceId: "", continuityNotes: [],
      version: 1,
    };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: sceneId, data: generatedAttr, entityType: "scene" },
    ]);

    const mockInsert = vi.fn().mockRejectedValue(new Error("DB constraint violation"));

    const tool = createGenerateScenesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertScenes: mockInsert,
    });

    // Expect the error to propagate
    await expect(
      tool.run({ scenes: [{ partial: { name: "Fail Insert", id: sceneId }, images: [] }] as any }),
    ).rejects.toThrow("DB constraint violation");
  });

  // ==========================================================================
  // Image generation failure is non-fatal
  // ==========================================================================

  it("should still return attribute results when imagesTool.run() throws", async () => {
    const sceneId = generateId();
    const generatedAttr = {
      sceneIndex: 0, name: "Img Fail", description: "test",
      mood: "neutral", shotType: "Medium", cameraAngle: "Eye Level",
      cameraMovement: "Static", transitionType: "None", composition: {},
      startTime: 0, endTime: 5, duration: 5, type: "narrative",
      lyrics: "", musicalDescription: "", musicChange: "None",
      intensity: "medium", tempo: "moderate", audioEvidence: "",
      transientImpact: "soft", audioSync: "Mood Sync",
      lighting: { quality: { hardness: "Soft", colorTemperature: "Neutral", intensity: "Medium" } },
      characterReferenceIds: [], locationReferenceId: "", continuityNotes: [],
      version: 1,
    };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: sceneId, data: generatedAttr, entityType: "scene" },
    ]);

    const mockInsert = vi.fn().mockResolvedValue([{ id: sceneId, name: "Img Fail" }]);
    mockImagesTool.run = vi.fn().mockRejectedValue(new Error("Image API unavailable"));
    mockContext.projectRepository.getEntities.mockResolvedValue([
      { entity: { id: sceneId, name: "Img Fail", assets: {} }, entityType: "scene" },
    ]);

    const tool = createGenerateScenesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertScenes: mockInsert,
    });

    // Should NOT throw - image failure is non-fatal
    const results = await tool.run({
      scenes: [{ partial: { name: "Img Fail", id: sceneId }, images: [] }] as any,
    });

    // Attributes and insert succeeded
    expect(mockInsert).toHaveBeenCalled();
    expect(mockContext.saveAssets).toHaveBeenCalled();
    expect(mockContext.publishPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ENTITY_CREATED" }),
    );

    // Attribute result still returned as success
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].output.name).toBe("Img Fail");
    }
  });

  // ==========================================================================
  // Partial failures - mix of success and failure
  // ==========================================================================

  it("should handle partial failures: some scenes succeed, some fail", async () => {
    const sceneId1 = generateId();
    const sceneId2 = generateId();
    const successAttr = {
      sceneIndex: 0, name: "Success Scene", description: "good",
      mood: "happy", shotType: "Medium", cameraAngle: "Eye Level",
      cameraMovement: "Static", transitionType: "None", composition: {},
      startTime: 0, endTime: 5, duration: 5, type: "narrative",
      lyrics: "", musicalDescription: "", musicChange: "None",
      intensity: "medium", tempo: "moderate", audioEvidence: "",
      transientImpact: "soft", audioSync: "Mood Sync",
      lighting: { quality: { hardness: "Soft", colorTemperature: "Neutral", intensity: "Medium" } },
      characterReferenceIds: [], locationReferenceId: "", continuityNotes: [],
      version: 1,
    };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: sceneId1, data: successAttr, entityType: "scene" },
      {
        success: false, id: sceneId2,
        data: { id: sceneId2 }, entityType: "scene",
        error: new Error("Scene 2 generation failed"),
      },
    ]);

    const mockInsert = vi.fn().mockResolvedValue([{ id: sceneId1, name: "Success Scene" }]);
    mockContext.projectRepository.getEntities.mockResolvedValue([
      { entity: { id: sceneId1, name: "Success Scene", assets: {} }, entityType: "scene" },
    ]);

    const tool = createGenerateScenesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertScenes: mockInsert,
    });

    const results = await tool.run({
      scenes: [
        { partial: { name: "Success Scene", id: sceneId1 }, images: [] },
        { partial: { name: "Fail Scene", id: sceneId2 }, images: [] },
      ] as any,
    });

    // Insert only called for the success
    expect(mockInsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "Success Scene" })]),
    );
    expect(mockInsert).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "Fail Scene" })]),
    );

    // ENTITY_CREATED only for the success
    expect(mockContext.publishPipelineEvent).toHaveBeenCalled();

    // Images tool only called with the success ref
    expect(mockImagesTool.run).toHaveBeenCalledWith(
      expect.objectContaining({
        scenes: expect.arrayContaining([expect.objectContaining({ id: sceneId1 })]),
      }),
    );

    // Results match input order
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
  });

  // ==========================================================================
  // Empty input - generateEntityAttributes returns empty array for zero items
  // ==========================================================================

  it("should handle empty scene array gracefully", async () => {
    vi.mocked(generateEntityAttributes).mockResolvedValue([]);

    const tool = createGenerateScenesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertScenes: vi.fn(),
    });

    const results = await tool.run({ scenes: [] });

    expect(results).toHaveLength(0);
    expect(mockImagesTool.run).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // _call serialisation format
  // ==========================================================================

  it("should serialise results via _call in the expected JSON format", async () => {
    const sceneId = generateId();
    const generatedAttr = {
      sceneIndex: 0, name: "Serialise Test", description: "test",
      mood: "neutral", shotType: "Medium", cameraAngle: "Eye Level",
      cameraMovement: "Static", transitionType: "None", composition: {},
      startTime: 0, endTime: 5, duration: 5, type: "narrative",
      lyrics: "", musicalDescription: "", musicChange: "None",
      intensity: "medium", tempo: "moderate", audioEvidence: "",
      transientImpact: "soft", audioSync: "Mood Sync",
      lighting: { quality: { hardness: "Soft", colorTemperature: "Neutral", intensity: "Medium" } },
      characterReferenceIds: [], locationReferenceId: "", continuityNotes: [],
      version: 1,
    };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: sceneId, data: generatedAttr, entityType: "scene" },
    ]);

    const mockInsert = vi.fn().mockResolvedValue([{ id: sceneId, name: "Serialise Test" }]);
    mockContext.projectRepository.getEntities.mockResolvedValue([
      { entity: { id: sceneId, name: "Serialise Test", assets: {} }, entityType: "scene" },
    ]);

    const tool = createGenerateScenesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertScenes: mockInsert,
    });

    const serialised = await tool._call({
      scenes: [{ partial: { name: "Serialise Test", id: sceneId }, images: [] }] as any,
    });

    const parsed = JSON.parse(serialised);
    expect(parsed).toHaveProperty("summary");
    expect(parsed.summary).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(parsed).toHaveProperty("results");
    expect(parsed.results[0].success).toBe(true);
    expect(parsed.results[0].scene.name).toBe("Serialise Test");
  });
});
