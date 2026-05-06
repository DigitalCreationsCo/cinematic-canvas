import { createMockScene } from "../../mocks/mock-scene.js";
import { createMockCharacter } from "../../mocks/mock-character.js";
import { createMockLocation } from "../../mocks/mock-location.js";

import { describe, it, expect, vi } from "vitest";
import {
  buildQualityControlPrompt,
  buildQualityControlVideoPrompt,
  buildQualityControlFramePrompt,
} from "#shared/prompts/quality-control.prompt.js";
import { composeSceneSpecs } from "#shared/prompts/prompt.utils.js";
import { hydrateEntity } from "#shared/utils/entity.utils.js";

describe("Role Quality Control Asset Access Patterns", () => {
  describe("buildQualityControlVideoPrompt (previous scene context)", () => {
    it("should include previous scene end frame via getAllBestAssets", () => {
      const previousScene = createMockScene({
        assets: { scene_end_frame: ["old-end-frame.jpg", "previous-end-frame.jpg"] },
      });
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(currentScene, currentScene.assets),
        characters.map((c) => hydrateEntity(c, c.assets)),
        hydrateEntity(location, location.assets),
        hydrateEntity(previousScene, previousScene.assets),
      );

      const prompt = buildQualityControlVideoPrompt(
        hydrateEntity(currentScene, currentScene.assets),
        "test-video-url",
        "enhanced-prompt",
        sceneSpecs,
        {} as any,
        characters.map((c) => hydrateEntity(c, c.assets)),
        hydrateEntity(previousScene, previousScene.assets),
        ["generation-rules"],
      );

      expect(prompt).toContain("previous-end-frame.jpg");
      // The old version (version 0) should NOT appear — only the best version
      expect(prompt).not.toContain("old-end-frame.jpg");
    });

    it("should handle missing previous scene end frame gracefully", () => {
      const previousScene = createMockScene();
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(currentScene, currentScene.assets),
        characters.map((c) => hydrateEntity(c, c.assets)),
        hydrateEntity(location, location.assets),
        hydrateEntity(previousScene, previousScene.assets),
      );

      const prompt = buildQualityControlVideoPrompt(
        hydrateEntity(currentScene, currentScene.assets),
        "test-video-url",
        "enhanced-prompt",
        sceneSpecs,
        {} as any,
        characters.map((c) => hydrateEntity(c, c.assets)),
        hydrateEntity(previousScene, previousScene.assets),
        ["generation-rules"],
      );

      expect(prompt).toContain("N/A");
    });

    it("should handle no previous scene", () => {
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(currentScene, currentScene.assets),
        characters.map((c) => hydrateEntity(c, c.assets)),
        hydrateEntity(location, location.assets),
        undefined,
      );

      const prompt = buildQualityControlVideoPrompt(
        hydrateEntity(currentScene, currentScene.assets),
        "test-video-url",
        "enhanced-prompt",
        sceneSpecs,
        {} as any,
        characters.map((c) => hydrateEntity(c, c.assets)),
        undefined,
        ["generation-rules"],
      );

      expect(prompt).toContain("This is the first scene - no previous context.");
      expect(prompt).not.toContain("PREVIOUS SCENE CONTEXT");
    });

    it("should include all scene context information", () => {
      const previousScene = createMockScene({
        description: "Test scene description",
      });
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(currentScene, currentScene.assets),
        characters.map((c) => hydrateEntity(c, c.assets)),
        hydrateEntity(location, location.assets),
        hydrateEntity(previousScene, previousScene.assets),
      );

      const prompt = buildQualityControlVideoPrompt(
        hydrateEntity(currentScene, currentScene.assets),
        "test-video-url",
        "enhanced-prompt",
        sceneSpecs,
        {} as any,
        characters.map((c) => hydrateEntity(c, c.assets)),
        hydrateEntity(previousScene, previousScene.assets),
        ["generation-rules"],
      );

      // Check that previous scene description is included in the prompt
      expect(prompt).toContain("Test scene description");
      expect(prompt).toContain("enhanced-prompt");
      expect(prompt).toContain("Test Character");
      expect(prompt).toContain('"Subject Placement"');
      expect(prompt).toContain(characters[0].referenceId);
    });
  });

  describe("buildQualityControlPrompt (basic/no-context)", () => {
    it("should contain evaluation rubric for video asset type", () => {
      const scene = createMockScene();
      const characters = [createMockCharacter()];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(scene, scene.assets),
        characters.map((c) => hydrateEntity(c, c.assets)),
        hydrateEntity(location, location.assets),
      );

      const prompt = buildQualityControlPrompt(
        hydrateEntity(scene, scene.assets),
        "asset-url",
        "video",
        sceneSpecs,
        {} as any,
        ["generation-rules"],
      );

      expect(prompt).toContain("NARRATIVE FIDELITY");
      expect(prompt).toContain("COMPOSITION QUALITY");
      expect(prompt).toContain("LIGHTING QUALITY");
    });
  });

  describe("buildQualityControlFramePrompt (keyframe context)", () => {
    it("should include frame position information", () => {
      const scene = createMockScene();
      const characters = [createMockCharacter()];
      const locations = [createMockLocation()];

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(scene, scene.assets),
        characters.map((c) => hydrateEntity(c, c.assets)),
        hydrateEntity(locations[0], locations[0].assets),
      );

      const prompt = buildQualityControlFramePrompt(
        hydrateEntity(scene, scene.assets),
        "frame-url",
        "start",
        sceneSpecs,
        {} as any,
        characters.map((c) => hydrateEntity(c, c.assets)),
        locations,
        undefined,
        ["generation-rules"],
      );

      expect(prompt).toContain("FRAME POSITION: START");
      expect(prompt).toContain("BEGINNING state for the action");
    });

    it("should include character reference images", () => {
      const scene = createMockScene();
      const characters = [
        createMockCharacter({
          assets: { character_image: "char-image.jpg" },
        }),
      ];
      const locations = [createMockLocation()];

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(scene, scene.assets),
        characters.map((c) => hydrateEntity(c, c.assets)),
        hydrateEntity(locations[0], locations[0].assets),
      );

      const prompt = buildQualityControlFramePrompt(
        hydrateEntity(scene, scene.assets),
        "frame-url",
        "end",
        sceneSpecs,
        {} as any,
        characters.map((c) => hydrateEntity(c, c.assets)),
        locations,
        undefined,
        ["generation-rules"],
      );

      expect(prompt).toContain("char-image.jpg");
    });

    it("should include location reference images", () => {
      const scene = createMockScene();
      const characters = [createMockCharacter()];
      const locations = [
        createMockLocation({
          assets: { location_image: "loc-image.jpg" },
        }),
      ];

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(scene, scene.assets),
        characters.map((c) => hydrateEntity(c, c.assets)),
        hydrateEntity(locations[0], locations[0].assets),
      );

      const prompt = buildQualityControlFramePrompt(
        hydrateEntity(scene, scene.assets),
        "frame-url",
        "end",
        sceneSpecs,
        {} as any,
        characters.map((c) => hydrateEntity(c, c.assets)),
        locations,
        undefined,
        ["generation-rules"],
      );

      expect(prompt).toContain("loc-image.jpg");
    });

    it("should handle missing previous frame", () => {
      const scene = createMockScene();
      const characters = [createMockCharacter()];
      const locations = [createMockLocation()];

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(scene, scene.assets),
        characters.map((c) => hydrateEntity(c, c.assets)),
        hydrateEntity(locations[0], locations[0].assets),
      );

      const prompt = buildQualityControlFramePrompt(
        hydrateEntity(scene, scene.assets),
        "frame-url",
        "start",
        sceneSpecs,
        {} as any,
        characters.map((c) => hydrateEntity(c, c.assets)),
        locations,
        undefined,
        ["generation-rules"],
      );

      expect(prompt).toContain("No previous frame (first scene)");
    });

    it("should include previous frame reference when available", () => {
      const scene = createMockScene();
      const characters = [createMockCharacter()];
      const locations = [createMockLocation()];
      const previousFrame = { url: "previous-frame.jpg" };

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(scene, scene.assets),
        characters.map((c) => hydrateEntity(c, c.assets)),
        hydrateEntity(locations[0], locations[0].assets),
      );

      const prompt = buildQualityControlFramePrompt(
        hydrateEntity(scene, scene.assets),
        "frame-url",
        "end",
        sceneSpecs,
        {} as any,
        characters.map((c) => hydrateEntity(c, c.assets)),
        locations,
        previousFrame,
        ["generation-rules"],
      );

      expect(prompt).toContain("previous-frame.jpg");
    });
  });
});
