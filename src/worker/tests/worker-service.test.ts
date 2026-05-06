import { mockJobControlPlane } from "#shared/mocks/mock-job-control-plane.ts";
import { mockProjectRepository } from "#shared/mocks/mock-project-repository.ts";
import { mockCompositionalAgent } from "#shared/mocks/mock-compositional-agent.ts";

let {
  mockMediaProcessingAgent,
  mockContinuityManagerAgent,
  mockSceneGeneratorAgent,
  mockSemanticExpertAgent,
  mockQualityCheckAgent,
  mockAssetVersionManager,
  mockKBHydrator,
  mockMediaController,
  mockLockManager,
} = vi.hoisted(() => {
  let mockMediaProcessingAgent: any;
  let mockContinuityManagerAgent: any;
  let mockSceneGeneratorAgent: any;
  let mockSemanticExpertAgent: any;
  let mockQualityCheckAgent: any;
  let mockAssetVersionManager: any;
  let mockKBHydrator: any;
  let mockMediaController: any;
  let mockLockManager: any;
  return {
    mockMediaProcessingAgent,
    mockContinuityManagerAgent,
    mockSceneGeneratorAgent,
    mockSemanticExpertAgent,
    mockQualityCheckAgent,
    mockAssetVersionManager,
    mockKBHydrator,
    mockMediaController,
    mockLockManager,
  };
});

// Mock modules at top level - factories return classes that return our mock instances
vi.mock("#shared/agents/media-processing-agent.js", () => {
  mockMediaProcessingAgent = {
    renderVideo: vi.fn().mockResolvedValue({ videoGcsUri: "video.mp4", thumbnailGcsUri: "thumb.jpg", duration: 10 }),
    processAudioToScenes: vi.fn().mockResolvedValue({ data: { analysis: {} }, metadata: {} }),
  };
  return {
    MediaProcessingAgent: class {
      constructor() {
        return mockMediaProcessingAgent;
      }
    },
  };
});

vi.mock("#shared/agents/continuity-manager.js", () => {
  mockContinuityManagerAgent = {
    prepareAndRefineSceneInputs: vi.fn().mockResolvedValue({}),
    updateNarrativeState: vi.fn().mockReturnValue({}),
    generateCharacterAssets: vi.fn().mockResolvedValue({ data: { characters: [] }, metadata: {} }),
    generateLocationAssets: vi.fn().mockResolvedValue({ data: { locations: [] }, metadata: {} }),
    generateSceneFramesBatch: vi
      .fn()
      .mockResolvedValue({ data: { updatedScenes: [], deferredSceneIds: [] }, metadata: {} }),
  };
  return {
    ContinuityManagerAgent: class {
      constructor() {
        return mockContinuityManagerAgent;
      }
    },
  };
});

vi.mock("#shared/agents/scene-generator.js", () => {
  mockSceneGeneratorAgent = {
    generateSceneWithQualityCheck: vi.fn().mockResolvedValue({ data: { scene: {} }, metadata: {} }),
  };
  return {
    SceneGeneratorAgent: class {
      constructor() {
        return mockSceneGeneratorAgent;
      }
    },
  };
});

vi.mock("#shared/agents/semantic-expert-agent.js", () => {
  mockSemanticExpertAgent = {
    generateRules: vi.fn().mockResolvedValue({ data: { dynamicRules: [] }, metadata: {} }),
  };
  return {
    SemanticExpertAgent: class {
      constructor() {
        return mockSemanticExpertAgent;
      }
    },
  };
});

vi.mock("#shared/agents/quality-check-agent.js", () => {
  mockQualityCheckAgent = {};
  return {
    QualityCheckAgent: class {
      constructor() {
        return mockQualityCheckAgent;
      }
    },
  };
});

vi.mock("#shared/services/job-control-plane.js", () => {
  mockJobControlPlane = {
    claimJob: vi.fn(),
    getJob: vi.fn(),
    updateJobState: vi.fn(),
    updateJobSafe: vi.fn().mockResolvedValue({}),
    updateJobSafeAndIncrementAttempt: vi.fn().mockResolvedValue(undefined),
    createIncrementAttemptHook: vi.fn().mockReturnValue(vi.fn()),
    requeueJob: vi.fn(),
  };
  return {
    JobControlPlane: vi.fn().mockImplementation(() => mockJobControlPlane),
  };
});

