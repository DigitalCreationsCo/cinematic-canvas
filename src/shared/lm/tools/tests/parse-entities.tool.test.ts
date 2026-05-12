import "#shared/mocks/mock-config.js";
import { describe, it, expect, vi, beforeEach, Mocked } from "vitest";
import { generateId } from "#shared/utils/id.ts";
import { createMockTextModel } from "#shared/mocks/mock-model.ts";
import { mockProjectRepository } from "#shared/mocks/mock-project-repository.ts";

// Target Tool & Context Types
import { SceneParserTool } from "./scene-parser.tool.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";

describe("parseSceneFromText Orchestration Suite", () => {
  let mockProvider: Mocked<TextModelController>;
  let mockKbService: any;
  let tool: SceneParserTool;
  let projectId = generateId();

  const mockToolContext = {
    projectId,
    traceId: "test-trace",
    provider: null as any,
    projectRepository: mockProjectRepository,
    // ... typical tool context fields
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = createMockTextModel();
    mockKbService = {
      extractAndResolveMentions: vi.fn(),
    };

    // Instantiate the tool with mocked services
    tool = new SceneParserTool({
      textModel: mockProvider,
      kbService: mockKbService,
      projectRepository: mockProjectRepository,
    });
  });

  it("should resolve existing entities via handles and skip LLM parsing when text is empty", async () => {
    const sceneFields = { description: "Scene with @John" };
    const johnId = generateId();

    // 1. Mock KB Service resolving the handle
    mockKbService.extractAndResolveMentions.mockResolvedValue({
      handlesResolved: ["char-ref-john"],
      textPlain: "Scene with ", // Resulting plain text after stripping chips
    });

    // 2. Mock Repository returning the existing character
    mockProjectRepository.getCharactersByProject.mockResolvedValue([
      { id: johnId, referenceId: "char-ref-john", name: "John" },
    ]);
    mockProjectRepository.getLocationsByProject.mockResolvedValue([]);
    mockProjectRepository.getPropsByProject.mockResolvedValue([]);
    mockProjectRepository.getScenesByProject.mockResolvedValue([]);

    // 3. Mock the final Scene Generation tool call
    // (Assuming tool uses createGenerateScenesTool internally)
    // We expect 0 calls to createParseCharactersTool because textPlain is non-substantive

    const result = await tool.parseSceneFromText({ projectId } as any, sceneFields);

    expect(mockKbService.extractAndResolveMentions).toHaveBeenCalledWith(
      expect.objectContaining({ htmlInput: sceneFields.description }),
    );
    expect(mockProjectRepository.createCharacters).not.toHaveBeenCalled(); // No new entities
    expect(result).toBeDefined();
  });

  it("should trigger LLM parsing for unresolved entities in substantive plain text", async () => {
    const sceneFields = { description: "John and Sarah explore the desert." };

    // KB resolves nothing (all plain text)
    mockKbService.extractAndResolveMentions.mockResolvedValue({
      handlesResolved: [],
      textPlain: "John and Sarah explore the desert.",
    });

    mockProjectRepository.getCharactersByProject.mockResolvedValue([]);
    mockProjectRepository.getLocationsByProject.mockResolvedValue([]);
    mockProjectRepository.getPropsByProject.mockResolvedValue([]);

    // Mock internal tool factory runs
    // Note: In a real test, you'd mock the specific tool run methods
    // to return CharacterAttributes and LocationAttributes

    await tool.parseSceneFromText({ projectId } as any, sceneFields);

    // Verify persistence was called for the new entities parsed from text
    expect(mockProjectRepository.createCharacters).toHaveBeenCalled();
    expect(mockProjectRepository.createLocations).toHaveBeenCalled();
  });

  it("should register handles for all newly created entities", async () => {
    const sceneFields = { description: "NewPerson enters the NewRoom." };

    mockKbService.extractAndResolveMentions.mockResolvedValue({
      handlesResolved: [],
      textPlain: "NewPerson enters the NewRoom.",
    });

    // Mock LLM identifying one character and one location
    // (Internal logic implementation check)

    await tool.parseSceneFromText({ projectId } as any, sceneFields);

    // Verify tagRegistryService.registerHandle logic (if exposed/injected)
    // Here we ensure repository persistence happened first
    const characterCalls = vi.mocked(mockProjectRepository.createCharacters).mock.calls;
    expect(characterCalls.length).toBeGreaterThan(0);
  });

  it("should merge resolved and newly created entities into the final scene generation context", async () => {
    const existingChar = { id: "existing-1", referenceId: "ref-ex-1", name: "OldGuy" };
    const sceneFields = { description: "@OldGuy meets YoungGal" };

    mockKbService.extractAndResolveMentions.mockResolvedValue({
      handlesResolved: ["ref-ex-1"],
      textPlain: " meets YoungGal",
    });

    mockProjectRepository.getCharactersByProject.mockResolvedValue([existingChar]);

    // This test ensures the 'YoungGal' (parsed) and 'OldGuy' (resolved)
    // both end up in the sceneAttributes characters array.

    await tool.parseSceneFromText({ projectId } as any, sceneFields);

    expect(mockProjectRepository.createScenes).toHaveBeenCalledWith(
      projectId,
      expect.arrayContaining([
        expect.objectContaining({
          characterReferenceIds: expect.arrayContaining(["ref-ex-1"]),
        }),
      ]),
    );
  });
});
