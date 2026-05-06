import { createMockCharacter } from "#shared/mocks/mock-character.js";
import { createMockLocation } from "#shared/mocks/mock-location.ts";
import { createMockScene } from "#shared/mocks/mock-scene.ts";

import { describe, it, expect, vi } from "vitest";
import {
  groupEntitiesByEntityPrimitiveType,
  buildEntityCreatableAssetImageArgs,
  buildEntityCreatableAssetDescriptionArgs,
  mapDomainEntityToInsertEntity,
  extractPatchContent,
  hydrateProject,
  hydrateEntity,
  dehydrateEntityPatch,
} from "#shared/utils/entity.utils.js";
import { EntityPatch } from "#shared/types/editable.types.js";

// Mock external dependencies
vi.mock("#shared/entity/character-mappers.js", () => ({
  mapDomainCharacterToInsertCharacter: vi.fn((data) => ({ ...data, mapped: true })),
}));
vi.mock("#shared/entity/location-mappers.js", () => ({
  mapDomainLocationToInsertLocation: vi.fn((data) => ({ ...data, mapped: true })),
}));
vi.mock("#shared/entity/prop-mappers.js", () => ({
  mapDomainPropToInsertProp: vi.fn((data) => ({ ...data, mapped: true })),
}));
vi.mock("#shared/entity/scene-mappers.js", () => ({
  mapDomainSceneToInsertScene: vi.fn((data) => ({ ...data, mapped: true })),
}));

describe("groupEntitiesByEntityPrimitiveType", () => {
  it("should group entities by their entityPrimitiveType", () => {
    const entities = [
      { entityType: "character", id: "1" },
      { entityType: "character", id: "2" },
      { entityType: "location", id: "3" },
    ] as any[];

    const result = groupEntitiesByEntityPrimitiveType(entities);
    expect(result.character).toHaveLength(2); //[cite: 1]
    expect(result.location).toHaveLength(1); //[cite: 1]
    expect(result.scene).toBeUndefined(); //[cite: 1]
  });

  it("should handle an empty array", () => {
    expect(groupEntitiesByEntityPrimitiveType([])).toEqual({}); //[cite: 1]
  });
});

describe("buildEntityCreatableAssetImageArgs", () => {
  const projectId = "proj_1";

  it("should return an empty array if entity type is not in scope keys", () => {
    const result = buildEntityCreatableAssetImageArgs("scene", [], projectId);
    expect(result).toEqual([]); //[cite: 1]
  });

  it("should return an empty array if no entities have images", () => {
    const entities = [{ data: { id: "ch_1" }, images: [] }] as any[];
    const result = buildEntityCreatableAssetImageArgs("character", entities, projectId);
    expect(result).toEqual([]); //[cite: 1]
  });

  it("should build operations array for max images length", () => {
    const entities = [
      { data: { id: "ch_1" }, images: [{ gcsUri: "uri1" }, { gcsUri: "uri2" }] },
      { data: { id: "ch_2" }, images: [{ gcsUri: "uri3" }] },
    ] as any[];

    const result = buildEntityCreatableAssetImageArgs("character", entities, projectId);
    expect(result).toHaveLength(2); //[cite: 1]
    expect(result[0][0]).toEqual({ projectId, characterIds: ["ch_1", "ch_2"] }); //[cite: 1]
    expect(result[0][3]).toEqual(["uri1", "uri3"]); //[cite: 1]
    expect(result[1][0]).toEqual({ projectId, characterIds: ["ch_1"] }); //[cite: 1]
    expect(result[1][3]).toEqual(["uri2"]); //[cite: 1]
  });
});

describe("buildEntityCreatableAssetDescriptionArgs", () => {
  const projectId = "proj_1";

  it("should return an empty array if entity type has no scope key mapping", () => {
    const result = buildEntityCreatableAssetDescriptionArgs("scene", [], projectId);
    expect(result).toEqual([]); //[cite: 1]
  });

  it("should return an empty array if no entities have descriptions", () => {
    const entities = [{ data: { id: "ch_1" } }] as any[];
    const result = buildEntityCreatableAssetDescriptionArgs("character", entities, projectId);
    expect(result).toEqual([]); //[cite: 1]
  });

  it("should build operation array for valid descriptions", () => {
    const entities = [{ data: { id: "ch_1", description: "A hero" } }] as any[];
    const result = buildEntityCreatableAssetDescriptionArgs("character", entities, projectId);
    expect(result).toHaveLength(1); //[cite: 1]
    expect(result[0][0]).toEqual({ projectId, characterIds: ["ch_1"] }); //[cite: 1]
    expect(result[0][3]).toEqual(["A hero"]); //[cite: 1]
  });
});

