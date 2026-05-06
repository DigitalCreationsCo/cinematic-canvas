import { buildCinematographerGuidelines, buildCinematographerNarrative } from "../role-cinematographer.prompt.js";
import { createMockScene } from "../../mocks/mock-scene.js";
import { describe, it, expect } from "vitest";

describe("buildCinematographerGuidelines", () => {
  it("should include transition types", () => {
    const result = buildCinematographerGuidelines();

    expect(result).toContain("TRANSITION TYPE");
    expect(result).toContain("Continuous");
  });

  it("should include shot types", () => {
    const result = buildCinematographerGuidelines();

    expect(result).toContain("SHOT TYPE");
    expect(result).toContain('value":"Close-Up"');
    expect(result).toContain('value":"Wide Shot"');
  });

  it("should include camera angles", () => {
    const result = buildCinematographerGuidelines();

    expect(result).toContain("CAMERA ANGLE");
    expect(result).toContain('value":"Eye Level"');
    expect(result).toContain('value":"High Angle"');
  });

  it("should include camera movements", () => {
    const result = buildCinematographerGuidelines();

    expect(result).toContain("CAMERA MOVEMENT");
    expect(result).toContain('value":"Static"');
    expect(result).toContain('value":"Pan Left"');
  });

  it("should include composition guidelines", () => {
    const result = buildCinematographerGuidelines();

    expect(result).toContain("COMPOSITION");
    expect(result).toContain("Subject Placement");
    expect(result).toContain("Focal Point");
  });
});

describe("buildCinematographerNarrative", () => {
  it("should describe shot type correctly", () => {
    const scene = createMockScene({
      shotType: "MCU",
      cameraMovement: "Static",
      cameraAngle: "Eye Level",
    });
    const result = buildCinematographerNarrative(scene);

    expect(result).toContain("medium close-up");
    expect(result).toContain("static movement");
    expect(result).toContain("eye level angle");
  });

  it("should handle ECU shot type", () => {
    const scene = createMockScene({ shotType: "ECU" });
    const result = buildCinematographerNarrative(scene);

    expect(result).toContain("extreme close-up");
  });

  it("should handle wide shots", () => {
    const scene = createMockScene({ shotType: "WS" });
    const result = buildCinematographerNarrative(scene);

    expect(result).toContain("wide shot");
  });

  it("should include composition when available", () => {
    const scene = createMockScene();
    const result = buildCinematographerNarrative(scene);

    expect(result).toContain("Subject Placement");
    expect(result).toContain("Center");
  });

  it("should add start frame position text", () => {
    const scene = createMockScene();
    const result = buildCinematographerNarrative(scene, "start");

    expect(result).toContain("beginning of the scene");
  });

  it("should add end frame position text", () => {
    const scene = createMockScene();
    const result = buildCinematographerNarrative(scene, "end");

    expect(result).toContain("end of the scene");
  });

  it("should handle unknown shot types", () => {
    const scene = createMockScene({ shotType: "UNKNOWN" });
    const result = buildCinematographerNarrative(scene);

    expect(result).toContain("unknown");
    // When shot type is not in the map, it uses the lowercase version
    expect(result).toContain("unknown captured");
  });
});
