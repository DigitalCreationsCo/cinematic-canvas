// shared/utils/asset-utils.ts
import { mapDomainCharacterToInsertCharacter } from "#shared/entity/character-mappers.js";
import { mapDomainLocationToInsertLocation } from "#shared/entity/location-mappers.js";
import { mapDomainPropToInsertProp } from "#shared/entity/prop-mappers.js";
import { mapDomainSceneToInsertScene } from "#shared/entity/scene-mappers.js";
import { z } from "zod";

import { AssetKey, AssetRegistry, CreateVersionedAssetsBaseArgs } from "#shared/types/assets.types.js";
import {
  EntityCreatableType,
  EntityMentionableType,
  EntityPrimitiveType,
  EntityUnion,
} from "#shared/types/entity.types.js";
import { EntityPatch, GenerateEntitiesPayload, InsertEntitiesInput } from "#shared/types/editable.types.js";
import {
  HydratedProject,
  Project,
  InsertCharacter,
  InsertLocation,
  InsertScene,
  InsertProp,
} from "#shared/types/schema.types.js";
import { HydratedEntity, Scene, Character, Location } from "#shared/types/workflow.types.js";
import { ASSET_KEY_MAP, getAllBestAssets } from "#shared/utils/assets.utils.js";

/**
 * Groups entities by type and narrows the array type for each key.
 */
export function groupEntitiesByEntityPrimitiveType<T extends { entityType: EntityPrimitiveType }>(
  entities: T[],
): { [K in EntityPrimitiveType]?: Extract<T, { entityType: K }>[] } {
  return entities.reduce(
    (acc, entity) => {
      const type = entity.entityType;
      if (!acc[type]) {
        acc[type] = [];
      }
      (acc[type] as T[]).push(entity);
      return acc;
    },
    {} as { [K in EntityPrimitiveType]?: Extract<T, { entityType: K }>[] },
  );
}

export const ENTITY_IMAGE_SCOPE_KEYS: Partial<Record<EntityPrimitiveType, { tag: AssetKey; scopeKey: string }>> = {
  character: { tag: "character_image", scopeKey: "characterIds" },
  location: { tag: "location_image", scopeKey: "locationIds" },
  prop: { tag: "image_file", scopeKey: "propIds" },
} as const;

export const ENTITY_DESCRIPTION_SCOPE_KEYS: Partial<Record<EntityPrimitiveType, { tag: AssetKey; scopeKey: string }>> =
  {
    character: { tag: "description", scopeKey: "characterIds" },
    location: { tag: "description", scopeKey: "locationIds" },
    prop: { tag: "description", scopeKey: "propIds" },
  } as const;

/**
 * Builds the operations array for a single entity type.
 * Each operation = one image layer across all entities that have an image at that index.
 */
export function buildEntityCreatableAssetImageArgs(
  entityType: EntityPrimitiveType,
  entities: InsertEntitiesInput,
  projectId: string,
): CreateVersionedAssetsBaseArgs[] {
  const tagAndScopeKey = ENTITY_IMAGE_SCOPE_KEYS[entityType];
  if (!tagAndScopeKey) return [];
  const { tag, scopeKey } = tagAndScopeKey;

  const entitiesWithImages = entities.filter((e) => (e.images?.length ?? 0) > 0);
  if (!entitiesWithImages.length) return [];

  const maxImages = Math.max(...entitiesWithImages.map((e) => e.images!.length));

  return Array.from({ length: maxImages }, (_, imgIndex): CreateVersionedAssetsBaseArgs => {
    const layerEntities = entitiesWithImages.filter((e) => e.images![imgIndex] != null);
    return [
      { projectId, [scopeKey]: layerEntities.map((e) => e.data.id) },
      [tag],
      "image",
      layerEntities.map((e) => e.images![imgIndex].gcsUri),
      layerEntities.map(() => ({})),
      true,
    ] as const;
  }).filter((op) => op[3].length > 0);
}

/**
 * Builds the operations array for a single entity type.
 * Each operation = one description layer across all entities that have a description at that index.
 */
export function buildEntityCreatableAssetDescriptionArgs(
  entityType: EntityPrimitiveType,
  entities: GenerateEntitiesPayload,
  projectId: string,
): CreateVersionedAssetsBaseArgs[] {
  const tagAndScopeKey = ENTITY_DESCRIPTION_SCOPE_KEYS[entityType];
  if (!tagAndScopeKey) return [];
  const { tag, scopeKey } = tagAndScopeKey;

  const entitiesWithDescriptions = entities.filter((e) => e.data.description);
  if (!entitiesWithDescriptions.length) return [];

  return [
    [
      { projectId, [scopeKey]: entitiesWithDescriptions.map((e) => e.data.id) },
      [tag],
      "text",
      entitiesWithDescriptions.map((e) => e.data.description!),
      entitiesWithDescriptions.map(() => ({})),
      true,
    ] as const,
  ];
}

export const InsertEntityUnion = z.discriminatedUnion("entityType", [
  InsertCharacter,
  InsertLocation,
  InsertScene,
  InsertProp,
]);
export type InsertEntityUnion = z.infer<typeof InsertEntityUnion>;

