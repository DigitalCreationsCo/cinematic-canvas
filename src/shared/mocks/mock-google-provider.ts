import { vi } from "vitest";

import "#shared/mocks/mock-googlegenai.js";

const { GoogleProvider } = vi.hoisted(() => ({
  GoogleProvider: class {
    generateContent = vi.fn();
    generateImages = vi.fn();
    generateVideos = vi.fn();
    countTokens = vi.fn();
    getVideosOperation = vi.fn();
  },
}));

vi.mock("#shared/lm/google/provider.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("#shared/lm/google/provider.js");
  return {
    ...actual,
    GoogleProvider: GoogleProvider,
  };
});
