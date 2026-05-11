import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateImages } from "../old-generate-images.js";
import { ToolContext } from "../tools.utils.js";
import { TextModelController } from "../../text-model-controller.js";

vi.mock("#shared/config.js", () => ({
  getExecutionMode: vi.fn(),
  imageMimeType: "image/png",
  aspectRatios: {
    widescreen: { aspectRatio: "16:9" },
    vertical: { aspectRatio: "9:16" },
  },
}));

const { getExecutionMode, imageMimeType } = await import("#shared/config.js");

describe("generateImages - Output Order Preservation", () => {
  let mockProvider: any;
  let mockContext: ToolContext<TextModelController>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      generateImages: vi.fn(),
      generateBatchImages: vi.fn(),
      imageModel: "gemini-2.5-flash-image",
    };

    mockContext = {
      projectId: "test-project",
      traceId: "test-trace",
      provider: mockProvider,
      options: { signal: undefined },
      storageManager: {
        getObjectPath: vi.fn((params: any) => `gs://bucket/${params.type}/${params.sceneId}/v${params.version}`),
        uploadBuffer: vi.fn((buffer, path) => Promise.resolve(path)),
      },
    } as unknown as ToolContext<TextModelController>;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const createRequest = (id: string, index: number) => ({
    id,
    prompt: `Generate image ${index}`,
    aspectRatio: "16:9",
    startingVersion: 1,
    buildPath: (version: number) => ({
      type: "scene_start_frame" as const,
      projectId: "test-project",
      sceneId: id,
      version,
    }),
  });

  describe("BATCH mode - order preservation", () => {
    it("should return results in same order as input in BATCH mode", async () => {
      vi.mocked(getExecutionMode).mockReturnValue("BATCH");

      const inputRequests = [createRequest("img-1", 1), createRequest("img-2", 2), createRequest("img-3", 3)];

      mockProvider.generateBatchImages.mockResolvedValue([
        { customId: "img-3", status: "SUCCESS", imageBytes: "abc123" },
        { customId: "img-1", status: "SUCCESS", imageBytes: "def456" },
        { customId: "img-2", status: "SUCCESS", imageBytes: "ghi789" },
      ]);

      const results = await generateImages(inputRequests, mockContext);

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe("img-1");
      expect(results[1].id).toBe("img-2");
      expect(results[2].id).toBe("img-3");
    });
  });

  describe("PARALLEL mode - order preservation", () => {
    it("should return results in same order as input in PARALLEL mode", async () => {
      vi.mocked(getExecutionMode).mockReturnValue("PARALLEL");

      const inputRequests = [createRequest("img-1", 1), createRequest("img-2", 2), createRequest("img-3", 3)];

      mockProvider.generateImages.mockImplementation(() =>
        Promise.resolve({ generatedImages: [{ image: { imageBytes: "test" } }] }),
      );

      const results = await generateImages(inputRequests, mockContext);

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe("img-1");
      expect(results[1].id).toBe("img-2");
      expect(results[2].id).toBe("img-3");
    });
  });

  describe("SEQUENTIAL mode - order preservation", () => {
    it("should return results in same order as input in SEQUENTIAL mode", async () => {
      vi.mocked(getExecutionMode).mockReturnValue("SEQUENTIAL");

      const inputRequests = [createRequest("img-1", 1), createRequest("img-2", 2), createRequest("img-3", 3)];

      mockProvider.generateImages.mockImplementation(() =>
        Promise.resolve({ generatedImages: [{ image: { imageBytes: "test" } }] }),
      );

      const results = await generateImages(inputRequests, mockContext);

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe("img-1");
      expect(results[1].id).toBe("img-2");
      expect(results[2].id).toBe("img-3");
    });
  });
});
