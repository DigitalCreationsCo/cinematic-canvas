import { createMockToolContext } from "#shared/mocks/mock-tools.ts";
import { createMockLocation } from "#shared/mocks/mock-location.js";

import { createGenerateLocationImagesTool } from "#shared/lm/tools/locations/generate-locations-images.tool.js";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getExecutionMode } from "#shared/config.js";

vi.mock("#shared/config.js", () => ({
  getExecutionMode: vi.fn(),
  imageMimeType: "image/png",
  aspectRatios: {
    widescreen: { aspectRatio: "16:9" },
    vertical: { aspectRatio: "9:16" },
  },
}));

describe("generateLocationImages - Output Order Preservation", () => {
  let mockProvider: any;
  let mockContext = createMockToolContext({
    projectId: "test-project",
    traceId: "test-trace",
    provider: mockProvider,
    options: { signal: undefined },
    safetyRetries: 3,
    incrementAttempt: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      generateImages: vi.fn(),
      generateBatchImages: vi.fn(),
      imageModel: "gemini-2.5-flash-image",
    };

    mockContext = createMockToolContext({
      projectId: "test-project",
      traceId: "test-trace",
      provider: mockProvider,
      options: { signal: undefined },
      safetyRetries: 3,
      incrementAttempt: vi.fn(),
    });

    // Default: getEntities returns empty (no ENTITY_UPDATED emission)
    mockContext.projectRepository.getEntities.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("BATCH mode - order preservation", () => {
    it("should return results in same order as input in BATCH mode", async () => {
      vi.stubEnv("EXECUTION_MODE", "BATCH");
      vi.mocked(getExecutionMode).mockReturnValue("BATCH");

      const inputLocations = [
        createMockLocation({ id: "loc-1", name: "Forest" }),
        createMockLocation({ id: "loc-2", name: "Castle" }),
        createMockLocation({ id: "loc-3", name: "Village" }),
      ];

      mockProvider.generateBatchImages.mockResolvedValue([
        { customId: "loc-3", status: "SUCCESS", imageBytes: "abc123" },
        { customId: "loc-1", status: "SUCCESS", imageBytes: "def456" },
        { customId: "loc-2", status: "SUCCESS", imageBytes: "ghi789" },
      ]);

      const results = await createGenerateLocationImagesTool({ context: mockContext }).run({
        locations: inputLocations as any,
        generationRules: [],
        attempt: 1,
      });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe("loc-1");
      expect(results[1].id).toBe("loc-2");
      expect(results[2].id).toBe("loc-3");
    });

    it("should preserve order when batch has failures", async () => {
      vi.mocked(getExecutionMode).mockReturnValue("BATCH");

      const inputLocations = [
        createMockLocation({ id: "loc-1", name: "Forest" }),
        createMockLocation({ id: "loc-2", name: "Castle" }),
        createMockLocation({ id: "loc-3", name: "Village" }),
      ];

      mockProvider.generateBatchImages.mockResolvedValue([
        { customId: "loc-2", status: "SUCCESS", imageBytes: "abc123" },
        { customId: "loc-3", status: "FAILED", error: new Error("Generation failed") },
        { customId: "loc-1", status: "SUCCESS", imageBytes: "def456" },
      ]);

      const results = await createGenerateLocationImagesTool({ context: mockContext }).run({
        locations: inputLocations as any,
        generationRules: [],
        attempt: 1,
      });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe("loc-1");
      expect(results[1].id).toBe("loc-2");
      expect(results[2].id).toBe("loc-3");
    });
  });

  describe("PARALLEL mode - order preservation", () => {
    it("should return results in same order as input in PARALLEL mode", async () => {
      vi.mocked(getExecutionMode).mockReturnValue("PARALLEL");

      const inputLocations = [
        createMockLocation({ id: "loc-1", name: "Forest" }),
        createMockLocation({ id: "loc-2", name: "Castle" }),
        createMockLocation({ id: "loc-3", name: "Village" }),
      ];

      mockProvider.generateImages.mockImplementation(() =>
        Promise.resolve({ generatedImages: [{ image: { imageBytes: "test" } }] }),
      );

      const results = await createGenerateLocationImagesTool({ context: mockContext }).run({
        locations: inputLocations as any,
        generationRules: [],
        attempt: 1,
      });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe("loc-1");
      expect(results[1].id).toBe("loc-2");
      expect(results[2].id).toBe("loc-3");
    });
  });

  describe("SEQUENTIAL mode - order preservation", () => {
    it("should return results in same order as input in SEQUENTIAL mode", async () => {
      vi.mocked(getExecutionMode).mockReturnValue("SEQUENTIAL");

      const inputLocations = [
        createMockLocation({ id: "loc-1", name: "Forest" }),
        createMockLocation({ id: "loc-2", name: "Castle" }),
        createMockLocation({ id: "loc-3", name: "Village" }),
      ];

      mockProvider.generateImages.mockImplementation(() =>
        Promise.resolve({ generatedImages: [{ image: { imageBytes: "test" } }] }),
      );

      const results = await createGenerateLocationImagesTool({ context: mockContext }).run({
        locations: inputLocations as any,
        generationRules: [],
        attempt: 1,
      });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe("loc-1");
      expect(results[1].id).toBe("loc-2");
      expect(results[2].id).toBe("loc-3");
    });
  });
});
