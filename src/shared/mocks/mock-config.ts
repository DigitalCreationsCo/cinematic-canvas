import { vi } from "vitest";

vi.mock("#shared/config.js", () => ({
  getExecutionMode: vi.fn(() => "SEQUENTIAL"),
  getGlobalModelCooldownMs: vi.fn(() => 1),
  getImageRateLimitRetryDelayMs: vi.fn(() => 1),
  getParallelImageStaggerMs: vi.fn(() => 1),
  getTestMode: vi.fn(() => false),
  imageMimeType: "image/png",
  aspectRatios: {
    widescreen: { aspectRatio: "16:9" },
    vertical: { aspectRatio: "9:16" },
  },
}));

export { getExecutionMode, getTestMode } from "#shared/config.js";
