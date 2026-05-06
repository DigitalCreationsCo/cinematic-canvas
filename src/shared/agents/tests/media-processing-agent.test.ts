import "#shared/mocks/mock-storage-manager.js";
import { createMockTextModel } from "#shared/mocks/mock-model.js";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaProcessingAgent } from "#shared/agents/media-processing-agent.js";
import { MediaController } from "#shared/services/media-controller.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { GCPStorageManager } from "#shared/services/storage-manager.js";
import { JobRenderVideo } from "#shared/types/job.types.js";
import { AudioAnalysisAttributes } from "#shared/types/audio.types.ts";

vi.mock("#shared/services/media-controller.js", () => ({
  MediaController: class {
    constructor() {
      return {
        getAudioDuration: vi.fn().mockResolvedValue(120),
        renderScenes: vi.fn(),
      };
    }
  },
}));

describe("MediaProcessingAgent", () => {
  let agent: MediaProcessingAgent;
  let mockLM: any;
  let mockStorage: any;
  let mockMediaController: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLM = createMockTextModel();
    mockStorage = new GCPStorageManager("gcp-project-id", "bucket-name");
    mockMediaController = new MediaController(mockStorage);

    agent = new MediaProcessingAgent(mockLM, mockStorage, mockMediaController, undefined);
  });

  describe("constructor", () => {
    it("should initialize with correct dependencies", () => {
      expect(agent).toBeDefined();
      expect(agent instanceof MediaProcessingAgent).toBe(true);
    });

    it("should accept optional AgentOptions", () => {
      const agentWithOptions = new MediaProcessingAgent(mockLM, mockStorage, mockMediaController, {
        signal: new AbortController().signal,
      });
      expect(agentWithOptions).toBeDefined();
    });
  });

  describe("processAudioToScenes", () => {
    it("should return empty analysis when no audio path provided", async () => {
      const result = await agent.processAudioToScenes(undefined, "A creative prompt");

      expect(result.data.analysis.bpm).toBe(0);
      expect(result.data.analysis.segments).toEqual([]);
      expect(result.data.analysis.audioGcsUri).toBe("");
    });

    it("should warn when no audio path provided for analysis", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await agent.processAudioToScenes(undefined, "A creative prompt");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("No audio file provided, skipping audio processing"),
      );
      consoleSpy.mockRestore();
    });

    it("should process audio and return analysis", async () => {
      const mockAnalysis: AudioAnalysisAttributes = {
        bpm: 120,
        keySignature: "C major",
        duration: 120,
        segments: [
          {
            startTime: 0,
            endTime: 30,
            duration: 30,
            type: "instrumental",
            musicalDescription: "Intro",
            intensity: "medium",
            mood: "calm",
            tempo: "moderate",
            musicChange: "none",
            transientImpact: "soft",
            audioEvidence: "transient at 0s",
            lyrics: "",
            transitionType: "Continuous",
          },
        ],
      };

      mockMediaController.getAudioDuration.mockResolvedValue(120);
      mockLM.generateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: JSON.stringify(mockAnalysis) }] } }],
      });

      const result = await agent.processAudioToScenes("/path/to/audio.mp3", "A prompt");

      expect(result.data.analysis.duration).toBe(120);
      expect(result.data.analysis.segments[0].sceneIndex).toBe(0); // Verified mapping[cite: 2]
      expect(mockLM.generateContent).toHaveBeenCalled();
    });

    it("should throw error when LLM returns no candidates", async () => {
      mockMediaController.getAudioDuration.mockResolvedValue(120);
      mockLM.generateContent.mockResolvedValue({
        candidates: [],
      });

      await expect(agent.processAudioToScenes("/path/to/audio.mp3", "A prompt")).rejects.toThrow(
        "No valid analysis result from LLM",
      );
    });

    it("should throw error when LLM returns null response", async () => {
      mockMediaController.getAudioDuration.mockResolvedValue(120);
      mockLM.generateContent.mockResolvedValue(null);

      await expect(agent.processAudioToScenes("/path/to/audio.mp3", "A prompt")).rejects.toThrow(
        "No valid analysis result from LLM",
      );
    });

    it("should throw error when LLM returns empty text", async () => {
      mockMediaController.getAudioDuration.mockResolvedValue(120);
      mockLM.generateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: "" }],
            },
          },
        ],
      });

      await expect(agent.processAudioToScenes("/path/to/audio.mp3", "A prompt")).rejects.toThrow(
        "No valid analysis result from LLM",
      );
    });

    it("should throw error when LLM returns no candidates", async () => {
      mockLM.generateContent.mockResolvedValue({ candidates: [] });
      await expect(agent.processAudioToScenes("/path/to/audio.mp3", "A prompt")).rejects.toThrow(
        "No valid analysis result from LLM",
      );
    });

    it("should parse and validate analysis with AudioAnalysis schema", async () => {
      const validAnalysis: AudioAnalysisAttributes = {
        bpm: 128,
        keySignature: "Am",
        duration: 180,
        segments: [
          {
            startTime: 0,
            endTime: 60,
            duration: 60,
            type: "instrumental",
            lyrics: "",
            musicalDescription: "Test",
            intensity: "medium",
            mood: "calm",
            tempo: "moderate",
            musicChange: "none",
            transientImpact: "soft",
            audioEvidence: "test",
            transitionType: "Cross Fade",
          },
        ],
      };

      mockMediaController.getAudioDuration.mockResolvedValue(180);
      mockLM.generateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(validAnalysis) }],
            },
          },
        ],
      });

      const result = await agent.processAudioToScenes("/path/to/audio.mp3", "A prompt");

      // Verify the result matches the schema
      expect(result.data.analysis.bpm).toBe(128);
      expect(result.data.analysis.keySignature).toBe("Am");
      expect(result.data.analysis.segments[0].sceneIndex).toBe(0);
    });

    it("should call getAudioDuration with correct path", async () => {
      const audioPath = "/local/path/audio.mp3";

      mockMediaController.getAudioDuration.mockResolvedValue(120);
      mockLM.generateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ bpm: 120, duration: 120, segments: [] }) }],
            },
          },
        ],
      });

      await agent.processAudioToScenes(audioPath, "A prompt");

      expect(mockMediaController.getAudioDuration).toHaveBeenCalledWith(audioPath);
    });

    it("should pass correct parameters to generateContent", async () => {
      mockMediaController.getAudioDuration.mockResolvedValue(120);
      mockLM.generateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ bpm: 120, duration: 120, segments: [] }) }],
            },
          },
        ],
      });

      await agent.processAudioToScenes("/path/to/audio.mp3", "A creative prompt");

      expect(mockLM.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.any(Array),
          config: expect.objectContaining({
            abortSignal: undefined,
            responseJsonSchema: expect.anything(),
            thinkingConfig: expect.objectContaining({
              thinkingLevel: expect.anything(),
            }),
          }),
        }),
      );
    });
  });

  describe("renderVideo", () => {
    const mockJob: JobRenderVideo = {
      projectId: "proj_123",
      payload: {
        videoPaths: ["path/1.mp4", "path/2.mp4"],
        audioGcsUri: "gs://bucket/audio.mp3",
      },
      attempts: { currentAttempt: 2 },
    } as any;

    it("should return a processed video object on success", async () => {
      mockMediaController.renderScenes.mockResolvedValue({
        gcsUri: "gs://bucket/video.mp4",
        thumbnailGcsUri: "gs://bucket/thumb.jpg",
        duration: 120,
      });

      const result = await agent.renderVideo(mockJob, "My Movie");

      expect(result.videoGcsUri).toBe("gs://bucket/video.mp4");
      expect(mockMediaController.renderScenes).toHaveBeenCalledWith(
        ["path/1.mp4", "path/2.mp4"],
        "proj_123",
        2,
        "gs://bucket/audio.mp3",
      );
    });

    it("should log and throw an error if the controller fails", async () => {
      mockMediaController.renderScenes.mockRejectedValue(new Error("FFMPEG_FAILURE"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(agent.renderVideo(mockJob, "Title")).rejects.toThrow("FFMPEG_FAILURE");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
