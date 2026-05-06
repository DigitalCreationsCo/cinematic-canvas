import {
  confirmEntityNode,
  createEntityWithPendingNode,
  createProject,
  deleteEntity,
  fetchActiveJobsForProject,
  generateCharacterImage,
  generateComposites,
  generateLocationImage,
  getCharacterAssets,
  getCommandStatus,
  getLocationAssets,
  getMentionHandle,
  getMentionSuggestions,
  getProjectAssets,
  getProjects,
  getSceneAssets,
  patchAsset,
  patchEntities,
  regenerateFrame,
  regenerateScene,
  registerMentionHandle,
  requestFullState,
  resolveIntervention,
  resolveMentions,
  resumePipeline,
  startPipeline,
  stopPipeline,
  unregisterMentionHandle,
  api,
} from "#client/mocks/mock-api.js";
import { useNodeStore } from "#client/mocks/mock-store.js";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EntityPrimitiveType } from "#shared/types/entity.types.js";
import {
  ResolveMentionsRequest,
  MentionSuggestion,
  SuggestMentionsResponse,
  ResolveMentionsResponse,
} from "#shared/types/mention.types.js";

describe.skip("api - Pipeline Functions", async () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startPipeline", () => {
    it("should call projects.start.mutate with input", async () => {
      const input = { projectId: "proj-1", initialPrompt: "test prompt" } as any;
      await startPipeline(input);
      expect(api.projects.start.mutate).toHaveBeenCalledWith(input);
    });

    it("should return mutate result", async () => {
      api.projects.start.mutate.mockResolvedValueOnce({ jobId: "job-123" });
      const result = await startPipeline({ projectId: "proj-1", initialPrompt: "test" } as any);
      expect(result).toEqual({ jobId: "job-123" });
    });
  });

  describe("stopPipeline", () => {
    it("should call projects.stop.mutate with input", async () => {
      const input = { projectId: "proj-1" } as any;
      await stopPipeline(input);
      expect(api.projects.stop.mutate).toHaveBeenCalledWith(input);
    });
  });

  describe("resumePipeline", () => {
    it("should call projects.resume.mutate with input", async () => {
      const input = { projectId: "proj-1" } as any;
      await resumePipeline(input);
      expect(api.projects.resume.mutate).toHaveBeenCalledWith(input);
    });
  });

  describe("regenerateScene", () => {
    it("should call projects.regenerateScene.mutate with input", async () => {
      const input = { projectId: "proj-1", payload: { sceneId: "scene-1", forceRegenerate: true } } as any;
      await regenerateScene(input);
      expect(api.projects.regenerateScene.mutate).toHaveBeenCalledWith(input);
    });
  });

  describe("regenerateFrame", () => {
    it("should call projects.regenerateFrame.mutate with input", async () => {
      const input = {
        projectId: "proj-1",
        payload: { sceneIds: ["scene-1"], assetKeys: ["scene_start_frame"] },
      } as any;
      await regenerateFrame(input);
      expect(api.projects.regenerateFrame.mutate).toHaveBeenCalledWith(input);
    });
  });

  describe("resolveIntervention", () => {
    it("should call projects.resolveIntervention.mutate with input", async () => {
      const input = { projectId: "proj-1", payload: { action: "retry", jobType: "scene", revisedParams: {} } } as any;
      await resolveIntervention(input);
      expect(api.projects.resolveIntervention.mutate).toHaveBeenCalledWith(input);
    });
  });

  describe("requestFullState", () => {
    it("should call projects.requestState.mutate with input", async () => {
      const input = { projectId: "proj-1" } as any;
      await requestFullState(input);
      expect(api.projects.requestState.mutate).toHaveBeenCalledWith(input);
    });
  });

  describe("generateComposites", () => {
    it("should call projects.generateComposites.mutate with input", async () => {
      const input = { imageId: "img-1", inputImages: [], prompt: "" } as any;
      await generateComposites(input);
      expect(api.projects.generateComposites.mutate).toHaveBeenCalledWith(input);
    });
  });

  describe("ts - Asset Generation Functions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe("generateCharacterImage", () => {
      it("should call assets.generateCharacterImage.mutate with input", async () => {
        const input = { projectId: "proj-1", characterId: "char-1", prompt: "test" };
        await generateCharacterImage(input);
        expect(api.assets.generateCharacterImage.mutate).toHaveBeenCalledWith(input);
      });

      it("should return the mutate result", async () => {
        api.assets.generateCharacterImage.mutate.mockResolvedValueOnce({ assetUrl: "char.png" });
        const result = await generateCharacterImage({ projectId: "proj-1", characterId: "char-1" });
        expect(result).toEqual({ assetUrl: "char.png" });
      });
    });

    describe("generateLocationImage", () => {
      it("should call assets.generateLocationImage.mutate with input", async () => {
        const input = { projectId: "proj-1", locationId: "loc-1", prompt: "test" };
        await generateLocationImage(input);
        expect(api.assets.generateLocationImage.mutate).toHaveBeenCalledWith(input);
      });
    });
  });

  describe("ts - Project Functions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe("createProject", () => {
      it("should call projects.create.mutate with input", async () => {
        const input = { name: "New Project" };
        await createProject(input);
        expect(mockMutate).toHaveBeenCalledWith(input);
      });

      it("should return new project id", async () => {
        api.projects.create.mutate.mockResolvedValueOnce({ projectId: "proj-new" });
        const result = await createProject({ name: "Test" });
        expect(result).toEqual({ projectId: "proj-new" });
      });
    });
  });

  describe("ts - Entity Functions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe("patchEntities", () => {
      it("should call entities.patch.mutate with input", async () => {
        const input = { entityType: "character", entityId: "char-1", updates: { name: "New Name" } };
        await patchEntities(input);
        expect(api.entities.patch.mutate).toHaveBeenCalledWith(input);
      });
    });

    describe("patchAsset", () => {
      it("should call assets.patch.mutate with input", async () => {
        const input = { assetId: "asset-1", updates: { name: "New Name" } };
        await patchAsset(input);
        expect(api.assets.patch.mutate).toHaveBeenCalledWith(input);
      });
    });

    describe("deleteEntity", () => {
      it("should call entities.delete.mutate with input", async () => {
        const input = { entityType: "character", entityId: "char-1" };
        await deleteEntity(input);
        expect(api.entities.delete.mutate).toHaveBeenCalledWith(input);
      });
    });
  });

  describe("ts - Mention Functions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe("resolveMentions", () => {
      it("should call mention.resolve.mutate with input", async () => {
        const input = { htmlInput: "<p>@char-1</p>", projectId: "proj-1" };
        await resolveMentions(input);
        expect(api.mention.resolve.mutate).toHaveBeenCalledWith(input);
      });
    });

    describe("registerMentionHandle", () => {
      it("should call mention.register.mutate with input", async () => {
        const input = { handle: "test", entityId: "char-1", entityType: "character" };
        await registerMentionHandle(input);
        expect(api.mention.register.mutate).toHaveBeenCalledWith(input);
      });
    });

    describe("unregisterMentionHandle", () => {
      it("should call mention.unregister.mutate with input", async () => {
        const input = { handle: "test" };
        await unregisterMentionHandle(input);
        expect(api.mention.unregister.mutate).toHaveBeenCalledWith(input);
      });
    });
  });

  describe("ts - Query Functions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe("getSceneAssets", () => {
      it("should call projects.sceneAssets.query with input", async () => {
        const input = { projectId: "proj-1" };
        await getSceneAssets(input);
        expect(api.projects.sceneAssets.query).toHaveBeenCalledWith(input);
      });

      it("should return query result", async () => {
        api.projects.sceneAssets.query.mockResolvedValueOnce([{ id: "asset-1" }]);
        const result = await getSceneAssets({ projectId: "proj-1" });
        expect(result).toEqual([{ id: "asset-1" }]);
      });
    });

    describe("getProjectAssets", () => {
      it("should call projects.assets.query with input", async () => {
        const input = { projectId: "proj-1" };
        await getProjectAssets(input);
        expect(api.projects.assets.query).toHaveBeenCalledWith(input);
      });
    });

    describe("getCharacterAssets", () => {
      it("should call projects.characterAssets.query with input", async () => {
        const input = { projectId: "proj-1" };
        await getCharacterAssets(input);
        expect(api.projects.characterAssets.query).toHaveBeenCalledWith(input);
      });
    });

    describe("getLocationAssets", () => {
      it("should call projects.locationAssets.query with input", async () => {
        const input = { projectId: "proj-1" };
        await getLocationAssets(input);
        expect(api.projects.locationAssets.query).toHaveBeenCalledWith(input);
      });
    });

    describe("getProjects", () => {
      it("should call projects.list.query with input", async () => {
        const input = {};
        await getProjects(input);
        expect(api.projects.list.query).toHaveBeenCalledWith(input);
      });

      it("should return projects list", async () => {
        api.projects.list.query.mockResolvedValueOnce([{ id: "proj-1" }, { id: "proj-2" }]);
        const result = await getProjects({});
        expect(result).toEqual([{ id: "proj-1" }, { id: "proj-2" }]);
      });
    });

    describe("fetchActiveJobsForProject", () => {
      it("should call jobs.list.query with input", async () => {
        const input = { projectId: "proj-1" };
        await fetchActiveJobsForProject(input);
        expect(api.jobs.list.query).toHaveBeenCalledWith(input);
      });
    });

    describe("getCommandStatus", () => {
      it("should call projects.command.query with input", async () => {
        const input = { projectId: "proj-1" };
        await getCommandStatus(input);
        expect(api.projects.command.query).toHaveBeenCalledWith(input);
      });
    });

    describe("getMentionSuggestions", () => {
      it("should call mention.suggest.query with input", async () => {
        const input = { projectId: "proj-1", query: "@" };
        await getMentionSuggestions(input);
        expect(api.mention.suggest.query).toHaveBeenCalledWith(input);
      });
    });

    describe("getMentionHandle", () => {
      it("should call mention.getHandle.query with input", async () => {
        const input = { entityId: "char-1" };
        await getMentionHandle(input);
        expect(api.mention.getHandle.query).toHaveBeenCalledWith(input);
      });
    });
  });

  describe("ts - Node Functions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe("createEntityWithPendingNode", () => {
      it("creates a pending node and returns id and pendingNodeId", () => {
        const result = createEntityWithPendingNode({
          entityType: "character",
          projectId: "proj-1",
          contextId: "proj-1",
          contextType: "project",
          scope: "project",
          data: { name: "John" },
        });

        expect(result.id).toMatch(/^pending_/);
        expect(result.pendingNodeId).toBe(result.id);
      });

      it("uses provided position when passed", () => {
        const result = createEntityWithPendingNode({
          entityType: "location",
          projectId: "proj-1",
          contextId: "proj-1",
          contextType: "project",
          scope: "project",
          posCanvas: { x: 50, y: 100 },
        });

        expect(result.id).toMatch(/^pending_/);
      });

      it("returns same id for both id and pendingNodeId", () => {
        const result = createEntityWithPendingNode({
          entityType: "scene",
          projectId: "proj-1",
          contextId: "proj-1",
          contextType: "project",
          scope: "project",
        });

        expect(result.id).toBe(result.pendingNodeId);
      });

      it("adds node to store", () => {
        createEntityWithPendingNode({
          entityType: "character",
          projectId: "proj-1",
          contextId: "proj-1",
          contextType: "project",
          scope: "project",
        });

        expect(useNodeStore.getState().nodes.length).toBe(1);
      });
    });

    describe("confirmEntityNode", () => {
      it("handles promotion when pending id matches confirmed id", () => {
        const result = createEntityWithPendingNode({
          entityType: "character",
          projectId: "proj-1",
          contextId: "proj-1",
          contextType: "project",
          scope: "project",
        });

        expect(() => confirmEntityNode(result.pendingNodeId, result.id)).not.toThrow();
      });

      it("handles replacement when server returns different id", () => {
        const result = createEntityWithPendingNode({
          entityType: "character",
          projectId: "proj-1",
          contextId: "proj-1",
          contextType: "project",
          scope: "project",
        });

        expect(() => confirmEntityNode(result.pendingNodeId, "server-new-id", { name: "New Name" })).not.toThrow();
      });

      it("handles non-existent pending node gracefully", () => {
        expect(() => confirmEntityNode("non-existent", "server-id", {})).not.toThrow();
      });

      it("replaces node when server returns different id", () => {
        const result = createEntityWithPendingNode({
          entityType: "character",
          projectId: "proj-1",
          contextId: "proj-1",
          contextType: "project",
          scope: "project",
        });

        confirmEntityNode(result.pendingNodeId, "server-id-123", { name: "Confirmed" });

        // Should delete old pending node and add new node
        expect(useNodeStore.getState().nodes.length).toBe(1);
        expect(useNodeStore.getState().nodes[0].id).toBe("server-id-123");
      });
    });
  });

  describe("api - Type Exports", () => {
    it("should export EntityPrimitiveType type", () => {
      expect(EntityPrimitiveType).toBeDefined();
    });

    it("should export ResolveMentionsRequest interface", () => {
      // Just verify the type is exported by checking it exists - runtime check
      expect(ResolveMentionsRequest).toBeDefined();
    });

    it("should export ResolveMentionsResponse interface", () => {
      expect(ResolveMentionsResponse).toBeDefined();
    });

    it("should export MentionSuggestion interface", () => {
      expect(MentionSuggestion).toBeDefined();
    });

    it("should export SuggestMentionsResponse interface", () => {
      expect(SuggestMentionsResponse).toBeDefined();
    });
  });
});
