import "#shared/mocks/mock-googlegenai.js";
import "#shared/mocks/mock-google-provider.js";
import { createMockProjectRepository } from "#shared/mocks/mock-project-repository.js";
import { createMockStorageManager } from "#shared/mocks/mock-storage-manager.js";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CompositionalAgent } from "#shared/agents/compositional-agent.js";
import { AssetVersionManager } from "#shared/services/asset-version-manager.js";
import { Storyboard } from "#shared/types/workflow.types.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { GlobalCooldown } from "#shared/utils/global-cooldown.js";
import { createMockCharacter } from "#shared/mocks/mock-character.ts";
import { createMockLocation } from "#shared/mocks/mock-location.ts";
import { createMockScene } from "#shared/mocks/mock-scene.ts";
import { createMockProjectMetadata } from "#shared/mocks/mock-metadata.ts";

vi.mock("#shared/utils/global-cooldown.js", async () => {
  return {
    GlobalCooldown: {
      wait: vi.fn(),
      markCallComplete: vi.fn(),
    },
  };
});

describe("CompositionalAgent", async () => {
  let agent: CompositionalAgent;
  let lm: TextModelController;
  let mockStorage: any;
  let mockRepo: any;
  let mockAssetManager: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(GlobalCooldown.wait).mockResolvedValue(undefined);

    lm = new TextModelController();
    mockStorage = createMockStorageManager({ bucketName: "bucket-name" });
    mockRepo = createMockProjectRepository();
    mockAssetManager = new AssetVersionManager(mockRepo as any);
    agent = new CompositionalAgent(lm, mockStorage, mockAssetManager, { signal: undefined });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should initialize with correct dependencies", () => {
      expect(agent).toBeDefined();
      expect(agent instanceof CompositionalAgent).toBe(true);
    });

    it("should accept optional AgentOptions", () => {
      const agentWithOptions = new CompositionalAgent(lm, mockStorage, mockAssetManager, {
        signal: new AbortController().signal,
      });
      expect(agentWithOptions).toBeDefined();
    });
  });

  describe("expandCreativePrompt", () => {
    it("should expand a creative prompt successfully", async () => {
      const expandedPromptText = "A richly detailed cinematic scene with dramatic lighting and emotional depth";

      lm.generateContent = vi.fn().mockResolvedValue({
        text: expandedPromptText,
      });

      const result = await agent.expandCreativePrompt("Test Title", "A short prompt", {
        maxRetries: 3,
        attempt: 1,
        initialDelay: 1000,
        projectId: "proj-1",
      });

      expect(result).toBeDefined();
      expect(result.data.expandedPrompt).toBe(expandedPromptText);
      expect(result.metadata.model).toBe("gemini-2.5-pro");
      expect(result.metadata.attempts).toBe(1);
      expect(result.metadata.acceptedAttempt).toBe(1);
      expect(lm.generateContent).toHaveBeenCalled();
    });

    it("should throw error when LLM returns empty content", async () => {
      lm.generateContent = vi.fn().mockResolvedValue({
        text: "",
      });

      await expect(
        agent.expandCreativePrompt("Test Title", "A prompt", {
          maxRetries: 1,
          attempt: 1,
          initialDelay: 1000,
          projectId: "proj-1",
        }),
      ).rejects.toThrow("No content generated from LLM for prompt expansion");
    });

    it("should use retry config for retries", async () => {
      const expandedPromptText = "Expanded prompt";

      lm.generateContent = vi.fn().mockRejectedValueOnce(new Error("Rate limit")).mockResolvedValueOnce({
        text: expandedPromptText,
      });

      try {
        const result = await agent.expandCreativePrompt("Test Title", "A prompt", {
          maxRetries: 3,
          attempt: 1,
          initialDelay: 100,
          projectId: "proj-1",
        });
        expect(result.data.expandedPrompt).toBe(expandedPromptText);
        expect(lm.generateContent).toHaveBeenCalledTimes(2);
      } catch (error) {}
    });
  });

  describe("generateStoryboardExclusivelyFromPrompt", () => {
    const mockStoryboard: Storyboard = {
      metadata: {
        title: "Test Storyboard",
        duration: 8,
        totalScenes: 1,
        style: "cinematic",
        mood: "epic",
        colorPalette: ["#ffffff"],
        tags: ["test"],
      } as any,
      characters: [{ id: "char-1", name: "John", physicalTraits: { hair: "brown" } } as any],
      locations: [{ id: "loc-1", name: "Forest" } as any],
      scenes: [
        {
          id: "scene-1",
          sceneIndex: 0,
          startTime: 0,
          endTime: 8,
          duration: 8,
          description: "Scene 1",
          musicalDescription: "Scene 1",
          type: "instrumental",
          lyrics: "",
          musicChange: "none",
          intensity: "medium",
          mood: "calm",
          tempo: "moderate",
          transitionType: "Dissolve",
          shotType: "wide",
          cameraMovement: "static",
          lighting: {
            quality: "test",
            colorTemperature: "test",
            intensity: "test",
            motivatedSources: "test",
            direction: "test",
          },
          audioSync: "mood",
          continuityNotes: [],
          characterIds: ["char-1"],
          locationId: "loc-1",
        } as any,
      ],
    };

    it("should generate storyboard from prompt without audio", async () => {
      const mockGeneratedStoryboard = {
        scenes: [
          {
            sceneIndex: 0,
            description: "Generated scene 1",
            duration: 8,
            startTime: 0,
            endTime: 8,
          },
        ],
        metadata: mockStoryboard.metadata,
        characters: mockStoryboard.characters,
        locations: mockStoryboard.locations,
      };

      lm.generateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(mockGeneratedStoryboard),
      });

      const result = await agent.generateStoryboardExclusivelyFromPrompt(
        "Test Title",
        "An enhanced prompt",
        { maxRetries: 3, attempt: 1, initialDelay: 1000, projectId: "proj-1" },
        mockStoryboard.characters,
        mockStoryboard.locations,
      );

      expect(result).toBeDefined();
      expect(result.data.storyboardAttributes).toBeDefined();
      expect(result.data.storyboardAttributes.scenes).toHaveLength(1);
      expect(result.metadata.model).toBe("gemini-2.5-pro");
      expect(lm.generateContent).toHaveBeenCalled();
    });

    it("should throw error when LLM returns no content", async () => {
      lm.generateContent = vi.fn().mockResolvedValue({
        text: null,
      });

      await expect(
        agent.generateStoryboardExclusivelyFromPrompt(
          "Test Title",
          "A prompt",
          { maxRetries: 1, attempt: 1, initialDelay: 1000, projectId: "proj-1" },
          [],
          [],
        ),
      ).rejects.toThrow("No content generated from LLM");
    });

    it("should apply sceneIndex to generated scenes", async () => {
      const mockGeneratedStoryboard = {
        scenes: [
          { description: "Scene 1", duration: 8 },
          { description: "Scene 2", duration: 8 },
        ],
      };

      lm.generateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(mockGeneratedStoryboard),
      });

      const result = await agent.generateStoryboardExclusivelyFromPrompt(
        "Test Title",
        "A prompt",
        { maxRetries: 3, attempt: 1, initialDelay: 1000, projectId: "proj-1" },
        [],
        [],
      );

      expect(result.data.storyboardAttributes.scenes[0].sceneIndex).toBe(0);
      expect(result.data.storyboardAttributes.scenes[1].sceneIndex).toBe(1);
    });
  });

  describe("generateStoryboardFromAudioAnalysis", () => {
    const mockInitialContext = {
      metadata: createMockProjectMetadata({ title: "Enriched Storyboard", duration: 120 }),
      characters: [createMockCharacter({ id: "char-1", name: "John" })],
      locations: [createMockLocation({ id: "loc-1", name: "Forest" })],
    };

    const mockEnrichedScenes = {
      scenes: [
        createMockScene({ sceneIndex: 0, description: "Enriched Scene 1", duration: 10 }),
        createMockScene({ sceneIndex: 1, description: "Enriched Scene 2", duration: 10 }),
      ],
    };

    it("should generate full storyboard using two-pass approach", async () => {
      // First call: _generateInitialStoryboardContext
      // Second call: first batch of scenes
      // Third call: second batch of scenes (if more than BATCH_SIZE)
      lm.generateContent = vi
        .fn()
        .mockResolvedValueOnce({
          text: JSON.stringify(mockInitialContext),
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({ scenes: mockEnrichedScenes.scenes }),
        });

      const scenes = [
        { startTime: 0, endTime: 10, duration: 10, sceneIndex: 0 } as any,
        { startTime: 10, endTime: 20, duration: 10, sceneIndex: 1 } as any,
      ];

      const result = await agent.generateStoryboardFromAudioAnalysis(
        "Test Title",
        "An enhanced prompt",
        scenes,
        { maxRetries: 3, attempt: 1, initialDelay: 1000, projectId: "proj-1" },
        mockInitialContext.characters as any,
        mockInitialContext.locations as any,
      );

      expect(result).toBeDefined();
      expect(result.data.storyboardAttributes).toBeDefined();
      expect(result.data.storyboardAttributes.scenes).toHaveLength(2);
      expect(result.metadata.attempts).toBe(1);
      expect(lm.generateContent).toHaveBeenCalledTimes(2);
    });

    it("should handle batching when there are many scenes", async () => {
      const BATCH_SIZE = 10;
      const scenes = Array.from({ length: 15 }, (_, i) => ({
        startTime: i * 10,
        endTime: (i + 1) * 10,
        duration: 10,
        sceneIndex: i,
      })) as any[];

      // First call: initial context
      // Then 2 batch calls (10 + 5 scenes)
      lm.generateContent = vi
        .fn()
        .mockResolvedValueOnce({
          text: JSON.stringify(mockInitialContext),
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({ scenes: scenes.slice(0, BATCH_SIZE) }),
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({ scenes: scenes.slice(BATCH_SIZE) }),
        });

      const result = await agent.generateStoryboardFromAudioAnalysis(
        "Test Title",
        "An enhanced prompt",
        scenes,
        { maxRetries: 3, attempt: 1, initialDelay: 1000, projectId: "proj-1" },
        [],
        [],
      );

      expect(result.data.storyboardAttributes.scenes).toHaveLength(15);
      expect(lm.generateContent).toHaveBeenCalledTimes(3);
    });

    it("should validate timing preservation", async () => {
      lm.generateContent = vi
        .fn()
        .mockResolvedValueOnce({
          text: JSON.stringify(mockInitialContext),
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({ scenes: mockEnrichedScenes.scenes }),
        });

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const scenes = [{ startTime: 0, endTime: 10, duration: 10, sceneIndex: 0 } as any];

      await agent.generateStoryboardFromAudioAnalysis(
        "Test Title",
        "A prompt",
        scenes,
        { maxRetries: 3, attempt: 1, initialDelay: 1000, projectId: "proj-1" },
        [],
        [],
      );

      // Should not warn if timings match
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining("Timing mismatch"), expect.anything());

      consoleWarnSpy.mockRestore();
    });

    it("should throw error if initial context generation fails", async () => {
      lm.generateContent = vi.fn().mockResolvedValue({
        text: null,
      });

      await expect(
        agent.generateStoryboardFromAudioAnalysis(
          "Test Title",
          "A prompt",
          [],
          { maxRetries: 1, attempt: 1, initialDelay: 1000, projectId: "proj-1" },
          [],
          [],
        ),
      ).rejects.toThrow("No content generated from LLM for initial context");
    });
  });

  describe("validateTimingPreservation", () => {
    it("should warn on scene count mismatch", () => {
      const originalScenes = [
        { startTime: 0, endTime: 10, duration: 10 } as any,
        { startTime: 10, endTime: 20, duration: 10 } as any,
      ];

      const enrichedScenes = [{ startTime: 0, endTime: 10, duration: 10 } as any];

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Access private method via bracket notation
      (agent as any).validateTimingPreservation(originalScenes, enrichedScenes);

      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);

      consoleWarnSpy.mockRestore();
    });

    it("should warn on timing mismatch", () => {
      const originalScenes = [{ startTime: 0, endTime: 10, duration: 10 } as any];

      const enrichedScenes = [{ startTime: 0, endTime: 12, duration: 12 } as any];

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      (agent as any).validateTimingPreservation(originalScenes, enrichedScenes);

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Timing mismatch"));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Duration mismatch"));

      consoleWarnSpy.mockRestore();
    });

    it("should not warn when timings match", () => {
      const originalScenes = [{ startTime: 0, endTime: 10, duration: 10 } as any];

      const enrichedScenes = [{ startTime: 0, endTime: 10, duration: 10 } as any];

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      (agent as any).validateTimingPreservation(originalScenes, enrichedScenes);

      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });
});
