import { describe, it, expect, beforeEach, vi } from "vitest";
import { ContinuityManagerAgent } from "#shared/agents/continuity-manager.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { GCPStorageManager } from "#shared/services/storage-manager.js";
import { Project } from "#shared/types/schema.types.js";
import { Scene } from "#shared/types/workflow.types.js";
import * as assetsUtils from "#shared/utils/assets.utils.js";
import { createMockStorageManager } from "#shared/mocks/mock-storage-manager.js";
import { createMockAssetManager } from "#shared/mocks/mock-asset-manager.js";
import { createMockTextModel } from "#shared/mocks/mock-model.js";
import { createMockQualityAgent } from "#shared/mocks/mock-quality-agent.js";
import { createMockFrameComposer } from "#shared/mocks/mock-frame-composer.js";
import { createMockScene } from "#shared/mocks/mock-scene.js";
import { createMockProject } from "#shared/mocks/mock-project.js";
import { evolveCharacterState, evolveLocationState } from "#shared/agents/state-evolution.ts";
import { hydrateEntity, hydrateProject } from "#shared/utils/entity.utils.ts";
import { generateId } from "#shared/utils/id.ts";
import { createMockLocation } from "#shared/mocks/mock-location.ts";
import { createMockCharacter } from "#shared/mocks/mock-character.ts";

vi.mock("#shared/lm/text-model-controller.js");
vi.mock("#shared/agents/quality-check-agent.js");
vi.mock("#shared/services/storage-manager.js");
vi.mock("#shared/services/asset-version-manager.js");
vi.mock("#shared/agents/state-evolution.ts", () => ({
  evolveCharacterState: vi.fn(),
  evolveLocationState: vi.fn(),
}));

