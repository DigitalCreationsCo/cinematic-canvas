import { vi, type Mocked } from "vitest";
import { GoogleGenAI } from "@google/genai";
import { automockClass } from "#shared/mocks/mock.utils.js";

// const { GlobalCooldown } = vi.hoisted(() => ({
//   GlobalCooldown: {
//     wait: vi.fn().mockResolvedValue(undefined),
//     markCallComplete: vi.fn(),
//   },
// }));

// vi.mock("#shared/utils/global-cooldown.js", async (importOriginal) => {
//   return {
//     GlobalCooldown,
//   };
// });

const mockGoogleGenAIInstance = automockClass(GoogleGenAI);

vi.mock("@google/genai", async (actualImport: any) => {
  const actual = await actualImport();
  return {
    ...actual,
    GoogleGenAI: class {
      constructor() {
        return mockGoogleGenAIInstance;
      }
    },
  };
});

export const mockGoogleGenAI = mockGoogleGenAIInstance as Mocked<GoogleGenAI>;
