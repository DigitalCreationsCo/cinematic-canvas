import "#shared/mocks/mock-google-provider.ts";

import { describe, it, expect, vi, beforeEach, Mocked } from "vitest";
import { GoogleProvider } from "#shared/lm/google/provider.ts";

describe("TextModelController Coverage Suite", () => {
  let provider: Mocked<GoogleProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    provider = new GoogleProvider();
  });

  describe("Mode: Quality (Reset on Success)", () => {
    it("should return to index 0 after success on a fallback", async () => {
      vi.stubEnv("TEXT_MODEL_NAMES", "gemini-3-flash-preview, gemini-2.5-pro");
      const { TextModelController } = await import("#shared/lm/text-model-controller.js");

      const ctrl = new TextModelController({ options: { modeModelPriority: "quality" } });
      (ctrl as any)["provider"] = provider;

      provider.generateContent.mockRejectedValueOnce(new Error("Fail 0")).mockResolvedValueOnce({ text: "Ok" });

      expect(ctrl.textModel).toBe("gemini-3-flash-preview");
      await expect(ctrl.generateContent({ messages: [] })).rejects.toThrow();
      expect(ctrl.textModel).toBe("gemini-2.5-pro");

      await ctrl.generateContent({ messages: [] });
    });
  });

  describe("Mode: Env Variable", () => {
    it("should use the speed modeModelPriority from the environment variable", async () => {
      process.env.MODEL_PRIORITY = "speed";
      const { TextModelController } = await import("#shared/lm/text-model-controller.js");
      const ctrl = new TextModelController({ options: { modeModelPriority: "speed" } });
      expect(ctrl["modeModelPriority"]).toBe("speed");
    });

    it("should use the quality modeModelPriority from the environment variable", async () => {
      process.env.MODEL_PRIORITY = "quality";
      const { TextModelController } = await import("#shared/lm/text-model-controller.js");
      const ctrl = new TextModelController();
      expect(ctrl["modeModelPriority"]).toBe("quality");
    });
  });

  describe("Mode: Speed (Sticky State)", () => {
    it("should maintain the fallback index after a successful call", async () => {
      const { TextModelController } = await import("#shared/lm/text-model-controller.js");
      const ctrl = new TextModelController({ options: { modeModelPriority: "speed" } });
      (ctrl as any).provider = provider;

      provider.generateContent.mockRejectedValueOnce(new Error("Fail 0")).mockResolvedValue({ text: "Ok" });

      // 1. Fail primary -> shift to text-1
      await expect(ctrl.generateContent({ messages: [] })).rejects.toThrow();
      expect(ctrl.textModel).toBe("gemini-2.5-pro");

      // 2. Success on fallback -> stay on text-1
      await ctrl.generateContent({ messages: [] });
      expect(ctrl.textModel).toBe("gemini-2.5-pro");
    });
  });

  describe("Wraparound Logic", () => {
    it("should wrap around to 0 when all models fail", async () => {
      const { TextModelController } = await import("#shared/lm/text-model-controller.js");
      const ctrl = new TextModelController({ options: { modeModelPriority: "quality" } });
      (ctrl as any).provider = provider;
      provider.generateContent.mockRejectedValue(new Error("Fail"));

      await expect(ctrl.generateContent({ messages: [] })).rejects.toThrow(); // index 1
      expect(ctrl.textModel).toBe("gemini-2.5-pro");

      await expect(ctrl.generateContent({ messages: [] })).rejects.toThrow(); // index 0 (wrap)
      expect(ctrl.textModel).toBe("gemini-3-flash-preview");
    });
  });

  describe("Model Separation", () => {
    it("should track image and text models independently", async () => {
      const { TextModelController } = await import("#shared/lm/text-model-controller.js");
      const ctrl = new TextModelController({ options: { modeModelPriority: "speed" } });
      (ctrl as any).provider = provider;
      provider.generateContent.mockRejectedValueOnce(new Error("Fail"));
      provider.generateImages.mockResolvedValueOnce({});

      // Fail text model
      await expect(ctrl.generateContent({ messages: [] })).rejects.toThrow();
      expect(ctrl.textModel).toBe("gemini-2.5-pro");

      // Image model should still be 0
      expect(ctrl.imageModel).toBe("gemini-2.5-flash-image");
    });
  });

  describe("Utilities", () => {
    it("should cover countTokens passthrough", async () => {
      const { TextModelController } = await import("#shared/lm/text-model-controller.js");
      const ctrl = new TextModelController();
      (ctrl as any).provider = provider;
      provider.countTokens.mockResolvedValue(10);
      const res = await ctrl.countTokens({ messages: [] });
      expect(res).toBe(10);
      expect(provider.countTokens).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-3-flash-preview" }));
    });
  });
});
