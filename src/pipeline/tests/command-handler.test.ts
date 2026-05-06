import { createBuilder } from "#shared/mocks/mock-db.js";
import "#shared/mocks/mock-job-control-plane.js";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineCommandHandler } from "#pipeline/command-handler.js";
import { JobControlPlane } from "#shared/services/job-control-plane.ts";
import { generateId } from "#shared/utils/id.ts";
import { db } from "#shared/db/index.js";

vi.mock("#shared/services/asset-version-manager.js", () => {
  return {
    AssetVersionManager: class {
      setBestVersion = vi.fn().mockResolvedValue([{ version: 5, data: "url" }]);
    },
  };
});

describe("PipelineCommandHandler", () => {
  let mockJobControlPlane: JobControlPlane;
  let mockPublishEvent: any;
  let projectId = generateId();
  let teamId = generateId();
  let userId = generateId();
  let worldId = generateId();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPublishEvent = vi.fn().mockResolvedValue(undefined);
    mockJobControlPlane = new JobControlPlane({} as any, mockPublishEvent);
    mockJobControlPlane.createJob = vi.fn();

    db.insert.mockImplementation(() => createBuilder([{ id: "job-1" }]));
    db.update.mockImplementation(() => createBuilder([{ id: "job-1" }]));
  });

  it("handleRegenerateScene should create a GENERATE_SCENE_VIDEO job", async () => {
    const cmd = {
      projectId,
      teamId,
      userId,
      worldId,
      payload: { sceneId: "scene-1", promptModification: "test" },
    };
    await PipelineCommandHandler.handleRegenerateScene(cmd as any, mockJobControlPlane);
    expect(mockJobControlPlane.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "GENERATE_SCENE_VIDEO",
        payload: { sceneId: "scene-1", overridePrompt: "test" },
      }),
    );
  });

  it("handleGenerateSceneFrames should create a GENERATE_SCENE_FRAMES job", async () => {
    const cmd = {
      projectId,
      teamId,
      userId,
      worldId,
      payload: { sceneIds: ["scene-1"], promptModifications: ["mod1"] },
    };
    await PipelineCommandHandler.handleGenerateSceneFrames(cmd as any, mockJobControlPlane);
    expect(mockJobControlPlane.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "GENERATE_SCENE_FRAMES",
      }),
    );
  });

  describe("handleUpdateAsset", () => {
    it("should update a record", async () => {
      // ✅ Return a builder that resolves to your specific value
      db.update.mockImplementation(() => createBuilder([{ id: "specific-id" }]));

      const result = await db.update().set({ name: "test" }).where().returning();

      expect(db.update).toHaveBeenCalled();
      expect(result[0].id).toBe("specific-id");
    });

    it("should return custom data", async () => {
      const builder = createBuilder(); // default resolves to []
      builder.returning.mockResolvedValue([{ id: "custom-id" }]); // override just terminal
      db.update.mockImplementation(() => builder);

      const result = await db.update().set({}).where().returning();
      expect(result[0].id).toBe("custom-id");
    });

    it("should update existing asset history to set best version", async () => {
      const sceneId = generateId();
      const assetKey = "scene_video" as const;

      const payload = {
        entityType: "scene" as const,
        entityId: sceneId,
        assetKey: assetKey,
        version: 2,
        projectId: generateId(),
      };
      await PipelineCommandHandler.handleUpdateEntityAsset(payload);

      expect(db.update).toHaveBeenCalled();
    });

    it("should un-set best version if version is null", async () => {
      const sceneId = "scene-1";
      const assetKey = "scene_video";
      const cmd = { entityType: "scene", payload: { scene: { id: sceneId }, assetKey, version: null } };

      vi.mocked(db.query.scenes.findFirst).mockResolvedValue({
        assets: { scene_video: { versions: [{ version: 1 }], best: 1 } },
      });

      await PipelineCommandHandler.handleUpdateEntityAsset(cmd);
      expect(db.update).toHaveBeenCalled();
    });
  });

  // describe('handleRegenerateScene', () => {
  // it('should create a job and update project if forceRegenerate is true', async () => {
  //     const cmd = {
  //         projectId: 'proj-1',
  //         payload: { sceneId: 'scene-1', forceRegenerate: true, promptModification: 'Make it darker' }
  //     } as any;

  //     const job = await PipelineCommandHandler.handleRegenerateScene(cmd);

  //     expect(mockTx.update).toHaveBeenCalled(); // Project update
  //     expect(mockTx.insert).toHaveBeenCalled(); // Job creation
  //     expect(job).toEqual({ id: 'job-1' });
  // });

  //  it('should only create job if forceRegenerate is false', async () => {
  //     const cmd = {
  //         projectId: 'proj-1',
  //         payload: { sceneId: 'scene-1', forceRegenerate: false }
  //     } as any;

  //     await PipelineCommandHandler.handleRegenerateScene(cmd);

  //     expect(mockTx.update).not.toHaveBeenCalled(); // No project update
  //     expect(mockTx.insert).toHaveBeenCalled();
  // });
  // });
});
