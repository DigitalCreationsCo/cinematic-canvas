import { buildCharacterFullSpec } from "../character-spec.prompt.js";
import { createMockCharacter } from "../../mocks/mock-character.js";
import { describe, it, expect } from "vitest";

describe("buildCharacterFullSpec", () => {
  it("should include character description from assets", () => {
    const character = createMockCharacter({
      assets: { description: "A detailed character description" },
    });
    const prompt = buildCharacterFullSpec(character);

    expect(prompt).toContain("A detailed character description");
  });

  it("should fall back to character description if no assets description", () => {
    const character = createMockCharacter({
      description: "Direct character description",
      assets: {},
    });
    const prompt = buildCharacterFullSpec(character);

    expect(prompt).toContain("Direct character description");
  });

  it("should format physical traits correctly", () => {
    const character = createMockCharacter({
      physicalTraits: {
        gender: "female",
        age: "25",
        ethnicity: "Asian",
        build: "slender",
        hair: "long black hair",
        clothing: ["red dress", "silver necklace"],
        accessories: ["diamond earrings"],
        distinctiveFeatures: ["small scar on left cheek"],
        appearanceNotes: ["always carries a red umbrella"],
      },
    });
    const prompt = buildCharacterFullSpec(character);

    expect(prompt).toContain("25-year-old Asian woman");
    expect(prompt).toContain("slender build");
    expect(prompt).toContain("long black hair");
    expect(prompt).toContain("red dress, silver necklace");
    expect(prompt).toContain("diamond earrings");
    expect(prompt).toContain("small scar on left cheek");
    expect(prompt).toContain("red umbrella");
  });

  it("should handle non-binary gender correctly", () => {
    const character = createMockCharacter({
      physicalTraits: {
        gender: "non-binary",
        age: "30",
        build: "average",
        hair: "short hair",
        clothing: [],
        accessories: [],
        distinctiveFeatures: [],
        appearanceNotes: [],
      },
    });
    const prompt = buildCharacterFullSpec(character);

    expect(prompt).toContain("30-year-old  non-binary-gender person");
  });

  it("should include character state information", () => {
    const character = createMockCharacter({
      state: {
        emotionalState: "determined",
        dirtLevel: "dirty",
        costumeCondition: {
          wetness: "damp",
          tears: ["sleeve"],
          stains: ["mud"],
          damage: ["frayed collar"],
        },
        hairCondition: {
          messiness: "messy",
          wetness: "damp",
        },
        injuries: [{ severity: "minor", type: "scratch", location: "left arm" }],
      },
    });
    const prompt = buildCharacterFullSpec(character);

    expect(prompt).toContain("determined");
    expect(prompt).toContain("visibly dirty");
    expect(prompt).toContain("damp with moisture");
    expect(prompt).toContain("torn at the sleeve");
    expect(prompt).toContain("stained with mud");
    expect(prompt).toContain("messy hair");
    expect(prompt).toContain("a minor scratch on their left arm");
  });

  it("should include character image from assets", () => {
    const character = createMockCharacter({
      assets: { character_image: "character-image.jpg" },
    });
    const prompt = buildCharacterFullSpec(character);

    expect(prompt).toContain("Image: character-image.jpg");
  });

  it("should handle missing character image gracefully", () => {
    const character = createMockCharacter({ assets: {} });
    const prompt = buildCharacterFullSpec(character);

    expect(prompt).not.toContain("Image:");
  });

  it("should include reference ID", () => {
    const character = createMockCharacter({ referenceId: "char_hero_001" });
    const prompt = buildCharacterFullSpec(character);

    expect(prompt).toContain("Reference ID: char_hero_001");
  });

  it("should handle empty arrays gracefully", () => {
    const character = createMockCharacter({
      physicalTraits: {
        gender: "male",
        age: "40",
        ethnicity: "",
        build: "muscular",
        hair: "",
        clothing: [],
        accessories: [],
        distinctiveFeatures: [],
        appearanceNotes: [],
      },
    });
    const prompt = buildCharacterFullSpec(character);

    expect(prompt).toContain("40-year-old  man");
    expect(prompt).toContain("muscular build");
    expect(prompt).not.toContain("Their hair is");
    expect(prompt).not.toContain("They are wearing");
  });
});