vi.mock("#shared/services/lock-manager.js", () => {
  mockLockManager = {
    lock: vi.fn(),
    unlock: vi.fn(),
  };
  return {
    DistributedLockManager: vi.fn().mockImplementation(() => mockLockManager),
  };
});

vi.mock("#shared/services/asset-version-manager.js", () => {
  mockAssetVersionManager = {
    getNextVersionNumber: vi.fn().mockResolvedValue([1]),
    createVersionedAssets: vi.fn().mockResolvedValue([]),
    batchCreateVersionedAssets: vi.fn(),
  };
  return {
    AssetVersionManager: class {
      constructor() {
        return mockAssetVersionManager;
      }
    },
  };
});

vi.mock("#shared/services/sac/KBHydrator.js", () => {
  mockKBHydrator = {
    extractAndResolveMentions: vi.fn().mockResolvedValue({ handlesResolved: [], textPlain: "" }),
  };
  return {
    KBHydrator: class {
      constructor() {
        return mockKBHydrator;
      }
    },
  };
});

vi.mock("#shared/services/media-controller.js", () => {
  mockMediaController = {};
  return {
    MediaController: class {
      constructor() {
        return mockMediaController;
      }
    },
  };
});

vi.mock("#worker/generateCompositeWorker.js", () => ({
  processGenerateCompositeJob: vi.fn().mockResolvedValue({
    data: { outputImages: [{ data: "image-data" }] },
    metadata: { model: "test-model" },
  }),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkerService } from "#worker/worker-service.js";

describe("WorkerService", () => {
  let workerService: WorkerService;
  let mockPublishJobEvent: any;
  let mockPublishPipelineEvent: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPublishJobEvent = vi.fn().mockResolvedValue("msg-id");
    mockPublishPipelineEvent = vi.fn().mockResolvedValue("msg-id");

    workerService = new WorkerService(
      "test-gcp-project",
      "test-worker-id",
      "test-bucket",
      mockJobControlPlane,
      mockLockManager,
      mockPublishJobEvent,
      mockPublishPipelineEvent,
    );
  });

  it("should be defined", () => {
    expect(workerService).toBeDefined();
  });

  it("should handle unclaimed job", async () => {
    mockJobControlPlane.claimJob.mockResolvedValue(null);
    await workerService.processJob("job-1");
    expect(mockJobControlPlane.claimJob).toHaveBeenCalledWith("job-1");
  });

  it("should handle claimJob error", async () => {
    mockJobControlPlane.claimJob.mockRejectedValue(new Error("DB error"));
    await expect(workerService.processJob("job-1")).rejects.toThrow("DB error");
  });

  describe("EXPAND_CREATIVE_PROMPT job", () => {
    it("should process successfully", async () => {
      const job = {
        id: "job-1",
        type: "EXPAND_CREATIVE_PROMPT",
        projectId: "project-1",
        payload: { enhancedPrompt: "foo" },
        attempts: { currentAttempt: 1, totalAttempts: 1, maxRetries: 3, failureHistory: [] },
      };
      mockJobControlPlane.claimJob.mockResolvedValue([job, new Date().toISOString()]);
      mockJobControlPlane.updateJobSafe.mockResolvedValue({
        ...job,
        state: "COMPLETED",
        projectId: "project-1",
        userId: "user-1",
        teamId: "team-1",
      });
      mockProjectRepository.getProject.mockResolvedValue({
        id: "project-1",
        metadata: { title: "Test", initialPrompt: "foo" },
      });
      mockProjectRepository.updateProject.mockResolvedValue({});

      await workerService.processJob("job-1");

      expect(mockCompositionalAgent.expandCreativePrompt).toHaveBeenCalledWith("Test", "foo", expect.anything());
      expect(mockProjectRepository.updateProject).toHaveBeenCalled();

      expect(mockPublishJobEvent).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ jobId: "job-1" }), type: "JOB_COMPLETED" }),
      );
    });
  });
});
