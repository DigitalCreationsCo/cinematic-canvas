import "#shared/mocks/mock-googlegenai.ts";

import { TextModelController } from "#shared/lm/text-model-controller.js";
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("TextModelController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with google provider by default", () => {
    const controller = new TextModelController();
    expect(controller).toBeInstanceOf(TextModelController);
  });

  it("should have generateContent method", async () => {
    const controller = new TextModelController();
    const providerSpy = vi.spyOn(controller["provider"], "generateContent");
    providerSpy.mockResolvedValue({ text: "mocked content" });
    const testParams = { model: "gemini-pro", messages: [] };
    const result = await controller.generateContent(testParams);
    expect(result).toEqual(expect.objectContaining({ text: "mocked content" }));
  });

  it("should have generateImages method", async () => {
    const controller = new TextModelController();
    const providerSpy = vi.spyOn(controller["provider"], "generateImages");
    providerSpy.mockResolvedValue({ text: "mocked images" });
    const testParams = { model: "imagen", prompt: "test", config: {}, referenceImages: {} };
    const result = await controller.generateImages(testParams);
    expect(result).toEqual(expect.objectContaining({ text: "mocked images" }));
  });

  it("should have countTokens method", async () => {
    const controller = new TextModelController();
    const providerSpy = vi.spyOn(controller["provider"], "countTokens");
    providerSpy.mockResolvedValue({ totalTokens: 100 });
    const testParams = { model: "gemini-pro", messages: [] };
    const result = await controller.countTokens(testParams);
    expect(result).toEqual(expect.objectContaining({ totalTokens: 100 }));
  });
});