describe("ContinuityManagerAgent Asset Management", () => {
  let continuityAgent: ContinuityManagerAgent;
  let mockTextModel: TextModelController;
  let mockImageModel: TextModelController;
  let mockQualityAgent: any;
  let mockStorageManager: GCPStorageManager;
  let mockAssetManager: any;
  let mockFrameComposer: ReturnType<typeof createMockFrameComposer>;

  let projectId = generateId();

  beforeEach(() => {
    vi.clearAllMocks();

    mockTextModel = createMockTextModel();
    mockImageModel = createMockTextModel();
    mockQualityAgent = createMockQualityAgent();
    mockStorageManager = createMockStorageManager();
    mockAssetManager = createMockAssetManager();
    mockFrameComposer = createMockFrameComposer();

    continuityAgent = new ContinuityManagerAgent(
      mockTextModel,
      mockImageModel,
      mockQualityAgent,
      mockStorageManager,
      mockAssetManager,
    );
  });

  describe("generateSceneFramesBatch", () => {
    it("should call sendEntityUpdate with complete status on success", async () => {
      const scene = createMockScene({
        id: "scene-1",
        sceneIndex: 0,
        characterIds: ["char-1"],
        locationId: "loc-1",
        projectId,
        name: "Scene 1",
        startTime: 0,
        endTime: 10,
        duration: 10,
        intensity: "high",
        mood: "dramatic",
        tempo: "fast",
        transitionType: "Cut",
        shotType: "Medium Close-Up",
        cameraAngle: "Eye Level",
        cameraMovement: "Static",
        characterReferenceIds: ["char-ref-1"],
        locationReferenceId: "loc-ref-1",
        status: "pending",
      });

      const project = createMockProject({
        id: projectId,
        scenes: [scene],
        characters: [{ id: "char-1" } as any],
        locations: [{ id: "loc-1" } as any],
        generationRules: ["rule1", "rule2"],
      });

      const scenes = [scene];
      const scopeAssetKeys: ("scene_start_frame" | "scene_end_frame")[] = ["scene_start_frame", "scene_end_frame"];

      const mockSaveAssets = vi.fn();
      const mockSendUpdateScenes = vi.fn();
      const mockIncrementAttempt = vi.fn();

      mockFrameComposer.generateFrames.mockResolvedValue(
        new Map([
          [
            "scene-1_scene_start_frame",
            {
              success: true,
              outputs: [{ uri: "url1", version: 1 }],
              metadata: { model: "test", prompt: "test" },
            } as any,
          ],
          [
            "scene-1_scene_end_frame",
            {
              success: true,
              outputs: [{ uri: "url2", version: 1 }],
              metadata: { model: "test", prompt: "test" },
            } as any,
          ],
        ]),
      );

      await continuityAgent.generateSceneFramesBatch(
        project as any,
        scenes as any,
        scopeAssetKeys,
        mockSaveAssets,
        mockSendUpdateScenes,
        mockIncrementAttempt,
      );

      expect(mockSendUpdateScenes).toHaveBeenCalled();
      const updateCall = mockSendUpdateScenes.mock.calls[0];
      expect(updateCall.at(-1)).toEqual([
        { id: "scene-1", entityType: "scene", entity: expect.objectContaining({ id: "scene-1", status: "pending" }) },
      ]);
    });

    it("should handle failure when frame generation fails", async () => {
      const scene = createMockScene({
        id: "scene-1",
        sceneIndex: 0,
        characterIds: [],
        locationId: "loc-1",
        projectId,
        name: "Scene 1",
        startTime: 0,
        endTime: 10,
        duration: 10,
        intensity: "high",
        mood: "dramatic",
        tempo: "fast",
        transitionType: "Cut",
        shotType: "Medium Close-Up",
        cameraAngle: "Eye Level",
        cameraMovement: "Static",
        characterReferenceIds: [],
        locationReferenceId: "loc-ref-1",
        status: "pending",
      });

      const project = createMockProject({
        id: projectId,
        scenes: [scene],
        characters: [],
        locations: [{ id: "loc-1" } as any],
        generationRules: [],
      });

      const scenes = [scene];
      const scopeAssetKeys: ("scene_start_frame" | "scene_end_frame")[] = ["scene_start_frame"];

      const mockSaveAssets = vi.fn();
      const mockSendUpdateScenes = vi.fn();
      const mockIncrementAttempt = vi.fn();

      mockFrameComposer.generateFrames.mockResolvedValue(
        new Map([["scene-1_scene_start_frame", { success: false, error: new Error("Generation failed") } as any]]),
      );

      const result = await continuityAgent.generateSceneFramesBatch(
        project as any,
        scenes as any,
        scopeAssetKeys,
        mockSaveAssets,
        mockSendUpdateScenes,
        mockIncrementAttempt,
      );

      expect(mockSendUpdateScenes).toHaveBeenCalled();
      const updateCall = mockSendUpdateScenes.mock.calls[0];
      expect(updateCall[0][0].entity.status).toBe("pending");
    });

    it("should defer scene generation when transitionType is Continuous or None and previous scene end-frame is missing", async () => {
      vi.spyOn(assetsUtils, "getAllBestAssets").mockReturnValue({});

      const scene1 = createMockScene({
        id: "scene-1",
        sceneIndex: 0,
        characterIds: [],
        locationId: "loc-1",
        projectId,
        name: "Scene 1",
        startTime: 0,
        endTime: 10,
        duration: 10,
        intensity: "high",
        mood: "dramatic",
        tempo: "fast",
        transitionType: "Cut",
        shotType: "Medium Close-Up",
        cameraAngle: "Eye Level",
        cameraMovement: "Static",
        characterReferenceIds: [],
        locationReferenceId: "loc-ref-1",
        status: "pending",
      });

      const scene2 = createMockScene({
        id: "scene-2",
        sceneIndex: 1,
        characterIds: [],
        locationId: "loc-1",
        projectId,
        name: "Scene 2",
        startTime: 10,
        endTime: 20,
        duration: 10,
        intensity: "high",
        mood: "dramatic",
        tempo: "fast",
        transitionType: "Continuous",
        shotType: "Medium Close-Up",
        cameraAngle: "Eye Level",
        cameraMovement: "Static",
        characterReferenceIds: [],
        locationReferenceId: "loc-ref-1",
        status: "pending",
      });

      const project = createMockProject({
        id: projectId,
        scenes: [scene1, scene2],
        characters: [],
        locations: [{ id: "loc-1" } as any],
        generationRules: [],
      });

      const scenes = [scene2];
      const scopeAssetKeys: ("scene_start_frame" | "scene_end_frame")[] = ["scene_start_frame"];

      const mockSaveAssets = vi.fn();
      const mockSendUpdateScenes = vi.fn();
      const mockIncrementAttempt = vi.fn();

      const result = await continuityAgent.generateSceneFramesBatch(
        project as any,
        scenes as any,
        scopeAssetKeys,
        mockSaveAssets,
        mockSendUpdateScenes,
        mockIncrementAttempt,
      );

      expect(result.data.deferredSceneIds).toContain("scene-2");
      expect(mockFrameComposer.generateFrameGenerationPrompts).not.toHaveBeenCalled();
      expect(mockSendUpdateScenes).toHaveBeenCalled();
      const updateCall = mockSendUpdateScenes.mock.calls[0];
      expect(updateCall[0][0].entity.status).toBe("pending");
    });

    it("should link previous scene end-frame when transitionType is Continuous or None and dependency exists", async () => {
      const prevEndFrameUrl = "gs://bucket/proj-1/scene-1/end-frame.png";
      vi.spyOn(assetsUtils, "getAllBestAssets").mockReturnValue({
        scene_end_frame: { data: prevEndFrameUrl } as any,
      });

      const scene1 = createMockScene({
        id: "scene-1",
        sceneIndex: 0,
        characterIds: [],
        locationId: "loc-1",
        projectId,
        name: "Scene 1",
        startTime: 0,
        endTime: 10,
        duration: 10,
        intensity: "high",
        mood: "dramatic",
        tempo: "fast",
        transitionType: "Cut",
        shotType: "Medium Close-Up",
        cameraAngle: "Eye Level",
        cameraMovement: "Static",
        characterReferenceIds: [],
        locationReferenceId: "loc-ref-1",
        status: "pending",
      });

      const scene2 = createMockScene({
        id: "scene-2",
        sceneIndex: 1,
        characterIds: [],
        locationId: "loc-1",
        projectId,
        name: "Scene 2",
        startTime: 10,
        endTime: 20,
        duration: 10,
        intensity: "high",
        mood: "dramatic",
        tempo: "fast",
        transitionType: "Continuous",
        shotType: "Medium Close-Up",
        cameraAngle: "Eye Level",
        cameraMovement: "Static",
        characterReferenceIds: [],
        locationReferenceId: "loc-ref-1",
        status: "pending",
      });

      const project = createMockProject({
        id: projectId,
        scenes: [scene1, scene2],
        characters: [],
        locations: [{ id: "loc-1" } as any],
        generationRules: [],
      });

      const scenes = [scene2];
      const scopeAssetKeys: ("scene_start_frame" | "scene_end_frame")[] = ["scene_start_frame"];

      const mockSaveAssets = vi.fn();
      const mockSendUpdateScenes = vi.fn();
      const mockIncrementAttempt = vi.fn();

      const result = await continuityAgent.generateSceneFramesBatch(
        project as any,
        scenes as any,
        scopeAssetKeys,
        mockSaveAssets,
        mockSendUpdateScenes,
        mockIncrementAttempt,
      );

      expect(mockSaveAssets).toHaveBeenCalledWith(
        { projectId, sceneIds: ["scene-2"] },
        ["scene_start_frame"],
        "image",
        [prevEndFrameUrl],
        [{ model: "linked", prompt: "Continuity link from previous scene" }],
        true,
      );

      expect(result.data.deferredSceneIds).toContain("scene-2");
      expect(mockFrameComposer.generateFrameGenerationPrompts).not.toHaveBeenCalled();
    });
  });

  describe("prepareAndRefineSceneInputs", () => {
    let continuityAgent: ContinuityManagerAgent;
    let mockTextModel: TextModelController;
    let mockImageModel: TextModelController;
    let mockQualityAgent: any;
    let mockStorageManager: GCPStorageManager;
    let mockAssetManager: any;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.restoreAllMocks();

      mockTextModel = createMockTextModel();
      mockImageModel = createMockTextModel();
      mockQualityAgent = createMockQualityAgent();
      mockStorageManager = createMockStorageManager();
      mockAssetManager = createMockAssetManager();

      continuityAgent = new ContinuityManagerAgent(
        mockTextModel,
        mockImageModel,
        mockQualityAgent,
        mockStorageManager,
        mockAssetManager,
      );
    });

    it("should prepare scene inputs with reference images", async () => {
      const unhydrated = createMockScene({
        id: "scene-1",
        sceneIndex: 0,
        projectId,
        description: "A dramatic scene",
        duration: 10,
        characterIds: ["char-1"],
        locationId: "loc-1",
        assets: {
          scene_start_frame: "gs://bucket/start.jpg",
          scene_end_frame: "gs://bucket/end.jpg",
        },
      });
      const scene = hydrateEntity(unhydrated, unhydrated.assets);

      const unhydratedProject = createMockProject({
        id: projectId,
        scenes: [scene],
        characters: [
          createMockCharacter({
            id: "char-1",
            projectId,
            name: "John",
            assets: {
              character_image: "gs://bucket/char.jpg",
            },
          }),
        ],
        locations: [
          createMockLocation({
            id: "loc-1",
            projectId,
            name: "Office",
            assets: {
              location_image: ["gs://bucket/loc.jpg"],
            },
          }),
        ],
        generationRules: ["rule1"],
        metadata: { title: "Test" },
      });
      const project = hydrateProject(unhydratedProject);

      const result = await continuityAgent.prepareAndRefineSceneInputs(
        scene,
        project,
        "Enhanced prompt for scene",
        vi.fn(),
      );

      expect(result).toBeDefined();
      expect(result.enhancedPrompt).toBe("Enhanced prompt for scene");
      expect(result.sceneCharacters).toHaveLength(1);
      expect(result.sceneCharacters[0].id).toBe("char-1");
      expect(result.location).toBeDefined();
      expect(result.location.id).toBe("loc-1");
      expect(result.characterReferenceImages.length).toBeGreaterThan(0);
      expect(result.locationReferenceImages.length).toBeGreaterThan(0);
    });

    it("should throw error if project metadata is missing", async () => {
      const scene: Scene = {
        id: "scene-1",
        projectId,
      } as any;

      const project: HydratedProject = {
        id: projectId,
        metadata: undefined as any,
      } as any;

      await expect(continuityAgent.prepareAndRefineSceneInputs(scene, project, "prompt", vi.fn())).rejects.toThrow(
        "No metadata available",
      );
    });

    it("should throw error if characters data is missing", async () => {
      const scene: Scene = {
        id: "scene-1",
        projectId,
      } as any;

      const project: HydratedProject = {
        id: projectId,
        metadata: { title: "Test" },
        characters: undefined as any,
      } as any;

      await expect(continuityAgent.prepareAndRefineSceneInputs(scene, project, "prompt", vi.fn())).rejects.toThrow(
        "No characters data available",
      );
    });

    it("should throw error if locations data is missing", async () => {
      const scene: Scene = {
        id: "scene-1",
        projectId,
      } as any;

      const project: HydratedProject = {
        id: projectId,
        metadata: { title: "Test" },
        characters: [],
        locations: undefined as any,
      } as any;

      await expect(continuityAgent.prepareAndRefineSceneInputs(scene, project, "prompt", vi.fn())).rejects.toThrow(
        "No locations data available",
      );
    });

    it("should throw error if scenes data is missing", async () => {
      const scene: Scene = {
        id: "scene-1",
        projectId,
      } as any;

      const project: HydratedProject = {
        id: projectId,
        metadata: { title: "Test" },
        characters: [],
        locations: [],
        scenes: undefined as any,
      } as any;

      await expect(continuityAgent.prepareAndRefineSceneInputs(scene, project, "prompt", vi.fn())).rejects.toThrow(
        "No scenes data available",
      );
    });

    it("should throw error if location is not found", async () => {
      const scene: Scene = {
        id: "scene-1",
        projectId,
        locationId: "non-existent",
      } as any;

      const project: HydratedProject = {
        id: projectId,
        metadata: { title: "Test" },
        characters: [],
        locations: [],
        scenes: [scene],
      } as any;

      await expect(continuityAgent.prepareAndRefineSceneInputs(scene, project, "prompt", vi.fn())).rejects.toThrow(
        "Location not found for scene scene-1",
      );
    });

    it("should use provided prompt if available", async () => {
      const scene: Scene = {
        id: "scene-1",
        sceneIndex: 0,
        projectId,
        description: "A scene",
        duration: 10,
        characterIds: [],
        locationId: "loc-1",
      } as any;

      const project: HydratedProject = {
        id: projectId,
        scenes: [scene],
        characters: [],
        locations: [{ id: "loc-1", projectId, name: "Office" } as any],
        generationRules: [],
        metadata: { title: "Test" },
      } as any;

      const result = await continuityAgent.prepareAndRefineSceneInputs(scene, project, "Custom prompt", vi.fn());

      expect(result.enhancedPrompt).toBe("Custom prompt");
    });
  });

  describe("updateNarrativeState", () => {
    let continuityAgent: ContinuityManagerAgent;
    let mockTextModel: TextModelController;
    let mockImageModel: TextModelController;
    let mockQualityAgent: any;
    let mockStorageManager: GCPStorageManager;
    let mockAssetManager: any;

    beforeEach(() => {
      vi.clearAllMocks();

      mockTextModel = createMockTextModel();
      mockImageModel = createMockTextModel();
      mockQualityAgent = createMockQualityAgent();
      mockStorageManager = createMockStorageManager();
      mockAssetManager = createMockAssetManager();

      continuityAgent = new ContinuityManagerAgent(
        mockTextModel,
        mockImageModel,
        mockQualityAgent,
        mockStorageManager,
        mockAssetManager,
      );

      vi.mocked(evolveCharacterState).mockReturnValue({} as any);
      vi.mocked(evolveLocationState).mockReturnValue({} as any);
    });

    it("should update character states based on scene", () => {
      const scene: Scene = {
        id: "scene-2",
        sceneIndex: 1,
        projectId,
        description: "John enters the room",
        characterIds: ["char-1"],
      } as any;

      const project: Project = {
        id: projectId,
        characters: [
          {
            id: "char-1",
            projectId,
            name: "John",
            state: {
              lastSeen: "scene-1",
              emotionalState: "neutral",
            },
          } as any,
        ],
        locations: [],
        scenes: [scene],
      } as any;

      const result = continuityAgent.updateNarrativeState(scene, project);

      expect(result).toBeDefined();
      expect(result.characters).toHaveLength(1);
      expect(evolveCharacterState).toHaveBeenCalledWith(project.characters[0], scene, scene.description);
    });

    it("should update location states based on scene", () => {
      const scene: Scene = {
        id: "scene-1",
        sceneIndex: 0,
        projectId,
        description: "A scene in the office",
        locationId: "loc-1",
      } as any;

      const project: Project = {
        id: projectId,
        characters: [],
        locations: [
          {
            id: "loc-1",
            projectId,
            state: {
              lastUsed: "scene-0",
              weather: "Clear",
            },
          } as any,
        ],
        scenes: [scene],
      } as any;

      const result = continuityAgent.updateNarrativeState(scene, project);

      expect(result).toBeDefined();
      expect(result.locations).toHaveLength(1);
      expect(evolveLocationState).toHaveBeenCalledWith(project.locations[0], scene, scene.description);
    });

    it("should update scene in project", () => {
      const updatedScene: Scene = {
        id: "scene-1",
        sceneIndex: 0,
        projectId,
        description: "Updated scene",
      } as any;

      const project: Project = {
        id: projectId,
        characters: [],
        locations: [],
        scenes: [
          { id: "scene-1", sceneIndex: 0, projectId } as any,
          { id: "scene-2", sceneIndex: 1, projectId } as any,
        ],
      } as any;

      const result = continuityAgent.updateNarrativeState(updatedScene, project);

      expect(result.scenes).toHaveLength(2);
      expect(result.scenes[0]).toEqual(updatedScene);
      expect(result.scenes[1].id).toBe("scene-2");
    });

    it("should not modify characters not in scene", () => {
      const unhydrated = createMockScene({
        id: "scene-1",
        sceneIndex: 0,
        projectId,
        description: "A scene",
        characterIds: ["char-1"],
      });
      const scene = hydrateEntity(unhydrated, unhydrated.assets);

      const unhydratedProject = createMockProject({
        id: projectId,
        characters: [
          createMockCharacter({
            id: "char-1",
            projectId,
          }),
          createMockCharacter({
            id: "char-2",
            projectId,
          }),
        ],
        locations: [],
        scenes: [scene],
      });
      const project = hydrateProject(unhydratedProject);

      const result = continuityAgent.updateNarrativeState(scene, project);
      expect(evolveCharacterState).toHaveBeenCalledTimes(1);
      expect(evolveCharacterState).toHaveBeenCalledWith(project.characters[0], scene, scene.description);
    });

    it("should not modify locations not used in scene", () => {
      const unhydrated = createMockScene({
        sceneIndex: 0,
        projectId,
        description: "A scene",
        locationId: "loc-1",
      });
      const scene = hydrateEntity(unhydrated, unhydrated.assets);

      const unhydratedProject = createMockProject({
        id: projectId,
        characters: [],
        locations: [createMockLocation({ id: "loc-1" }), createMockLocation({ id: "loc-2", projectId })],
        scenes: [scene],
      });

      const project = hydrateProject(unhydratedProject);
      const result = continuityAgent.updateNarrativeState(scene, project);
      expect(evolveLocationState).toHaveBeenCalledTimes(1);
      expect(evolveLocationState).toHaveBeenCalledWith(project.locations[0], scene, scene.description);
    });
  });
});
