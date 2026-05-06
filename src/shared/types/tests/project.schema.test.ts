import { createMockProject } from "#shared/mocks/mock-project.js";
import { describe, it, expect } from "vitest";
import { AssetHistory, AssetVersion } from "#shared/types/assets.types.js";
import { z } from "zod";
import { generateId } from "#shared/utils/id.ts";
import { Project } from "#shared/types/schema.types.js";
import { hydrateEntity } from "#shared/utils/entity.utils.ts";

const baseProject = createMockProject({
  id: generateId(),
  metadata: {
    title: "New Movie",
  },
  assets: { description: "Main project folder" },
});
baseProject.characters.map((char) => hydrateEntity(char, char.assets));
baseProject.scenes.map((scene) => hydrateEntity(scene, scene.assets));
baseProject.locations.map((loc) => hydrateEntity(loc, loc.assets));

const validAssetVersion: z.input<typeof AssetVersion> = {
  version: 1,
  data: "https://cdn.example.com/video.mp4",
  type: "video",
  metadata: {},
};

const validAssetHistory: z.input<typeof AssetHistory> = {
  head: 1,
  best: 1,
  versions: [validAssetVersion],
};

describe("Project", () => {
  it("✅ parses with empty assets {}", () => {
    expect(() => Project.parse({ ...baseProject, assets: {} })).not.toThrow();
  });

  it("parses with populated assets registry", () => {
    expect(() =>
      Project.parse({
        ...baseProject,
        assets: { storyboard: validAssetHistory },
      }),
    ).not.toThrow();
  });

  it("top-level AssetKey shorthand strings from the intersection doesn't cause to throw", () => {
    expect(() =>
      Project.parse({
        ...hydrateEntity(baseProject, baseProject.assets),
        assets: {},
      }),
    ).not.toThrow();
  });

  it("trims non-schema top-level properties from the intersection", () => {
    (baseProject as any).description = "test-description";
    const parseResult = Project.parse({
      ...hydrateEntity(baseProject, baseProject.assets),
      assets: {},
    });
    expect((parseResult as any).description).not.toBeDefined();
  });

  it("rejects assets with an invalid AssetHistory value", () => {
    expect(() =>
      Project.parse({
        ...baseProject,
        assets: { storyboard: { head: "invalid" } },
      }),
    ).toThrow();
  });
});
