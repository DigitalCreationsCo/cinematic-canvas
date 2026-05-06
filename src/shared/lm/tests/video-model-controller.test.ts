import "#shared/mocks/mock-google-provider.ts";

import { describe, it, expect, vi, beforeEach, Mocked } from "vitest";
import { GoogleProvider } from "#shared/lm/google/provider.ts";

describe("VideoModelController Full Coverage Suite", () => {
  let mockProvider: Mocked<GoogleProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockProvider = new GoogleProvider();
  });

  describe("Priority Mode: Quality", () => {
    it("should return to model index 0 after success in quality mode", async () => {
      vi.stubEnv("VIDEO_MODEL_NAMES", "veo-2.0-generate-exp,veo-1.0-generate");
      const { VideoModelController } = await import("#shared/lm/video-model-controller.js");

      const ctrl = new VideoModelController("google", "quality");
      (ctrl as any).provider = mockProvider;

      mockProvider.generateVideos.mockRejectedValueOnce(new Error("Fail 0")).mockResolvedValue({ status: "ok" });

      expect(ctrl.model).toBe("veo-2.0-generate-exp");
      await expect(ctrl.generateVideos({ prompt: "t" })).rejects.toThrow();
      expect(ctrl.model).toBe("veo-1.0-generate");

      await ctrl.generateVideos({ prompt: "t" });
      expect(ctrl.model).toBe("veo-2.0-generate-exp");
    });
  });

  describe("Priority Mode: Speed", () => {
    it("should stay on fallback index after success in speed mode", async () => {
      vi.stubEnv("VIDEO_MODEL_NAMES", "veo-2.0-generate-exp,veo-1.0-generate");
      const { VideoModelController } = await import("#shared/lm/video-model-controller.js");

      const ctrl = new VideoModelController("google", "speed");
      (ctrl as any).provider = mockProvider;

      mockProvider.generateVideos.mockRejectedValueOnce(new Error("Fail 0")).mockResolvedValue({ status: "ok" });

      expect(ctrl.model).toBe("veo-2.0-generate-exp");
      await expect(ctrl.generateVideos({ prompt: "t" })).rejects.toThrow();
      expect(ctrl.model).toBe("veo-1.0-generate");

      await ctrl.generateVideos({ prompt: "t" });
      expect(ctrl.model).toBe("veo-1.0-generate"); // Remains sticky
    });
  });

  describe("Error Handling & Wraparound", () => {
    it("should wrap around the list when errors persist", async () => {
      vi.stubEnv("VIDEO_MODEL_NAMES", "veo-2.0-generate-exp,veo-1.0-generate");
      const { VideoModelController } = await import("#shared/lm/video-model-controller.js");
      const ctrl = new VideoModelController("google", "speed");
      (ctrl as any).provider = mockProvider;
      expect(ctrl.model).toBe("veo-2.0-generate-exp");
      ctrl["provider"].generateVideos.mockRejectedValue(new Error("Permanent Failure"));

      await expect(ctrl.generateVideos({ prompt: "1" })).rejects.toThrow(); // to vid-1
      expect(ctrl.model).toBe("veo-1.0-generate");

      await expect(ctrl.generateVideos({ prompt: "2" })).rejects.toThrow(); // to vid-2
      expect(ctrl.model).toBe("veo-2.0-generate-exp");

      await expect(ctrl.generateVideos({ prompt: "3" })).rejects.toThrow(); // wrap to vid-0
      expect(ctrl.model).toBe("veo-1.0-generate");
    });
  });

  describe("Operation Passthrough", () => {
    it("should correctly delegate getVideosOperation calls", async () => {
      const { VideoModelController } = await import("#shared/lm/video-model-controller.js");
      const ctrl = new VideoModelController("google");
      (ctrl as any).provider = mockProvider;
      mockProvider.getVideosOperation.mockResolvedValue({ done: false });

      const result = await ctrl.getVideosOperation({ operationId: "123" });

      expect(result.done).toBe(false);
      expect(mockProvider.getVideosOperation).toHaveBeenCalledWith({ operationId: "123" });
    });
  });

  describe("Configuration Passthrough", () => {
    it("should provide getters for current and default models", async () => {
      const { VideoModelController } = await import("#shared/lm/video-model-controller.js");
      const ctrl = new VideoModelController("google");
      expect(ctrl.defaultModel).toBe("veo-2.0-generate-exp");
      expect(ctrl.model).toBe("veo-2.0-generate-exp");
    });
  });
});
