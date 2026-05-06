import { describe, it, expect } from "vitest";
import { isValidDuration, VALID_DURATIONS } from "../../shared/types/base.types.js";
import { isLyricalScene, isInstrumentalScene, requiresTransition } from "../../shared/types/workflow.types.js";
import { Scene } from "../../shared/types/workflow.types.js";

describe("Type Guards", () => {
  describe("isValidDuration", () => {
    it("should return true for valid durations", () => {
      for (const duration of VALID_DURATIONS) {
        expect(isValidDuration(duration)).toBe(true);
      }
    });

    it("should return false for other numbers", () => {
      expect(isValidDuration(4)).toBe(false);
      expect(isValidDuration(10)).toBe(false);
      expect(isValidDuration(0)).toBe(false);
    });
  });

  describe("isLyricalScene", () => {
    it("should return true if audioSync is Lip Sync", () => {
      const scene = { audioSync: "Lip Sync" } as Scene;
      expect(isLyricalScene(scene)).toBe(true);
    });

    it("should return false if description does not include [Instrumental]", () => {
      const scene = { audioSync: "Mood Sync", description: "A scene with lyrics" } as Scene;
      expect(isLyricalScene(scene)).toBe(false);
    });

    it("should return false if description includes [Instrumental]", () => {
      const scene = { audioSync: "Mood Sync", description: "A scene [Instrumental]" } as Scene;
      expect(isLyricalScene(scene)).toBe(false);
    });
  });

  describe("isInstrumentalScene", () => {
    it("should return true if audioSync is Mood Sync", () => {
      const scene = { audioSync: "Mood Sync" } as Scene;
      expect(isInstrumentalScene(scene)).toBe(true);
    });

    it("should return true if description includes [Instrumental]", () => {
      const scene = { audioSync: "Lip Sync", description: "A scene [Instrumental]" } as Scene;
      expect(isInstrumentalScene(scene)).toBe(true);
    });

    it("should return false otherwise", () => {
      const scene = { audioSync: "Lip Sync", description: "A scene with lyrics" } as Scene;
      expect(isInstrumentalScene(scene)).toBe(false);
    });
  });

  describe("requiresTransition", () => {
    it("should return true if transitionType is not Continous or None", () => {
      const scene = { transitionType: "Fade" } as Scene;
      expect(requiresTransition(scene)).toBe(true);
    });

    it("should return true if transitionType is Cut", () => {
      const scene = { transitionType: "Cut" } as Scene;
      expect(requiresTransition(scene)).toBe(true);
    });

    it("should return false if transitionType is None", () => {
      const scene = { transitionType: "None" } as Scene;
      expect(requiresTransition(scene)).toBe(false);
    });

    it("should return false if transitionType is Continuous", () => {
      const scene = { transitionType: "Continuous" } as Scene;
      expect(requiresTransition(scene)).toBe(false);
    });
  });
});
