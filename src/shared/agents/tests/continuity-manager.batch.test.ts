import { createMockStorageManager } from "#shared/mocks/mock-storage-manager.js";
import { createMockAssetManager } from "#shared/mocks/mock-asset-manager.js";
import { createMockTextModel } from "#shared/mocks/mock-model.ts";
import { createMockQualityAgent } from "#shared/mocks/mock-quality-agent.ts";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContinuityManagerAgent } from "#shared/agents/continuity-manager.js";
import { Scene } from "#shared/types/workflow.types.js";
import { Project } from "#shared/types/schema.types.js";

describe("ContinuityManagerAgent - generateSceneFramesBatch", () => {
  let manager: ContinuityManagerAgent;
  const mockSaveAssets = vi.fn();
  const mockUpdateScenes = vi.fn();
  const mockIncrementAttempt = vi.fn();
  const mockRecordMetrics = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Initialize manager with mocked providers...
    manager = new ContinuityManagerAgent(
      createMockTextModel(),
      createMockTextModel(),
      createMockQualityAgent() as any,
      createMockStorageManager() as any,
      createMockAssetManager() as any,
    );
  });

  it("should resolve sequential dependencies within the same batch", async () => {
    const scenes = [
      { id: "scene-1", transitionType: "None", characterIds: [], locationId: "loc-1", assets: {} },
      { id: "scene-1", transitionType: "Cut", characterIds: [], locationId: "loc-1", assets: {} }, //maybe remove Cut here?
      { id: "scene-2", transitionType: "Continuous", characterIds: [], locationId: "loc-1", assets: {} },
    ];
    const project = { id: "proj-1", scenes, characters: [], locations: [{ id: "loc-1", assets: {} }] };

    await manager.generateSceneFramesBatch(
      project as any,
      scenes as any,
      ["scene_end_frame"],
      mockSaveAssets,
      mockUpdateScenes,
      mockIncrementAttempt,
    );

    expect(mockUpdateScenes).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ entity: expect.objectContaining({ id: "scene-1" }) }),
        expect.objectContaining({ entity: expect.objectContaining({ id: "scene-2" }) }),
      ]),
    );
  });

  it("should break loop if no progress is made to prevent infinite execution", async () => {
    const scenes = [{ id: "scene-1", transitionType: "Continuous", characterIds: [], locationId: "loc-1", assets: {} }];
    // Scene 1 depends on Scene 0 which doesn't exist
    const project = { id: "proj-1", scenes, characters: [], locations: [] };

    const result = await manager.generateSceneFramesBatch(
      project as any,
      scenes as any,
      ["scene_start_frame"],
      mockSaveAssets,
      mockUpdateScenes,
      mockIncrementAttempt,
    );

    expect(result.data.deferredSceneIds).toContain("scene-1");
    expect(mockUpdateScenes).toHaveBeenCalled();
  });
});
