import { createMockScene } from "#shared/mocks/mock-scene.js";
import { createMockCharacter } from "#shared/mocks/mock-character.js";
import { createMockLocation } from "#shared/mocks/mock-location.js";

import { buildScriptSupervisorContinuityChecklist } from "#shared/prompts/role-script-supervisor.prompt.js";
import { describe, it, expect } from "vitest";

describe("Role Script Supervisor Asset Access Patterns", () => {
  describe("buildScriptSupervisorContinuityChecklist", () => {
    it("should use getAllBestAssets for previous scene end frame", () => {
      const previousScene = createMockScene({
        assets: { scene_end_frame: ["old-end-frame.jpg", "previous-end-frame.jpg"] },
      });
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const locations = [createMockLocation({ id: currentScene.locationId })];

      const checklist = buildScriptSupervisorContinuityChecklist(currentScene, previousScene, characters, locations);

      expect(checklist).toContain("previous-end-frame.jpg");
      expect(checklist).not.toContain("old-end-frame.jpg");
    });

    it("should handle missing previous scene end frame gracefully", () => {
      const previousScene = createMockScene(); // No end frame
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const locations = [createMockLocation({ id: currentScene.locationId })];

      const checklist = buildScriptSupervisorContinuityChecklist(currentScene, previousScene, characters, locations);

      expect(checklist).not.toContain("Previous Scene End Frame");
    });

    it("should handle no previous scene", () => {
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const locations = [createMockLocation({ id: currentScene.locationId })];

      const checklist = buildScriptSupervisorContinuityChecklist(currentScene, undefined, characters, locations);

      expect(checklist).not.toContain(
        "Exact camera placement, subject, and location continuity from previous scene end frame is needed.",
      );
    });

    it("should include all scene context information", () => {
      const previousScene = createMockScene({ assets: { scene_end_frame: ["end-frame.jpg"] } });
      const currentScene = createMockScene();
      const characters = [createMockCharacter({ name: "New character" })];
      const locations = [createMockLocation({ id: currentScene.locationId, name: "New location" })];

      const checklist = buildScriptSupervisorContinuityChecklist(currentScene, previousScene, characters, locations);

      expect(checklist).toContain("New character");
      expect(checklist).toContain("New location");
    });

    it("should include location information", () => {
      const currentScene = createMockScene();
      const characters = [createMockCharacter({ name: "Character" })];
      const locations = [
        createMockLocation({
          id: currentScene.locationId,
          name: "Location",
          skyOrCeiling: "Ceiling",
        }),
      ];

      const checklist = buildScriptSupervisorContinuityChecklist(currentScene, undefined, characters, locations);

      expect(checklist).toContain(locations[0].name);
      expect(checklist).toContain(locations[0].skyOrCeiling);
    });
  });
});