export function mapDomainEntityToInsertEntity<T extends InsertEntitiesInput[number]>(
  projectId: string,
  entityRaw: T,
): Extract<InsertEntitiesInput[number], { entityType: T["entityType"] }> {
  if (entityRaw.entityType === "character") {
    return {
      ...entityRaw,
      data: mapDomainCharacterToInsertCharacter({
        ...entityRaw.data,
        projectId,
      }),
    } as Extract<InsertEntitiesInput[number], { entityType: T["entityType"] }>;
  }

  if (entityRaw.entityType === "location") {
    return {
      ...entityRaw,
      data: mapDomainLocationToInsertLocation({
        ...entityRaw.data,
        projectId,
      }),
    } as Extract<InsertEntitiesInput[number], { entityType: T["entityType"] }>;
  }

  if (entityRaw.entityType === "scene") {
    return {
      ...entityRaw,
      data: mapDomainSceneToInsertScene({
        ...entityRaw.data,
        projectId,
      }),
    } as Extract<InsertEntitiesInput[number], { entityType: T["entityType"] }>;
  }

  if (entityRaw.entityType === "prop") {
    return {
      ...entityRaw,
      data: mapDomainPropToInsertProp({
        ...entityRaw.data,
        projectId,
      }),
    } as Extract<InsertEntitiesInput[number], { entityType: T["entityType"] }>;
  }

  throw new Error(`Unknown entity type: ${entityRaw}`);
}

export interface ExtractedPatch {
  entityId: string;
  entityType: EntityCreatableType;
  assetUpdates: Partial<Record<AssetKey, string>>;
  propertyUpdates: Record<string, any>;
}

/**
 * Processes an array of EntityPatch objects to separate asset keys from domain properties.
 * Critical for routing data to the correct persistence layers in Cinematic Canvas.
 */
export function extractPatchContent(paramsEntityPatches: EntityPatch[]): ExtractedPatch[] {
  // Trace visibility for batch operations
  console.debug(`[extractPatchContent] Starting extraction for ${paramsEntityPatches.length} patches.`);

  return paramsEntityPatches.map((itemPatch, index) => {
    const { entityId, entityType, patch } = itemPatch;

    // Internal state for the current entity in the loop
    const assetUpdates: Partial<Record<AssetKey, string>> = {};
    const propertyUpdates: Record<string, any> = {};
    const validKeys = ASSET_KEY_MAP[entityType];

    if (!validKeys) {
      console.error(`[extractPatchContent] Unrecognized entityType: ${entityType} at index ${index}`);
      throw new Error(`Critical: Mapping failed for unknown entity type "${entityType}"`);
    }

    try {
      for (const [key, value] of Object.entries(patch)) {
        if (validKeys.has(key)) {
          assetUpdates[key as AssetKey] = value as string;
        } else {
          propertyUpdates[key] = value;
        }
      }

      console.debug(
        `[extractPatchContent] Extracted ${entityId}: ${Object.keys(assetUpdates).length} assets, ${Object.keys(propertyUpdates).length} props.`,
      );

      return {
        entityId,
        entityType,
        assetUpdates,
        propertyUpdates,
      };
    } catch (errUnhandled) {
      // Root cause analysis: Identify if a malformed patch object entered the stream
      console.error(`[extractPatchContent] Failed to process patch at index ${index}`, { entityId, errUnhandled });
      throw errUnhandled;
    }
  });
}

export function hydrateProject(project: Project): HydratedProject {
  return {
    ...project,
    // Fix: Pass the entity's specific assets, not the global project assets
    scenes: project.scenes.map((scene) => hydrateEntity(scene, scene.assets)),
    characters: project.characters.map((character) => hydrateEntity(character, character.assets)),
    locations: project.locations.map((location) => hydrateEntity(location, location.assets)),
  };
}

export function hydrateEntity<T extends { id: string }>(
  entity: T,
  registry: AssetRegistry | null | undefined,
): HydratedEntity<T> {
  if (!registry) return entity as HydratedEntity<T>;

  // 1. Get all "best" versions currently pinned or calculated in the registry
  const bestAssets = getAllBestAssets(registry);

  // 2. Map versioned asset data back onto the entity structure
  // This assumes the AssetKey (e.g., 'description')
  // maps to the entity property (e.g., 'description')
  const overrides: Record<string, string> = {};

  Object.entries(bestAssets).forEach(([key, version]) => {
    if (!version) return;

    overrides[key] = version.data;
  });

  return {
    ...entity,
    ...overrides,
    assets: registry,
  } as HydratedEntity<T>;
}

/**
 * Processes a patch and determines what goes to the Asset Version Manager
 * and what goes to the standard DB column update.
 */
export function dehydrateEntityPatch(
  entityType: EntityPrimitiveType,
  patch: Partial<Scene> | Partial<Character> | Partial<Location>,
) {
  const assetKeys = ASSET_KEY_MAP[entityType];
  const assetUpdates: Partial<Record<AssetKey, string>> = {};
  const propertyUpdates: Record<string, any> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (assetKeys.has(key)) {
      assetUpdates[key as AssetKey] = value;
    } else {
      propertyUpdates[key] = value;
    }
  }

  return { assetUpdates, entityUpdates: propertyUpdates };
}
