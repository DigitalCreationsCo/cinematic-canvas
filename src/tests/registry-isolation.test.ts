import { createMockScene } from "#shared/mocks/mock-scene.js";
import { createMockCharacter } from "#shared/mocks/mock-character.js";

import { describe, it, expect } from "vitest";
import { getAllBestAssets } from "#shared/utils/assets.utils.js";
import { hydrateEntity, hydrateProject } from "#shared/utils/entity.utils.ts";
import { createMockLocation } from "#shared/mocks/mock-location.ts";
import { createMockProject } from "#shared/mocks/mock-project.ts";
import { generateId } from "#shared/utils/id.ts";

describe("Asset Registry Isolation", () => {
  it("should ensure distinct entities have strictly unique asset registry references", () => {
    const scene = createMockScene({
      assets: { scene_end_frame: "scene-uri" },
    });
    const character = createMockCharacter({
      assets: { character_image: "char-uri" },
    });

    // 1. Physical Reference Check
    // If this is true, the mock utilities are recycling the same object[cite: 10, 11]
    expect(scene.assets).not.toBe(character.assets);

    // 2. Structural Collision Check
    // A character should NOT have scene-specific keys in its registry[cite: 11]
    expect(scene.assets).toHaveProperty("scene_end_frame");
    expect(character.assets).not.toHaveProperty("scene_end_frame");
    expect(character.assets).toHaveProperty("character_image");
  });

  it("should return correct assets even when processed in rapid succession (Statelessness Check)", () => {
    const entities = [
      createMockScene({ assets: { scene_end_frame: "scene-1" } }),
      createMockCharacter({ assets: { character_image: "char-1" } }),
      createMockScene({ assets: { scene_end_frame: "scene-2" } }),
    ];

    const results = entities.map((e) => getAllBestAssets(e.assets));

    // Verify Scene 1[cite: 9, 10]
    expect(results[0]).toHaveProperty("scene_end_frame", expect.objectContaining({ data: "scene-1" }));
    expect(results[0]).not.toHaveProperty("character_image");

    // Verify Character 1[cite: 9, 11]
    expect(results[1]).toHaveProperty("character_image", expect.objectContaining({ data: "char-1" }));
    expect(results[1]).not.toHaveProperty("scene_end_frame");

    // Verify Scene 2[cite: 9, 10]
    expect(results[2]).toHaveProperty("scene_end_frame", expect.objectContaining({ data: "scene-2" }));
  });

  it("should return correct assets even when processed in rapid succession (Statelessness Check)", () => {
    const entities = [
      createMockScene({ assets: { scene_end_frame: "scene-1" } }),
      createMockCharacter({ assets: { character_image: "char-1" } }),
      createMockScene({ assets: { scene_end_frame: "scene-2" } }),
    ];

    const results = entities.map((e) => getAllBestAssets(e.assets));

    // Verify Scene 1[cite: 9, 10]
    expect(results[0]).toHaveProperty("scene_end_frame", expect.objectContaining({ data: "scene-1" }));
    expect(results[0]).not.toHaveProperty("character_image");

    // Verify Character 1[cite: 9, 11]
    expect(results[1]).toHaveProperty("character_image", expect.objectContaining({ data: "char-1" }));
    expect(results[1]).not.toHaveProperty("scene_end_frame");

    // Verify Scene 2[cite: 9, 10]
    expect(results[2]).toHaveProperty("scene_end_frame", expect.objectContaining({ data: "scene-2" }));
  });

  it("should not leak data when using the same KV keys for different entities", () => {
    // Both use "description" key, but values must remain isolated
    const scene = createMockScene({ assets: { description: "scene-desc" } });
    const character = createMockCharacter({ assets: { description: "char-desc" } });

    const sceneAssets = getAllBestAssets(scene.assets);
    const charAssets = getAllBestAssets(character.assets);

    expect(sceneAssets.description?.data).toBe("scene-desc");
    expect(charAssets.description?.data).toBe("char-desc");
  });

  it("hydrated project entities should have isolated registries (repro continuitymanager.prepareAndRefineSceneInputs)", () => {
    const projectId = generateId();

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
      scenes: [createMockScene(), scene],
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

    const { characters, scenes } = project;

    const previousSceneIndex = scenes.findIndex((s) => s.id === scene.id) - 1;
    const previousScene = previousSceneIndex >= 0 ? scenes[previousSceneIndex] : undefined;

    const previousAssets = getAllBestAssets(previousScene?.assets);
    const currentAssets = getAllBestAssets(scene.assets);

    const prevSceneEndFrame = previousAssets["scene_end_frame"]?.data;
    const sceneStartFrame = currentAssets["scene_start_frame"]?.data;
    const sceneEndFrame = currentAssets["scene_end_frame"]?.data;
    expect(prevSceneEndFrame).not.toEqual(sceneStartFrame);
    expect(prevSceneEndFrame).not.toEqual(sceneEndFrame);

    const charactersInScene = characters.filter((char) => scene.characterIds.includes(char.id));
    charactersInScene.forEach((c) => {
      const characterAssets = getAllBestAssets(c.assets);

      expect(characterAssets).not.toEqual(previousAssets);
      expect(characterAssets).not.toEqual(currentAssets);
    });
  });
});
