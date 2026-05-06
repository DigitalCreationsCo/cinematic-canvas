import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Model Fallback Configuration", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe("getProviderTextModelNames", () => {
    it("should return a text model when no fallbacks configured", async () => {
      vi.stubEnv("TEXT_MODEL_NAMES", "");
      const { getProviderTextModelNames } = await import("#shared/lm/models.js");

      const result = getProviderTextModelNames("google");

      expect(result).toEqual(["gemini-2.5-pro"]);
    });

    it("should parse comma-separated text models", async () => {
      vi.stubEnv("TEXT_MODEL_NAMES", "gemini-3-pro-preview,gemini-2.5-pro,gemini-1.5-flash");

      const { getProviderTextModelNames } = await import("#shared/lm/models.js");

      const result = getProviderTextModelNames("google");

      expect(result).toEqual(["gemini-3-pro-preview", "gemini-2.5-pro", "gemini-1.5-flash"]);
    });

    it("should handle whitespace in comma-separated models", async () => {
      vi.stubEnv("TEXT_MODEL_NAMES", "gemini-3-pro-preview, gemini-2.5-pro , gemini-1.5-flash");

      const { getProviderTextModelNames } = await import("#shared/lm/models.js");

      const result = getProviderTextModelNames("google");

      expect(result).toEqual(["gemini-3-pro-preview", "gemini-2.5-pro", "gemini-1.5-flash"]);
    });

    it("should prioritize plural environment variable over singular", async () => {
      vi.stubEnv("TEXT_MODEL_NAMES", "gemini-3-pro-preview,gemini-2.5-pro");
      vi.stubEnv("TEXT_MODEL_NAME", "gemini-1.5-flash");

      const { getProviderTextModelNames } = await import("#shared/lm/models.js");

      const result = getProviderTextModelNames("google");

      expect(result).toEqual(["gemini-3-pro-preview", "gemini-2.5-pro"]);
    });

    it("should filter out empty strings", async () => {
      vi.stubEnv("TEXT_MODEL_NAMES", "gemini-3-pro-preview,,gemini-2.5-pro,");

      const { getProviderTextModelNames } = await import("#shared/lm/models.js");

      const result = getProviderTextModelNames("google");

      expect(result).toEqual(["gemini-3-pro-preview", "gemini-2.5-pro"]);
    });
  });

  describe("getProviderImageModelNames", () => {
    it("should return single image model when no fallbacks configured", async () => {
      vi.unstubAllEnvs();
      const { getProviderImageModelNames } = await import("#shared/lm/models.js");

      const result = getProviderImageModelNames("google");

      expect(result).toEqual(["gemini-2.5-flash-image"]);
    });

    it("should parse comma-separated image models", async () => {
      vi.stubEnv("IMAGE_MODEL_NAMES", "gemini-3-pro-image-preview,gemini-2.5-flash-image");

      const { getProviderImageModelNames } = await import("#shared/lm/models.js");

      const result = getProviderImageModelNames("google");

      expect(result).toEqual(["gemini-3-pro-image-preview", "gemini-2.5-flash-image"]);
    });
  });

  describe("getProviderQualityCheckModelNames", () => {
    it("should return single quality check model when no fallbacks configured", async () => {
      vi.stubEnv("QUALITY_EVALUATION_MODEL_NAME", "");

      const { getProviderQualityCheckModelNames } = await import("#shared/lm/models.js");

      const result = getProviderQualityCheckModelNames("google");

      expect(result).toEqual(["gemini-2.5-flash"]);
    });

    it("should parse comma-separated quality check models", async () => {
      vi.stubEnv("QUALITY_EVALUATION_MODEL_NAMES", "gemini-2.5-pro,gemini-1.5-pro");

      const { getProviderQualityCheckModelNames } = await import("#shared/lm/models.js");

      const result = getProviderQualityCheckModelNames("google");

      expect(result).toEqual(["gemini-2.5-pro", "gemini-1.5-pro"]);
    });
  });

  describe("getProviderVideoModelNames", () => {
    it("should return single video model when no fallbacks configured", async () => {
      vi.stubEnv("VIDEO_MODEL_NAME", "veo-2.0-generate-exp");

      const { getProviderVideoModelNames } = await import("#shared/lm/models.js");

      const result = getProviderVideoModelNames("google");

      expect(result).toEqual(["veo-2.0-generate-exp"]);
    });

    it("should parse comma-separated video models", async () => {
      vi.stubEnv("VIDEO_MODEL_NAMES", "veo-2.0-generate-exp,veo-1.0-generate");

      const { getProviderVideoModelNames } = await import("#shared/lm/models.js");

      const result = getProviderVideoModelNames("google");

      expect(result).toEqual(["veo-2.0-generate-exp", "veo-1.0-generate"]);
    });

    it("should handle LTX provider", async () => {
      const { getProviderVideoModelNames } = await import("#shared/lm/models.js");

      const result = getProviderVideoModelNames("ltx");

      expect(result).toEqual(["ltx"]);
    });
  });
});
