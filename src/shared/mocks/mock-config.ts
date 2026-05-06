import { vi } from "vitest";

vi.mock("#shared/config.js", () => ({
  getExecutionMode: vi.fn(() => "SEQUENTIAL"),
  imageMimeType: "image/png",
  aspectRatios: {
    widescreen: { aspectRatio: "16:9" },
    vertical: { aspectRatio: "9:16" },
  },
}));

export { getExecutionMode, getTestMode } from "#shared/config.js";
