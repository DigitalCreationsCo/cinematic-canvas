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

    // Spy on the extracted `sleep` method so every internal delay resolves
    // instantly. This covers all three sites:
    //   - 10 s poll wait in executeVideoGeneration
    //   - 3 s inter-attempt delays (x2) in generateWithQualityRetry
    // No fake-timer configuration is needed anywhere in this suite.
    vi.spyOn(sceneGenerator as any, "sleep").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── helpers ──────────────────────────────────────────────────────────────

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

  // ─── constructor ──────────────────────────────────────────────────────────

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

      // First score (0.7) is below minorIssueThreshold (0.8) → loop retries.
      // The 3 s sleep between attempts is a no-op via the spy, so this resolves
      // immediately. Second score (0.96) is above threshold → accepted.
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

      // All scores below threshold. The loop runs maxRetries (3) times, each
      // separated by an instant sleep, then falls through to the "use best
      // attempt" fallback.
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
      // Poll 1 → still running; poll 2 → done.
      // The 10 s sleep between polls is a no-op so this completes instantly.
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

      // done:true immediately with an error — poll loop is never entered.
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
      // Always returns done:false; only the timeout guard exits the loop.
      mockVideoModel.getVideosOperation = vi.fn().mockResolvedValue(pendingOp);

      // The timeout guard is:  Date.now() - startTime > TIMEOUT_MS
      //
      // sleep() is already a no-op, so we only need Date.now() to move.
      // On call 0 the method captures `startTime`; every subsequent call
      // must return a value past the 15-minute threshold.
      const realNow = Date.now();
      let callCount = 0;
      vi.spyOn(Date, "now").mockImplementation(() => (callCount++ === 0 ? realNow : realNow + 16 * 60 * 1_000));

      await expect((sceneGenerator as any).executeVideoGeneration(makeArgs(scene, { prompt: "test" }))).rejects.toThrow(
        "Video generation timed out",
      );
    });
  });
});
