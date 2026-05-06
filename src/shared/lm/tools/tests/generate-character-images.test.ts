import "#shared/mocks/mock-config.js";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createGenerateCharacterImagesTool,
  GenerateCharacterImagesResult,
} from "#shared/lm/tools/characters/generate-character-images.tool.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { getExecutionMode } from "#shared/config.js";
import { generateId } from "#shared/utils/id.ts";
import { createMockCharacter } from "#shared/mocks/mock-character.ts";

describe("generateCharacterImages - Output Order Preservation", () => {
  let mockProvider: any;
  let mockContext: ToolContext<TextModelController>;
  let projectId = generateId();

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      generateImages: vi.fn(),
      generateBatchImages: vi.fn(),
      imageModel: "gemini-2.5-flash-image",
    };

    mockContext = {
      projectId,
      traceId: "test-trace",
      provider: mockProvider,
      options: { signal: undefined },
      storageManager: {
        getObjectPath: vi.fn((params: any) => `gs://bucket/${params.type}/${params.characterId}/v${params.version}`),
        uploadBuffer: vi.fn((buffer, path) => Promise.resolve(path)),
        getPublicUrl: vi.fn((uri) => uri),
      },
      safetyRetries: 3,
      incrementAttempt: vi.fn(),
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("BATCH mode - order preservation", () => {
    it("should return results in same order as input in BATCH mode", async () => {
      vi.mocked(getExecutionMode).mockReturnValue("BATCH");

      const characterId1 = generateId();
      const characterId2 = generateId();
      const characterId3 = generateId();

      const inputCharacters = [
        createMockCharacter({ id: characterId1, name: "Alice" }),
        createMockCharacter({ id: characterId2, name: "Bob" }),
        createMockCharacter({ id: characterId3, name: "Charlie" }),
      ];

      mockProvider.generateBatchImages.mockResolvedValue([
        { customId: characterId3, status: "SUCCESS", imageBytes: "abc123" },
        { customId: characterId2, status: "SUCCESS", imageBytes: "def456" },
        { customId: characterId1, status: "SUCCESS", imageBytes: "ghi789" },
      ]);

      const results = await createGenerateCharacterImagesTool({
        context: mockContext,
      }).run({
        characters: inputCharacters as any,
        generationRules: [],
        attempt: 1,
      });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(characterId1);
      expect(results[1].id).toBe(characterId2);
      expect(results[2].id).toBe(characterId3);
    });

    it("should preserve order when batch has failures", async () => {
      vi.mocked(getExecutionMode).mockReturnValue("BATCH");

      const characterId1 = generateId();
      const characterId2 = generateId();
      const characterId3 = generateId();

      const inputCharacters = [
        createMockCharacter({ id: characterId1, name: "Alice", version: 1 }),
        createMockCharacter({ id: characterId2, name: "Bob", version: 2 }),
        createMockCharacter({ id: characterId3, name: "Charlie", version: 3 }),
      ];

      mockProvider.generateBatchImages.mockResolvedValue([
        { customId: characterId2, status: "SUCCESS", imageBytes: "abc123" },
        {
          customId: characterId3,
          status: "FAILED",
          error: new Error("Generation failed"),
        },
        { customId: characterId1, status: "SUCCESS", imageBytes: "def456" },
      ]);

      const results = await createGenerateCharacterImagesTool({
        context: mockContext,
      }).run({
        characters: inputCharacters as any,
        generationRules: [],
        attempt: 1,
        incrementAttempt: vi.fn(),
      });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(characterId1);
      expect(results[1].id).toBe(characterId2);
      expect(results[2].id).toBe(characterId3);
    });
  });

  describe("PARALLEL mode - order preservation", () => {
    it("should return results in same order as input in PARALLEL mode", async () => {
      vi.mocked(getExecutionMode).mockReturnValue("PARALLEL");

      const characterId1 = generateId();
      const characterId2 = generateId();
      const characterId3 = generateId();

      const inputCharacters = [
        createMockCharacter({ id: characterId1, name: "Alice", version: 1 }),
        createMockCharacter({ id: characterId2, name: "Bob", version: 2 }),
        createMockCharacter({ id: characterId3, name: "Charlie", version: 3 }),
      ];

      mockProvider.generateImages.mockImplementation(() =>
        Promise.resolve({
          generatedImages: [{ image: { imageBytes: "test" } }],
        }),
      );

      const results = await createGenerateCharacterImagesTool({
        context: mockContext,
      }).run({
        characters: inputCharacters as any,
        generationRules: [],
        attempt: 1,
        incrementAttempt: vi.fn(),
      });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(characterId1);
      expect(results[1].id).toBe(characterId2);
      expect(results[2].id).toBe(characterId3);
    });
  });

  describe("SEQUENTIAL mode - order preservation", () => {
    it("should return results in same order as input in SEQUENTIAL mode", async () => {
      vi.mocked(getExecutionMode).mockReturnValue("SEQUENTIAL");

      const characterId1 = generateId();
      const characterId2 = generateId();
      const characterId3 = generateId();

      const inputCharacters = [
        createMockCharacter({ id: characterId1, name: "Alice", version: 1 }),
        createMockCharacter({ id: characterId2, name: "Bob", version: 2 }),
        createMockCharacter({ id: characterId3, name: "Charlie", version: 3 }),
      ];

      mockProvider.generateImages.mockImplementation(() =>
        Promise.resolve({
          generatedImages: [{ image: { imageBytes: "test" } }],
        }),
      );

      const results = await createGenerateCharacterImagesTool({
        context: mockContext,
      }).run({
        characters: inputCharacters as any,
        generationRules: [],
        attempt: 1,
        incrementAttempt: vi.fn(),
      });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(characterId1);
      expect(results[1].id).toBe(characterId2);
      expect(results[2].id).toBe(characterId3);
    });
  });
});
