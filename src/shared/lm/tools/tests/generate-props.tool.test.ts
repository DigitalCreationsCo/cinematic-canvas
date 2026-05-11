import "#shared/mocks/mock-config.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGeneratePropsTool } from "#shared/lm/tools/props/generate-props.tool.js";
import { generateId } from "#shared/utils/id.ts";

// Mock generateEntityAttributes to control LLM output directly
vi.mock("#shared/lm/tools/generate-entity-attributes.js", () => ({
  generateEntityAttributes: vi.fn(),
}));

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";

describe("GeneratePropsTool", () => {
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
      saveAssets: vi.fn(),
      publishPipelineEvent: vi.fn(),
      traceId: "prop-trace",
    };
  });

  // ==========================================================================
  // Full pipeline success
  // ==========================================================================

  it("should execute the full prop pipeline: generate → insert → save assets → ENTITY_CREATED → images", async () => {
    const propId = generateId();
    const generatedAttr = {
      name: "Plasma Sword",
      description: "A glowing energy blade that hums with power",
      type: "weapon",
      referenceId: "prop_sword",
      version: 1,
    };

    const insertedRef = { id: propId, name: "Plasma Sword" };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: propId, data: generatedAttr, entityType: "prop" },
    ]);

    const insertProps = vi.fn().mockResolvedValue([insertedRef]);
    mockContext.projectRepository.getEntities.mockResolvedValue([
      { entity: { ...generatedAttr, id: propId, assets: {} }, entityType: "prop" },
    ]);

    const tool = createGeneratePropsTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertProps,
    });

    const results = await tool.run({
      props: [{ id: propId, name: "Plasma Sword" }] as any,
      generationRules: ["glowing edges"],
      attempt: 1,
    });

    // ── Assert: attributes generated ──
    expect(generateEntityAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ entityDescription: "prop profile" }),
      expect.anything(),
    );

    // ── Assert: insert called with generated attributes ──
    expect(insertProps).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "Plasma Sword" })]),
    );

    // ── Assert: saveAssets called for description ──
    // Note: metadata is empty because generateEntityAttributes does not capture LLM metadata
    expect(mockContext.saveAssets).toHaveBeenCalledWith(
      { propIds: [propId], projectId: expect.any(String) },
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

    // ── Assert: images tool called with inserted refs ──
    expect(mockImagesTool.run).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.arrayContaining([
          expect.objectContaining({ id: propId, name: "Plasma Sword" }),
        ]),
        generationRules: ["glowing edges"],
        attempt: 1,
      }),
    );

    // ── Assert: success result ──
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].id).toBe(propId);
      expect(results[0].output.name).toBe("Plasma Sword");
    }
  });

  // ==========================================================================
  // All attribute generation fails
  // ==========================================================================

  it("should skip insert/assets/events/images when all attribute generations fail", async () => {
    const propId = generateId();

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      {
        success: false,
        id: propId,
        data: { id: propId },
        entityType: "prop",
        error: new Error("LLM attribute generation failed"),
      },
    ]);

    const insertProps = vi.fn();

    const tool = createGeneratePropsTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertProps,
    });

    const results = await tool.run({
      props: [{ id: propId, name: "Fail Prop" }] as any,
    });

    expect(insertProps).not.toHaveBeenCalled();
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

  it("should throw when insertProps fails", async () => {
    const propId = generateId();
    const generatedAttr = {
      name: "Fail Insert Prop", description: "test", type: "misc",
      referenceId: "prop_fail",
      version: 1,
    };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: propId, data: generatedAttr, entityType: "prop" },
    ]);

    const insertProps = vi.fn().mockRejectedValue(new Error("DB constraint violation"));

    const tool = createGeneratePropsTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertProps,
    });

    await expect(
      tool.run({ props: [{ id: propId, name: "Fail Insert Prop" }] as any }),
    ).rejects.toThrow("DB constraint violation");
  });

  // ==========================================================================
  // Image generation failure is non-fatal
  // ==========================================================================

  it("should still return attribute results when imagesTool.run() throws", async () => {
    const propId = generateId();
    const generatedAttr = {
      name: "Img Fail Prop", description: "test", type: "misc",
      referenceId: "prop_img_fail",
      version: 1,
    };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: propId, data: generatedAttr, entityType: "prop" },
    ]);

    const insertProps = vi.fn().mockResolvedValue([{ id: propId, name: "Img Fail Prop" }]);
    mockImagesTool.run = vi.fn().mockRejectedValue(new Error("Image API unavailable"));
    mockContext.projectRepository.getEntities.mockResolvedValue([
      { entity: { id: propId, name: "Img Fail Prop", assets: {} }, entityType: "prop" },
    ]);

    const tool = createGeneratePropsTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertProps,
    });

    const results = await tool.run({
      props: [{ id: propId, name: "Img Fail Prop" }] as any,
    });

    // Insert and ENTITY_CREATED still happened
    expect(insertProps).toHaveBeenCalled();
    expect(mockContext.publishPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ENTITY_CREATED" }),
    );

    // Attribute result is success
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].output.name).toBe("Img Fail Prop");
    }
  });

  // ==========================================================================
  // Partial failures - mix of success and failure
  // ==========================================================================

  it("should handle partial failures: some props succeed, some fail", async () => {
    const propId1 = generateId();
    const propId2 = generateId();
    const successAttr = {
      name: "Good Prop", description: "a good prop", type: "misc",
      referenceId: "prop_good",
      version: 1,
    };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: propId1, data: successAttr, entityType: "prop" },
      {
        success: false, id: propId2,
        data: { id: propId2 }, entityType: "prop",
        error: new Error("Prop 2 failed"),
      },
    ]);

    const insertProps = vi.fn().mockResolvedValue([{ id: propId1, name: "Good Prop" }]);
    mockContext.projectRepository.getEntities.mockResolvedValue([
      { entity: { id: propId1, name: "Good Prop", assets: {} }, entityType: "prop" },
    ]);

    const tool = createGeneratePropsTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertProps,
    });

    const results = await tool.run({
      props: [
        { id: propId1, name: "Good Prop" },
        { id: propId2, name: "Bad Prop" },
      ] as any,
    });

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);

    // Insert only called for success
    expect(insertProps).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "Good Prop" })]),
    );
  });

  // ==========================================================================
  // Empty input - generateEntityAttributes returns empty array for zero items
  // ==========================================================================

  it("should handle empty prop array gracefully", async () => {
    vi.mocked(generateEntityAttributes).mockResolvedValue([]);

    const tool = createGeneratePropsTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertProps: vi.fn(),
    });

    const results = await tool.run({ props: [] });

    expect(results).toHaveLength(0);
    expect(mockImagesTool.run).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // _call serialisation format
  // ==========================================================================

  it("should serialise results via _call in the expected JSON format", async () => {
    const propId = generateId();
    const generatedAttr = {
      name: "Serialise Prop", description: "test", type: "misc",
      referenceId: "prop_serial",
      version: 1,
    };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: propId, data: generatedAttr, entityType: "prop" },
    ]);

    const insertProps = vi.fn().mockResolvedValue([{ id: propId, name: "Serialise Prop" }]);
    mockContext.projectRepository.getEntities.mockResolvedValue([
      { entity: { id: propId, name: "Serialise Prop", assets: {} }, entityType: "prop" },
    ]);

    const tool = createGeneratePropsTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertProps,
    });

    const serialised = await tool._call({
      props: [{ id: propId, name: "Serialise Prop" }] as any,
    });

    const parsed = JSON.parse(serialised);
    expect(parsed).toHaveProperty("summary");
    expect(parsed.summary).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(parsed).toHaveProperty("results");
    expect(parsed.results[0].success).toBe(true);
    expect(parsed.results[0].prop.name).toBe("Serialise Prop");
  });

});
