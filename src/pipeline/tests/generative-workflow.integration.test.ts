import { createMockJobControlPlane } from "#shared/mocks/mock-job-control-plane.js";
import { createMockStorageManager } from "#shared/mocks/mock-storage-manager.js";
import { createMockProjectRepository } from "#shared/mocks/mock-db.js";

import { vi, describe, it, expect, beforeEach } from "vitest";
import { CinematicVideoWorkflow } from "../graph.js";
import { Command, MemorySaver } from "@langchain/langgraph";
import { Dispatcher } from "#pipeline/dispatcher.js";
import { WorkflowState } from "#shared/types/workflow.types.js";
import { generateId } from "#shared/utils/id.js";
import { JobControlPlane } from "#shared/services/job-control-plane.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

vi.mock("../../shared/services/job-control-plane.js");
vi.mock("../../shared/services/project-repository.js");
vi.mock("../../shared/services/storage-manager.js");
vi.mock("../../shared/services/lock-manager.js");
vi.mock("../dispatcher.js");
vi.mock("../../shared/services/asset-version-manager.js", () => ({
  AssetVersionManager: class MockAssetVersionManager {
    setBestVersion = vi.fn().mockResolvedValue(undefined);
    getNextVersionNumber = vi.fn().mockResolvedValue([1]);
    getBestVersion = vi.fn().mockResolvedValue([{ data: "gs://bucket/video.mp4", version: 1 }]);
    createVersionedAssets = vi.fn().mockResolvedValue([{ head: 1 }]);
  },
}));

