import "#shared/mocks/mock-config.js";
import { createMockCharacter } from "#shared/mocks/mock-character.ts";
import { mockProjectRepository } from "#shared/mocks/mock-project-repository.ts";
import { createMockTextModel } from "#shared/mocks/mock-model.ts";

import { describe, it, expect, vi, beforeEach, afterEach, Mocked } from "vitest";
import {
  createGenerateCharacterImagesTool,
  GenerateCharacterImagesResult,
} from "#shared/lm/tools/characters/generate-character-images.tool.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { getExecutionMode } from "#shared/config.js";
import { generateId } from "#shared/utils/id.ts";
import { IncrementAttemptHook } from "#shared/types/pipeline.types.ts";
import { ProjectRepository } from "#shared/services/project-repository.ts";

describe("generateCharacterImages - Output Order Preservation", () => {
  let mockProvider: Mocked<TextModelController>;
  let mockContext: ToolContext<TextModelController> & {
    incrementAttempt: IncrementAttemptHook;
    projectRepository: ProjectRepository;
  };
  let projectId = generateId();

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = createMockTextModel();

    mockContext = {
      projectId,
      console,
      traceId: "test-trace",
      provider: mockProvider,
      options: { signal: undefined },
      storageManager: {
        getObjectPath: vi.fn((params: any) => `gs://bucket/${params.type}/${params.characterId}/v${params.version}`),
        uploadBuffer: vi.fn((buffer, path) => Promise.resolve(path)),
        getPublicUrl: vi.fn((uri) => uri),
      } as any,
      safetyRetries: 3,
      incrementAttempt: vi.fn(),
      projectRepository: mockProjectRepository
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("BATCH mode - order preservation", () => {
    it("should return results in same order as input in BATCH mode", async () => {
      vi.mocked(getExecutionMode).mockReturnValue("BATCH");

      const character1 = createMockCharacter({ name: "Alice" });
      const character2 = createMockCharacter({ name: "Bob" });
      const character3 = createMockCharacter({ name: "Charlie" });

      const inputCharacters = [
        character1,
        character2,
        character3,
      ];

      mockProvider.generateBatchImages.mockResolvedValue([
        { customId: character3.id, status: "SUCCESS", imageBytes: "abc123" },
        { customId: character2.id, status: "SUCCESS", imageBytes: "def456" },
        { customId: character1.id, status: "SUCCESS", imageBytes: "ghi789" },
      ]);
      mockProjectRepository.getEntities.mockResolvedValue([
        { entityType: 'character', entity: character2 },
        { entityType: 'character', entity: character3 },
        { entityType: 'character', entity: character1 }
      ])

      const results = await createGenerateCharacterImagesTool({
        context: mockContext,
      }).run({
        characters: inputCharacters as any,
        generationRules: [],
        attempt: 1,
      });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(character1.id);
      expect(results[1].id).toBe(character2.id);
      expect(results[2].id).toBe(character3.id);
    });

    it("should preserve order when batch has failures", async () => {
      vi.mocked(getExecutionMode).mockReturnValue("BATCH");

      const character1 = createMockCharacter({ name: "Alice", version: 1 });
      const character2 = createMockCharacter({ name: "Bob", version: 2 });
      const character3 = createMockCharacter({ name: "Charlie", version: 3 });

      const inputCharacters = [
        character1,
        character2,
        character3,
      ];

      mockProvider.generateBatchImages.mockResolvedValue([
        { customId: character2.id, status: "SUCCESS", imageBytes: "abc123" },
        {
          customId: character3.id,
          status: "FAILED",
          error: new Error("Generation failed"),
        },
        { customId: character1.id, status: "SUCCESS", imageBytes: "def456" },
      ]);

      mockProjectRepository.getEntities.mockResolvedValue([
        { entityType: 'character', entity: character2 },
        { entityType: 'character', entity: character3 },
        { entityType: 'character', entity: character1 }
      ])

      const results = await createGenerateCharacterImagesTool({
        context: mockContext,
      }).run({
        characters: inputCharacters as any,
        generationRules: [],
        attempt: 1,
      });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(character1.id);
      expect(results[1].id).toBe(character2.id);
      expect(results[2].id).toBe(character3.id);
    });
  });

  describe("PARALLEL mode - order preservation", () => {
    it("should return results in same order as input in PARALLEL mode", async () => {
      vi.mocked(getExecutionMode).mockReturnValue("PARALLEL");

      const character1 = createMockCharacter({ name: "Alice" });
      const character2 = createMockCharacter({ name: "Bob" });
      const character3 = createMockCharacter({ name: "Charlie" });

      const inputCharacters = [
        character1,
        character2,
        character3,
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
      });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(character1.id);
      expect(results[1].id).toBe(character2.id);
      expect(results[2].id).toBe(character3.id);
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
      });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(characterId1);
      expect(results[1].id).toBe(characterId2);
      expect(results[2].id).toBe(characterId3);
    });
  });
});
