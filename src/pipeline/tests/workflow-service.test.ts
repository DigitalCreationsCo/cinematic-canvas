import "#shared/mocks/mock-workflow-graph.ts";

import { WorkflowOperator } from "#pipeline/workflow-service.js";
import { handleStream } from "#pipeline/helpers/stream-helper.js";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateId } from "#shared/utils/id.ts";
import { PipelineEventHandler } from "#pipeline/event-handler.ts";
import { CinematicVideoWorkflow } from "#pipeline/graph.js";

describe("WorkflowOperator", () => {
  let workflowOperator: WorkflowOperator;
  let mockCheckpointerManager: any;
  let mockPublishEvent: any;
  let mockControlPlane: any;
  let mockProjectRepository: any;
  let mockWorkflow: any;
  let mockCompiledGraph: any;

  const projectId = generateId();
  const workflowId = generateId();
  const teamId = generateId();
  const userId = generateId();
  const packet = {
    projectId,
    workflowId,
    teamId,
    userId,
  };
  const gcpProjectId = "test-gcp-project";
  const bucketName = "test-bucket";
  let mockLockManager: any;

  beforeEach(() => {
    mockPublishEvent = vi.fn();

    mockLockManager = {
      withProjectLock: vi.fn().mockResolvedValue((projectId, action = vi.fn()) => action),
      acquireLock: vi.fn().mockResolvedValue(true),
      releaseLock: vi.fn().mockResolvedValue(undefined),
    };

    mockCheckpointerManager = {
      getCheckpointer: vi.fn().mockResolvedValue({
        put: vi.fn().mockResolvedValue(undefined),
      }),
      loadCheckpoint: vi.fn().mockResolvedValue(null),
      saveCheckpoint: vi.fn().mockResolvedValue(undefined),
    };

    mockControlPlane = {
      createJob: vi.fn(),
      getJob: vi.fn(),
      updateJobState: vi.fn(),
    };

    mockProjectRepository = {
      getScene: vi.fn(),
      getProjectScenes: vi.fn(),
      getProjectCharacters: vi.fn(),
      getProjectLocations: vi.fn(),
      getProject: vi.fn().mockResolvedValue({ id: projectId, currentSceneIndex: 0 }),
      updateScenes: vi.fn(),
      updateSceneStatus: vi.fn(),
      createProject: vi.fn().mockResolvedValue({
        id: projectId,
        metadata: { hasAudio: false },
        currentSceneIndex: 0,
      }),
      updateProject: vi.fn(),
      appendProjectForceRegenerateSceneIds: vi.fn(),
      getProjectFullState: vi.fn().mockResolvedValue({ id: projectId, metadata: {}, scenes: [] }),
    };

    mockCompiledGraph = {
      stream: vi.fn(),
      getState: vi.fn().mockResolvedValue({ next: [], values: {}, tasks: [] }),
    };

    workflowOperator = new WorkflowOperator(
      mockCheckpointerManager,
      mockControlPlane,
      mockPublishEvent,
      mockProjectRepository,
      {} as any,
      mockLockManager,
      gcpProjectId,
      bucketName,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("startPipeline", () => {
    it("should start a new pipeline", async () => {
      const payload = { initialPrompt: "test", title: "Test" };

      await workflowOperator.startPipeline(packet as any, payload);

      expect(mockProjectRepository.getProjectFullState).toHaveBeenCalled();

      const call = handleStream.mock.calls[0];

      const [receivedPacket, stage, input, publishEvent, compiledGraph, options] = call;

      expect(receivedPacket).toBe(packet);
      expect(stage).toBe("startPipeline");
      expect(input).toBeUndefined();
      expect(publishEvent).toBe(mockPublishEvent);
      expect(compiledGraph.stream).toBeDefined();
      expect(typeof compiledGraph.stream).toBe("function");
      expect(compiledGraph.getState).toBeDefined();
      expect(typeof compiledGraph.getState).toBe("function");

      expect(options.configurable.thread_id).toBe(packet.projectId);
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it("should handle audio payload", async () => {
      const payload = {
        audioGcsUri: "gs://bucket/test.mp3",
        initialPrompt: "test",
        title: "Test",
      };

      await workflowOperator.startPipeline(packet, payload);

      const call = handleStream.mock.calls[0];

      const [receivedPacket, stage, input, publishEvent, compiledGraph, options] = call;

      expect(receivedPacket).toBe(packet);
      expect(stage).toBe("startPipeline");
      expect(input).toBeUndefined();
      expect(publishEvent).toBe(mockPublishEvent);
      expect(compiledGraph.stream).toBeDefined();
      expect(typeof compiledGraph.stream).toBe("function");
      expect(compiledGraph.getState).toBeDefined();
      expect(typeof compiledGraph.getState).toBe("function");

      expect(options.configurable.thread_id).toBe(packet.projectId);
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe("resumePipeline", () => {
    it("should throw if project fails", async () => {
      mockProjectRepository.getProject.mockRejectedValue(new Error("Project not found"));

      await expect(workflowOperator.resumePipeline(projectId)).rejects.toThrow();

      expect(handleStream).not.toHaveBeenCalled();
    });

    // it("should resume with checkpoint", async () => {
    //   mockCheckpointerManager.loadCheckpoint.mockResolvedValue({});

    //   await workflowOperator.resumePipeline(packet);

    //   expect(handleStream).toHaveBeenCalledWith(
    //     packet,
    //     "resumePipeline",
    //     undefined,
    //     mockPublishEvent,
    //     mockCompiledGraph,
    //     expect.anything(),
    //   );
    // });
  });

  describe("regenerateScene", () => {
    it("should trigger regenerate", async () => {
      mockCheckpointerManager.loadCheckpoint.mockResolvedValue({
        channel_values: {
          storyboardState: { scenes: [{ id: "scene-1" }] },
          scenePromptOverrides: {},
        },
      });

      const sceneId = generateId();

      await workflowOperator.regenerateScene({
        projectId,
        payload: { sceneId, forceRegenerate: true, promptModification: "dark" },
      });

      expect(handleStream).toHaveBeenCalled();
    });

    it("should still run when checkpoint null", async () => {
      mockCheckpointerManager.loadCheckpoint.mockResolvedValue(null);
      const sceneId = generateId();
      await workflowOperator.regenerateScene({
        projectId,
        payload: { sceneId, forceRegenerate: true, promptModification: "dark" },
      });

      expect(mockProjectRepository.appendProjectForceRegenerateSceneIds).toHaveBeenCalledWith(projectId, [sceneId]);
      expect(handleStream).toHaveBeenCalled();
    });
  });

  describe("resolveIntervention", () => {
    it("should abort", async () => {
      const workflowState = {
        id: generateId(),
        projectId: projectId,
        teamId: generateId(),
        userId: generateId(),
      };
      mockCheckpointerManager.loadCheckpoint.mockResolvedValue({
        channel_values: {
          ...workflowState,
          __interrupt__: [{ value: { nodeName: "x" } }],
        },
      });

      await workflowOperator.resolveIntervention(workflowState, { action: "abort" });

      expect(mockPublishEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "WORKFLOW_FAILED" }));
    });

    it("should retry", async () => {
      const workflowState = {
        id: generateId(),
        projectId: projectId,
        teamId: generateId(),
        userId: generateId(),
      };
      mockCheckpointerManager.loadCheckpoint.mockResolvedValue({
        channel_values: {
          ...workflowState,
          __interrupt__: [{ value: { nodeName: "x" } }],
        },
      });

      await workflowOperator.resolveIntervention(workflowState, {
        action: "retry",
        revisedParams: {},
      });

      expect(handleStream).toHaveBeenCalled();
    });
  });

  // describe("updateSceneAsset", () => {
  //   it("should update scene", async () => {
  //     const scene: Scene = {
  //       id: "scene-1",
  //       rejectedAttempts: {},
  //       status: "complete",
  //       assets: {
  //         scene_video: {
  //           best: 1,
  //           head: 1,
  //           versions: [{}, { data: "x" }],
  //         },
  //       },
  //     } as any;

  //     mockProjectRepository.getScene.mockResolvedValue(scene);

  //     await workflowOperator.updateSceneAsset(projectId, {
  //       scene,
  //       assetKey: "scene_video",
  //       version: 1,
  //     });

  //     expect(mockPublishEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "FULL_STATE" }));
  //   });
  // });

  describe("publishEvent", () => {
    it("allows different projects", async () => {
      await workflowOperator.publishEvent({ type: "WORKFLOW_COMPLETED", projectId } as any);
      await workflowOperator.publishEvent({ type: "WORKFLOW_COMPLETED", projectId: "x" } as any);

      expect(mockPublishEvent).toHaveBeenCalledTimes(2);
    });

    it("allows other events", async () => {
      await workflowOperator.publishEvent({ type: "FULL_STATE", projectId } as any);
      await workflowOperator.publishEvent({ type: "FULL_STATE", projectId } as any);

      expect(mockPublishEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe("handleJobCompletion", () => {
    it("should resume", async () => {
      const jobId = generateId();
      mockControlPlane.getJob.mockResolvedValue({
        id: jobId,
        ...packet,
        type: "GENERATE_SCENE_VIDEO",
        state: "COMPLETED",
        projectId,
      });

      mockCheckpointerManager.loadCheckpoint.mockResolvedValue({});

      await PipelineEventHandler.handleJobCompletion(jobId, mockControlPlane, workflowOperator, mockPublishEvent);

      expect(handleStream).toHaveBeenCalled();
    });
  });
});