describe("Generative Workflow Integration", () => {
  let workflow: CinematicVideoWorkflow;
  let mockJobControlPlane: JobControlPlane;
  let mockProjectRepository: ProjectRepository;
  let mockStorageManager: any;
  let mockLockManager: any;
  let mockDispatcher: any;
  let mockPublishEvent: any;
  let checkpointer: MemorySaver;

  const projectId = generateId();
  const teamId = generateId();
  const userId = generateId();
  const worldId = generateId();

  const gcpProjectId = "test-gcp-project";
  const bucketName = "test-bucket";

  beforeEach(() => {
    vi.clearAllMocks();

    mockJobControlPlane = createMockJobControlPlane();
    mockProjectRepository = createMockProjectRepository();
    mockStorageManager = createMockStorageManager();

    mockLockManager = {
      acquireLock: vi.fn().mockResolvedValue(true),
      releaseLock: vi.fn().mockResolvedValue(undefined),
    };

    mockDispatcher = {
      ensureJob: vi.fn().mockResolvedValue({ id: "job-123", status: "completed" }),
      ensureBatchJobs: vi.fn().mockResolvedValue([{ id: "job-123", status: "completed" }]),
      dispatch: vi.fn().mockResolvedValue(undefined),
    };

    (Dispatcher as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return mockDispatcher;
    });

    // Initialize Workflow
    workflow = new CinematicVideoWorkflow({
      gcpProjectId,
      projectId,
      bucketName,
      jobControlPlane: mockJobControlPlane,
      projectRepository: mockProjectRepository,
      storageManager: mockStorageManager,
      lockManager: mockLockManager,
    });

    mockPublishEvent = vi.fn();
    workflow.publishEvent = mockPublishEvent;
    checkpointer = new MemorySaver();
  });

  it("should initialize successfully", () => {
    expect(workflow).toBeDefined();
    expect(workflow.graph).toBeDefined();
  });

  it("should traverse the graph for a prompt-based workflow", async () => {
    // Setup initial state
    const initialState: WorkflowState = {
      id: "workflow-1",
      projectId,
      teamId,
      userId,
      userApprovedStoryboard: false,
      hasAudio: false,
      currentSceneIndex: 0,
      nodeAttempts: {},
      jobIds: {},
      errors: [],
      userApprovedVideoProcessing: false,
      __interrupt__: [],
      __interrupt_resolved__: false,
      localAudioPath: undefined,
    };

    // Compile the graph
    const app = workflow.graph.compile({ checkpointer });

    mockProjectRepository.getProject.mockResolvedValueOnce({
      id: projectId,
      metadata: {},
      storyboard: { scenes: [] },
      generationRules: [],
    });

    const iterator = await app.stream(initialState, { configurable: { thread_id: "test-thread" } });

    for await (const chunk of iterator) {
    }

    // Verify EnsureJob was called for expand_creative_prompt
    expect(mockDispatcher.ensureJob).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeName: "expand_creative_prompt",
        jobType: "EXPAND_CREATIVE_PROMPT",
      }),
    );

    // Verify EnsureJob was called for generate_storyboard_exclusively_from_prompt
    expect(mockDispatcher.ensureJob).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeName: "generate_storyboard_exclusively_from_prompt",
        jobType: "GENERATE_STORYBOARD",
      }),
    );
  });

  it("should handle user approval after storyboard generation, before video generation interruption", async () => {
    // Mock getProjectScenes to return scenes with some assets
    mockProjectRepository.getProjectScenes.mockResolvedValue([
      { id: "scene-1", assets: { scene_video: { data: "gs://..." } } },
    ]);

    const initialState: WorkflowState = {
      id: "workflow-1",
      projectId,
      teamId,
      userId,
      userApprovedStoryboard: false,
      hasAudio: false,
      currentSceneIndex: 0,
      nodeAttempts: {},
      jobIds: {},
      errors: [],
      userApprovedVideoProcessing: false,
      __interrupt__: [],
      __interrupt_resolved__: false,
      localAudioPath: undefined,
    };

    const app = workflow.graph.compile({ checkpointer });

    // Let's mock `getProject` to return a state that directs to `generate_scene_assets`
    mockProjectRepository.getProject.mockResolvedValue({
      id: projectId,
      metadata: { enhancedPrompt: "test prompt" },
      storyboard: { scenes: [{ id: "s1" }] },
      generationRules: ["rule1"],
    });

    const iterator = await app.stream(initialState, { configurable: { thread_id: "test-thread-2" } });
    for await (const _ of iterator) {
    }

    // 2. Resume: Use a Command with the 'resume' property.
    // Note: Do NOT manually update __interrupt__ here; let the graph handle it.
    const resumeCommand = new Command({
      resume: { action: "approve" }, // This value is what the 'feedback' variable receives in the node
    });

    // 3. IMPORTANT: You must use the SAME thread_id to access the checkpointer's state.
    const iterator2 = await app.stream(resumeCommand, {
      configurable: { thread_id: "test-thread-2" },
    });

    for await (const chunk of iterator2) {
      // This iteration will now proceed to 'generate_character_assets'
      // and eventually hit 'user_approval_before_video_gen'
    }

    const state2 = await app.getState({ configurable: { thread_id: "test-thread-2" } });
    expect(state2.tasks[0]?.interrupts).toBeDefined();
    expect(state2.tasks[0]?.interrupts?.length).toBeGreaterThan(0);
    expect(state2.tasks[0]?.interrupts?.[0].value.type).toBe("user_approval_before_video_gen");
  });

  it("should handle job failure with interrupt", async () => {
    mockProjectRepository.getProject.mockResolvedValue({
      id: projectId,
      metadata: { enhancedPrompt: "test prompt" },
      storyboard: { scenes: [] },
      generationRules: [],
    });

    mockDispatcher.ensureJob.mockImplementation((args: any) => {
      if (args.nodeName === "enrich_storyboard_and_scenes") {
        throw new Error("Simulated Job Failure");
      }
      return { id: "job-123", status: "completed" };
    });

    const initialState: WorkflowState = {
      id: "workflow-1",
      projectId: projectId,
      hasAudio: false,
      currentSceneIndex: 0,
      nodeAttempts: {},
      jobIds: {},
      errors: [],
      userApprovedVideoProcessing: false,
      __interrupt__: [],
      __interrupt_resolved__: false,
      localAudioPath: undefined,
    };

    const app = workflow.graph.compile({ checkpointer });

    const iterator = await app.stream(initialState, { configurable: { thread_id: "test-thread-error" } });

    try {
      for await (const chunk of iterator) {
      }
    } catch (e) {}

    const state = await app.getState({ configurable: { thread_id: "test-thread-error" } });

    expect(state.tasks[0]?.interrupts).toBeDefined();
    expect(state.tasks[0]?.interrupts?.length).toBeGreaterThan(0);
    const interruptVal = state.tasks[0]?.interrupts?.[0].value;
    expect(interruptVal.error).toContain("Simulated Job Failure");
    expect(interruptVal.nodeName).toBe("enrich_storyboard_and_scenes");
  });
});
