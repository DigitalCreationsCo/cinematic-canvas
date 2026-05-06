import { buildLocationImagePrompt } from "../location-reference-image.prompt.js";
import { createMockLocation } from "../../mocks/mock-location.js";
import { describe, it, expect } from "vitest";

describe("buildLocationImagePrompt", () => {
  it("should include location full spec", () => {
    const location = createMockLocation({
      name: "Beach House",
      type: "exterior",
    });
    const prompt = buildLocationImagePrompt(location);

    expect(prompt).toContain("Beach House");
    expect(prompt).toContain("exterior");
  });

  it("should include wide establishing shot instructions", () => {
    const location = createMockLocation();
    const prompt = buildLocationImagePrompt(location);

    expect(prompt).toContain("Wide establishing shot");
    expect(prompt).toContain("eye-level");
    expect(prompt).toContain("wide-angle lens");
    expect(prompt).toContain("Deep depth of field");
  });

  it("should include foreground, midground, background layers", () => {
    const location = createMockLocation();
    const prompt = buildLocationImagePrompt(location);

    expect(prompt).toContain("foreground");
    expect(prompt).toContain("midground");
    expect(prompt).toContain("background");
    expect(prompt).toContain("full scale and depth");
  });

  it("should include generation rules when provided", () => {
    const location = createMockLocation();
    const prompt = buildLocationImagePrompt(location, ["Rule 1", "Rule 2"]);

    expect(prompt).toContain("Rule 1");
    expect(prompt).toContain("Rule 2");
  });

  it("should include location image from assets when available", () => {
    const location = createMockLocation({
      assets: { location_image: "loc-image.jpg" },
    });
    const prompt = buildLocationImagePrompt(location);

    expect(prompt).toContain("loc-image.jpg");
  });

  it("should include environmental features", () => {
    const location = createMockLocation({
      naturalElements: ["palm trees"],
      architecture: ["modern walls"],
      manMadeObjects: ["deck chairs"],
    });
    const prompt = buildLocationImagePrompt(location);

    expect(prompt).toContain("palm trees");
    expect(prompt).toContain("modern walls");
    expect(prompt).toContain("deck chairs");
  });

  it("should include mood and lighting", () => {
    const location = createMockLocation({
      mood: "Tranquil",
    });
    const prompt = buildLocationImagePrompt(location);

    expect(prompt).toContain("Tranquil");
  });
});
