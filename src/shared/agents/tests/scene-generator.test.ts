import { createMockStorageManager } from "#shared/mocks/mock-storage-manager.js";
import { createMockVideoModel } from "#shared/mocks/mock-model.js";
import { createMockQualityAgent } from "#shared/mocks/mock-quality-agent.js";
import { createMockAssetManager } from "#shared/mocks/mock-asset-manager.js";

import { SceneGeneratorAgent } from "#shared/agents/scene-generator.js";
import { Scene } from "#shared/types/workflow.types.js";
import { ReferenceImage } from "#shared/lm/provider.js";
import { vi, describe, it, expect, beforeEach, afterEach, Mocked } from "vitest";
import { QualityCheckAgent } from "#shared/agents/quality-check-agent.ts";

describe("SceneGeneratorAgent", () => {
  let sceneGenerator: SceneGeneratorAgent;
  let mockStorageManager: ReturnType<typeof createMockStorageManager>;
  let mockVideoModel: ReturnType<typeof createMockVideoModel>;
  let mockQualityAgent: Mocked<QualityCheckAgent>;
  let mockAssetManager: ReturnType<typeof createMockAssetManager>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStorageManager = createMockStorageManager();
    mockVideoModel = createMockVideoModel();
    mockVideoModel.getVideosOperation.mockResolvedValueOnce({ name: "op-1", done: false }).mockResolvedValueOnce({
      name: "op-1",
      done: true,
      response: {
        generatedVideos: [{ video: { videoBytes: "base64data" } }],
      },
    });

    mockQualityAgent = createMockQualityAgent();
    mockAssetManager = createMockAssetManager();

    sceneGenerator = new SceneGeneratorAgent(
      mockVideoModel,
      mockQualityAgent,
      mockStorageManager,
      mockAssetManager,
      undefined,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── helpers ──────────────────────────────────────────────────────

  const createMockScene = (overrides: any = {}): Scene =>
    ({
      id: "scene-1",
      sceneIndex: 0,
      projectId: "proj-1",
      description: "Test scene",
      duration: 10,
      lighting: { type: "natural", intensity: 0.8 },
      characterIds: ["char-1"],
      locationId: "loc-1",
      assets: {},
      intensity: "high",
      mood: "dramatic",
      tempo: "fast",
      transitionType: "Cut",
      shotType: "Medium Close-Up",
      cameraAngle: "Eye Level",
      cameraMovement: "Static",
      status: "pending",
      progressMessage: "",
      ...overrides,
    }) as any;

  const mockStartFrame: ReferenceImage = {
    referenceType: "base",
    referenceImage: { gcsUri: "gs://bucket/start-frame.jpg", mimeType: "image/jpeg" },
  };

  const mockEndFrame: ReferenceImage = {
    referenceType: "subject",
    referenceImage: { gcsUri: "gs://bucket/end-frame.jpg", mimeType: "image/jpeg" },
    config: { subjectType: "SUBJECT_TYPE_DEFAULT", subjectDescription: "Scene end frame" },
  };

  // ─── constructor ──────────────────────────────────────────────────

  describe("constructor", () => {
    it("should initialize with correct dependencies", () => {
      expect(sceneGenerator).toBeDefined();
      expect(sceneGenerator instanceof SceneGeneratorAgent).toBe(true);
    });

    it("should accept optional AgentOptions", () => {
      const agentWithOptions = new SceneGeneratorAgent(
        mockVideoModel,
        mockQualityAgent,
        mockStorageManager,
        mockAssetManager,
        { signal: new AbortController().signal },
      );
      expect(agentWithOptions).toBeDefined();
    });
  });

  // ─── generateSceneWithQualityCheck ────────────────────────────────────────

  describe("generateSceneWithQualityCheck", () => {
    it("should generate scene successfully without quality check", async () => {
      mockQualityAgent.qualityConfig = { ...mockQualityAgent.qualityConfig, enabled: false };

      const scene = createMockScene();
      const generateSceneWithSafetyRetrySpy = vi
        .spyOn(sceneGenerator as any, "generateSceneWithSafetyRetry")
        .mockResolvedValue({
          scene,
          videoUrl: "gs://bucket/scene-video/v1.mp4",
          enhancedPrompt: "test prompt",
        });

      const saveAssets = vi.fn();
      const sendEntityUpdate = vi.fn();

      const result = await sceneGenerator.generateSceneWithQualityCheck({
        scene,
        enhancedPrompt: "test prompt",
        sceneCharacters: [],
        sceneLocation: {} as any,
        previousScene: undefined,
        version: 1,
        characterReferenceImages: [],
        locationReferenceImages: [],
        startFrame: mockStartFrame,
        endFrame: mockEndFrame,
        generateAudio: false,
        saveAssets,
        sendEntityUpdate,
        incrementAttempt: vi.fn(),
        generationRules: [],
        uniqueId: "unique-id",
      });

      expect(result).toBeDefined();
      expect(result.data.videoUrl).toBe("gs://bucket/scene-video/v1.mp4");
      expect(result.metadata.model).toBeDefined();
      expect(saveAssets).toHaveBeenCalled();
      expect(sendEntityUpdate).toHaveBeenCalled();

      generateSceneWithSafetyRetrySpy.mockRestore();
    });

    it("should generate scene with quality check enabled", async () => {
      const scene = createMockScene();
      const generateWithQualityRetrySpy = vi
        .spyOn(sceneGenerator as any, "generateWithQualityRetry")
        .mockResolvedValue({
          data: {
            scene,
            videoUrl: "gs://bucket/scene-video/v1.mp4",
            enhancedPrompt: "test prompt",
          },
          metadata: { model: "test-model", attempts: 1, acceptedAttempt: 1 },
        });

      const saveAssets = vi.fn();
      const sendEntityUpdate = vi.fn();

      const result = await sceneGenerator.generateSceneWithQualityCheck({
        scene,
        enhancedPrompt: "test prompt",
        sceneCharacters: [],
        sceneLocation: {} as any,
        previousScene: undefined,
        version: 1,
        characterReferenceImages: [],
        locationReferenceImages: [],
        startFrame: undefined,
        endFrame: undefined,
        generateAudio: false,
        saveAssets,
        sendEntityUpdate,
        incrementAttempt: vi.fn(),
        generationRules: [],
        uniqueId: "unique-id",
      });

      expect(result).toBeDefined();
      expect(result.data.videoUrl).toBe("gs://bucket/scene-video/v1.mp4");
      expect(generateWithQualityRetrySpy).toHaveBeenCalled();

      generateWithQualityRetrySpy.mockRestore();
    });

    it("should handle scene generation failure", async () => {
      const scene = createMockScene();
      vi.spyOn(sceneGenerator as any, "generateSceneWithSafetyRetry").mockRejectedValue(new Error("Generation failed"));

      const sendEntityUpdate = vi.fn();

      await expect(
        sceneGenerator.generateSceneWithQualityCheck({
          scene,
          enhancedPrompt: "test prompt",
          sceneCharacters: [],
          sceneLocation: {} as any,
          previousScene: undefined,
          version: 1,
          characterReferenceImages: [],
          locationReferenceImages: [],
          startFrame: undefined,
          endFrame: undefined,
          generateAudio: false,
          saveAssets: vi.fn(),
          sendEntityUpdate,
          incrementAttempt: vi.fn(),
          generationRules: [],
          uniqueId: "unique-id",
        }),
      ).rejects.toThrow("Generation failed");

      expect(sendEntityUpdate).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ entity: expect.objectContaining({ status: "error" }) })]),
      );
    });
  });

  // ─── generateWithQualityRetry ─────────────────────────────────────────────

  describe("generateWithQualityRetry", () => {
    const callQualityRetry = (scene: Scene, prompt = "initial prompt") =>
      (sceneGenerator as any).generateWithQualityRetry(
        scene,
        prompt,
        /* characters */ [],
        /* location   */ {} as any,
        /* previousScene */ undefined,
        /* version    */ 1,
        /* characterRefs */ [],
        /* locationRefs  */ [],
        /* startFrame */ undefined,
        /* endFrame   */ undefined,
        /* generateAudio */ false,
        /* saveAssets */ vi.fn(),
        /* sendEntityUpdate */ vi.fn(),
        /* incrementAttempt */ vi.fn(),
        /* generationRules */ [],
        /* uniqueId */ "unique-id",
      );

    it("should return best scene after quality check loop", async () => {
      const scene = createMockScene();

      vi.spyOn(sceneGenerator as any, "generateSceneWithSafetyRetry").mockResolvedValue({
        scene,
        videoUrl: "gs://bucket/video.mp4",
        enhancedPrompt: "prompt",
      });

      mockQualityAgent.evaluateScene = vi
        .fn()
        .mockResolvedValueOnce({ score: 0.7, grade: "REGENERATE_MINOR" })
        .mockResolvedValueOnce({ score: 0.96, grade: "ACCEPT" });

      mockQualityAgent.applyQualityCorrections = vi
        .fn()
        .mockImplementation((prompt: string) => Promise.resolve(prompt + " corrected"));

      const result = await callQualityRetry(scene);

      expect(result).toBeDefined();
      expect(result.data.videoUrl).toBe("gs://bucket/video.mp4");
      expect(result.metadata.attempts).toBeGreaterThan(1);
    });

    it("should use best attempt when all attempts fail quality", async () => {
      const scene = createMockScene();

      vi.spyOn(sceneGenerator as any, "generateSceneWithSafetyRetry").mockResolvedValue({
        scene,
        videoUrl: "gs://bucket/video.mp4",
        enhancedPrompt: "prompt",
      });

      mockQualityAgent.evaluateScene = vi.fn().mockResolvedValue({ score: 0.6, grade: "FAIL" });

      const result = await callQualityRetry(scene);

      expect(result).toBeDefined();
      expect(result.data.videoUrl).toBe("gs://bucket/video.mp4");
      expect(result.metadata.warning).toContain("Quality below threshold");
    });
  });

  // ─── generateSceneWithSafetyRetry ─────────────────────────────────────────

  describe("generateSceneWithSafetyRetry", () => {
    it("should sanitize prompt on RAI error", async () => {
      const scene = createMockScene();
      const { RAIError } = await import("#shared/utils/errors.js");

      vi.spyOn(sceneGenerator as any, "executeVideoGeneration")
        .mockRejectedValueOnce(new RAIError("Safety filter triggered", "bad prompt"))
        .mockResolvedValueOnce("gs://bucket/video.mp4");

      mockQualityAgent.sanitizePrompt = vi.fn().mockResolvedValue("sanitized prompt");

      try {
        const result = await (sceneGenerator as any).generateSceneWithSafetyRetry(
          scene,
          "bad prompt",
          1,
          [],
          [],
          undefined,
          undefined,
          undefined,
          false,
          [],
          vi.fn(),
          vi.fn(),
          "unique-id",
        );
        expect(result.videoUrl).toBe("gs://bucket/video.mp4");
        expect(mockQualityAgent.sanitizePrompt).toHaveBeenCalledWith("bad prompt", expect.any(String));
      } catch (error) {}
    });
  });

  // ─── executeVideoGeneration ───────────────────────────────────────────────

  describe("executeVideoGeneration", () => {
    const projectId = "proj-1";
    const sceneId = "scene-1";
    const version = 1;

    const makeArgs = (scene: Scene, overrides: Record<string, unknown> = {}) => ({
      scene,
      prompt: "test prompt",
      duration: 10,
      sceneId,
      version,
      characterReferenceImages: [],
      locationReferenceImages: [],
      previousScene: undefined,
      generateAudio: false,
      sendEntityUpdate: vi.fn(),
      incrementAttempt: vi.fn(),
      uniqueId: "unique-id",
      ...overrides,
    });

    it("should generate video and upload it", async () => {
      const scene = createMockScene();

      const pendingOp = { name: "operations/123", done: false };
      const completedOp = {
        done: true,
        response: {
          generatedVideos: [{ video: { videoBytes: Buffer.from("fake-video").toString("base64") } }],
        },
      };

      mockVideoModel.generateVideos = vi.fn().mockResolvedValue(pendingOp);
      mockVideoModel.getVideosOperation = vi.fn().mockResolvedValueOnce(pendingOp).mockResolvedValueOnce(completedOp);

      const result = await (sceneGenerator as any).executeVideoGeneration(makeArgs(scene));

      expect(result).toMatch(/^gs:\/\//);
      expect(mockVideoModel.generateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "test prompt",
          config: expect.objectContaining({ durationSeconds: expect.any(Number), numberOfVideos: 1 }),
        }),
      );
      expect(mockVideoModel.getVideosOperation).toHaveBeenCalledTimes(2);
    });

    it("should throw RAIError on safety violation", async () => {
      const scene = createMockScene();

      // Operation is already done with an error - no polling loop entered
      mockVideoModel.generateVideos = vi.fn().mockResolvedValue({
        name: "operations/123",
        done: true,
        error: { message: "Violated safety guidelines" },
      });

      await expect((sceneGenerator as any).executeVideoGeneration(makeArgs(scene, { prompt: "test" }))).rejects.toThrow(
        "Violated safety guidelines",
      );
    });

    it("should throw error on timeout", async () => {
      const scene = createMockScene();

      const pendingOp = { name: "operations/123", done: false };
      mockVideoModel.generateVideos = vi.fn().mockResolvedValue(pendingOp);
      // Always return done:false - only timeout guard exits loop
      mockVideoModel.getVideosOperation = vi.fn().mockResolvedValue(pendingOp);

      // Use fake timers to control both setTimeout (for sleep) and Date.now() (for timeout check)
      vi.useFakeTimers({
        toFake: ["setTimeout", "Date"],
      });

      // Set initial time to 0 (this will be captured as startTime)
      vi.setSystemTime(0);

      const executionPromise = (sceneGenerator as any).executeVideoGeneration(makeArgs(scene, { prompt: "test" }));

      // Use advanceTimersByTimeAsync to properly process microtasks
      // This advances time by 15 minutes + 1ms, which:
      // 1. Fires the setTimeout from sleep(10000), resolving the sleep promise
      // 2. Processes microtasks so the async function continues
      // 3. Now Date.now() returns 900001
      // 4. The timeout check (Date.now() - startTime > 900000) will be true
      // 5. Timeout error will be thrown
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 1);

      await expect(executionPromise).rejects.toThrow("Video generation timed out");

      // Restore real timers
      vi.useRealTimers();
    });
  });
});
