import { createMockScene } from "#shared/mocks/mock-scene.js";
import { describe, it, expect } from "vitest";
import { Scene } from "#shared/types/workflow.types.js";
import { AssetHistory, AssetVersion } from "#shared/types/assets.types.js";
import { z } from "zod";
import { generateId } from "#shared/utils/id.ts";
import { hydrateEntity } from "#shared/utils/entity.utils.js";

const baseScene = createMockScene({
  id: generateId(),
  name: "Opening Scene",
  assets: { description: "The scene begins..." },
});

const scene: z.input<typeof Scene> = hydrateEntity(baseScene, baseScene.assets);

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

describe("Scene", () => {
  it("✅ parses with empty assets {}", () => {
    expect(() => Scene.parse({ ...scene, assets: {} })).not.toThrow();
  });

  it("parses with populated assets registry", () => {
    expect(() =>
      Scene.parse({
        ...scene,
        assets: { scene_video: validAssetHistory },
      }),
    ).not.toThrow();
  });

  it("accepts top-level AssetKey shorthand strings from the intersection", () => {
    expect(() =>
      Scene.parse({
        ...baseScene,
        assets: {},
        description: "A dark and stormy night",
        scene_video: "https://cdn.example.com/video.mp4",
      }),
    ).not.toThrow();
  });

  it("rejects assets with an invalid AssetHistory value", () => {
    expect(() =>
      Scene.parse({
        ...baseScene,
        assets: { scene_video: "not-a-history-object" },
      }),
    ).toThrow();
  });
});
