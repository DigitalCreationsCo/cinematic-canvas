import "#shared/mocks/mock-config.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGeneratePropAttributesTool } from "#shared/lm/tools/props/generate-props-attributes.tool.js";
import { generateId } from "#shared/utils/id.ts";

// Mock generateEntityAttributes to control LLM output directly
vi.mock("#shared/lm/tools/generate-entity-attributes.js", () => ({
  generateEntityAttributes: vi.fn(),
}));

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";

describe("GeneratePropAttributesTool", () => {
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

    const tool = createGeneratePropAttributesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertProps,
    });

    const results = await tool.run([{ id: propId, name: "Fail Prop" }] as any);

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
  // Partial failures - mix of success and failure
  // ==========================================================================

  it("should handle partial failures: some props succeed, some fail", async () => {
    const propId1 = generateId();
    const propId2 = generateId();
    const successAttr = {
      name: "Good Prop",
      description: "a good prop",
      type: "misc",
      referenceId: "prop_good",
      version: 1,
    };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: propId1, data: successAttr, entityType: "prop" },
      {
        success: false,
        id: propId2,
        data: { id: propId2 },
        entityType: "prop",
        error: new Error("Prop 2 failed"),
      },
    ]);

    const insertProps = vi.fn().mockResolvedValue([{ id: propId1, name: "Good Prop" }]);
    mockContext.projectRepository.getEntities.mockResolvedValue([
      { entity: { id: propId1, name: "Good Prop", assets: {} }, entityType: "prop" },
    ]);

    const tool = createGeneratePropAttributesTool({
      context: mockContext,
    });

    const results = await tool.run([
      { id: propId1, name: "Good Prop" },
      { id: propId2, name: "Bad Prop" },
    ] as any);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);

  });

  // ==========================================================================
  // Empty input - generateEntityAttributes returns empty array for zero items
  // ==========================================================================

  it("should handle empty prop array gracefully", async () => {
    vi.mocked(generateEntityAttributes).mockResolvedValue([]);

    const tool = createGeneratePropAttributesTool({
      context: mockContext,
      imagesTool: mockImagesTool,
      insertProps: vi.fn(),
    });

    const results = await tool.run([]);

    expect(results).toHaveLength(0);
    expect(mockImagesTool.run).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // _call serialisation format
  // ==========================================================================

  it("should serialise results via _call in the expected JSON format", async () => {
    const propId = generateId();
    const generatedAttr = {
      name: "Serialise Prop",
      description: "test",
      type: "misc",
      referenceId: "prop_serial",
      version: 1,
    };

    vi.mocked(generateEntityAttributes).mockResolvedValue([
      { success: true, id: propId, entity: generatedAttr, entityType: "prop" },
    ]);

    const insertProps = vi.fn().mockResolvedValue([{ id: propId, name: "Serialise Prop" }]);
    mockContext.projectRepository.getEntities.mockResolvedValue([
      { entity: { id: propId, name: "Serialise Prop", assets: {} }, entityType: "prop" },
    ]);

    const tool = createGeneratePropAttributesTool({
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
    expect(parsed.results[0].attributes.name).toBe("Serialise Prop");
  });
});