describe("mapDomainEntityToInsertEntity", () => {
  const projectId = "proj_1";

  it("should map character entity", () => {
    const result = mapDomainEntityToInsertEntity(projectId, { entityType: "character", data: { id: "1" } } as any);
    expect(result.data.mapped).toBe(true); //[cite: 1]
  });

  it("should map location entity", () => {
    const result = mapDomainEntityToInsertEntity(projectId, { entityType: "location", data: { id: "2" } } as any);
    expect(result.data.mapped).toBe(true); //[cite: 1]
  });

  it("should map scene entity", () => {
    const result = mapDomainEntityToInsertEntity(projectId, { entityType: "scene", data: { id: "3" } } as any);
    expect(result.data.mapped).toBe(true); //[cite: 1]
  });

  it("should map prop entity", () => {
    const result = mapDomainEntityToInsertEntity(projectId, { entityType: "prop", data: { id: "4" } } as any);
    expect(result.data.mapped).toBe(true); //[cite: 1]
  });

  it("should throw an error for an unknown entity type", () => {
    expect(() => mapDomainEntityToInsertEntity(projectId, { entityType: "unknown" } as any)).toThrowError(
      "Unknown entity type",
    ); //[cite: 1]
  });
});

describe("extractPatchContent", () => {
  it("should process multiple entity types in a single batch", () => {
    const patches: EntityPatch[] = [
      {
        entityId: "sc_1",
        entityType: "scene",
        patch: { name: "Intro", scene_video: "vid_01" },
      },
      {
        entityId: "ch_1",
        entityType: "character",
        patch: { name: "Hero", character_image: "img_01" },
      },
    ];

    const results = extractPatchContent(patches); //[cite: 2]

    expect(results).toHaveLength(2); //[cite: 2]
    expect(results[0].assetUpdates).toHaveProperty("scene_video"); //[cite: 2]
    expect(results[1].propertyUpdates).toHaveProperty("name"); //[cite: 2]
  });

  it("should throw a critical error for an unrecognized entityType", () => {
    const patches = [{ entityId: "unk_1", entityType: "unknownType", patch: {} }] as any;
    expect(() => extractPatchContent(patches)).toThrowError(/Critical: Mapping failed for unknown entity type/); //[cite: 1]
  });
});

describe("hydrateProject", () => {
  it("should hydrate all scenes, characters, and locations within a project", () => {
    const project = {
      assets: { storyboard: "some_registry_data" }, // project registry
      scenes: [createMockScene({ assets: { description: "a scene description" } })], // scene registry
      characters: [
        createMockCharacter({ assets: { description: "a character description", character_image: "character image" } }), //character registry
      ],
      locations: [createMockLocation({ assets: { description: "a location description" } })], // location registry
    } as any;

    const result = hydrateProject(project);

    // 1. Verify property hydration (from getAllBestAssets)
    expect(result.assets.storyboard).toBe("some_registry_data");
    expect(result.scenes[0].description).toBe("a scene description");
    expect(result.characters[0].description).toBe("a character description");
    expect(result.locations[0].description).toBe("a location description");

    // 2. Verify asset registry inclusion
    // hydrateEntity specifically adds the 'assets' key back to the entity
    expect(result.scenes[0].assets).toEqual(project.scenes[0].assets);
    expect(result.characters[0].assets).toEqual(project.characters[0].assets);
    expect(result.locations[0].assets).toEqual(project.locations[0].assets);
  });
});

describe("hydrateEntity", () => {
  it("should return the entity unchanged if registry is missing", () => {
    const entity = { id: "1", name: "Base" } as any;
    const result = hydrateEntity(entity, null);
    expect(result).toEqual(entity); //[cite: 1]
  });

  it("should hydrate entity with all asset properties", () => {
    const character = createMockCharacter({ assets: { description: "a character" } });
    const hydratedCharacter = hydrateEntity(character, character.assets); //[cite: 2]
    expect(hydratedCharacter.description).toBe("a character"); //[cite: 2]
  });

  it("should gracefully skip null or undefined versions in best assets", () => {
    const entity = { id: "1" } as any;
    const result = hydrateEntity(entity, {});
    expect(result.description).toBeUndefined(); //[cite: 1]
  });
});

describe("dehydrateEntityPatch", () => {
  it("should correctly dehydrate an entity", () => {
    const patches: EntityPatch[] = [
      {
        entityId: "sc_1",
        entityType: "scene",
        patch: { name: "Intro", scene_video: "vid_01" },
      },
      {
        entityId: "ch_1",
        entityType: "character",
        patch: { name: "Hero", character_image: "img_01" },
      },
    ];

    const results = patches.map((patch) => dehydrateEntityPatch(patch.entityType, patch.patch)); //[cite: 2]

    expect(results).toHaveLength(2); //[cite: 2]
    expect(results[0].assetUpdates).toHaveProperty("scene_video"); //[cite: 2]
    expect(results[1].entityUpdates).toHaveProperty("name"); //[cite: 2]
  });

  it("should handle patches with only properties or only assets", () => {
    const resultPropOnly = dehydrateEntityPatch("scene", { name: "Intro" });
    expect(resultPropOnly.assetUpdates).toEqual({}); //[cite: 1]
    expect(resultPropOnly.entityUpdates).toEqual({ name: "Intro" }); //[cite: 1]

    const resultAssetOnly = dehydrateEntityPatch("scene", { scene_video: "vid_01" } as any);
    expect(resultAssetOnly.assetUpdates).toEqual({ scene_video: "vid_01" }); //[cite: 1]
    expect(resultAssetOnly.entityUpdates).toEqual({}); //[cite: 1]
  });
});
