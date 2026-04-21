// shared/utils/asset-utils.ts
import { mapDomainCharacterToInsertCharacter } from "#shared/entity/character-mappers.js";
import { mapDomainLocationToInsertLocation } from "#shared/entity/location-mappers.js";
import { mapDomainPropToInsertProp } from "#shared/entity/prop-mappers.js";
import { mapDomainSceneToInsertScene } from "#shared/entity/scene-mappers.js";
import { AssetKey, AssetRegistry, EntityType, InsertEntityUnion } from "../types/assets.types.js";
import {
    EntityPatch,
    SCENE_APPLICABLE_ASSET_KEYS,
    CHARACTER_APPLICABLE_ASSET_KEYS,
    LOCATION_APPLICABLE_ASSET_KEYS,
    InsertEntitiesInput,
    PropInsertEntityInput,
    LocationInsertEntityInput,
    CharacterInsertEntityInput,
    SceneInsertEntityInput
} from '../types/editable.types.js';
import { HydratedProject, HydratedEntity, Project, Scene, Character, Location } from "../types/index.js";
import { ASSET_KEY_MAP, getAllBestAssets } from "./assets-utils.js";

export interface ExtractedPatch {
    entityId: string;
    entityType: 'scene' | 'character' | 'location';
    assetUpdates: Partial<Record<AssetKey, string>>;
    propertyUpdates: Record<string, any>;
}

export function mapDomainEntityToInsertEntity(
    projectId: string,
    entityRaw: SceneInsertEntityInput
): Extract<InsertEntityUnion, { entityType: 'scene' }>;
export function mapDomainEntityToInsertEntity(
    projectId: string,
    entityRaw: CharacterInsertEntityInput
): Extract<InsertEntityUnion, { entityType: 'character' }>;
export function mapDomainEntityToInsertEntity(
    projectId: string,
    entityRaw: LocationInsertEntityInput
): Extract<InsertEntityUnion, { entityType: 'location' }>;
export function mapDomainEntityToInsertEntity(
    projectId: string,
    entityRaw: PropInsertEntityInput
): Extract<InsertEntityUnion, { entityType: 'prop' }>;
export function mapDomainEntityToInsertEntity(
    projectId: string,
    entityRaw: InsertEntitiesInput[number]
): InsertEntityUnion {
    if (entityRaw.entityType === "character") {
        return mapDomainCharacterToInsertCharacter({
            ...entityRaw.data,
            projectId,
        }) as Extract<InsertEntityUnion, { entityType: 'character' }>;
    }
    if (entityRaw.entityType === "location") {
        return mapDomainLocationToInsertLocation({
            ...entityRaw.data,
            projectId,
        }) as Extract<InsertEntityUnion, { entityType: 'location' }>;
    }
    if (entityRaw.entityType === "scene") {
        return mapDomainSceneToInsertScene({
            ...entityRaw.data,
            projectId,
        }) as Extract<InsertEntityUnion, { entityType: 'scene' }>;
    }
    if (entityRaw.entityType === "prop") {
        return mapDomainPropToInsertProp({
            ...entityRaw.data,
            projectId,
        }) as Extract<InsertEntityUnion, { entityType: 'prop' }>;
    }
    throw new Error(`Unknown entity type: ${entityRaw}`);
};

/**
 * Processes an array of EntityPatch objects to separate asset keys from domain properties.
 * Critical for routing data to the correct persistence layers in Cinematic Canvas.
 */
export function extractPatchContent(
    paramsEntityPatches: EntityPatch[]
): ExtractedPatch[] {
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

            console.debug(`[extractPatchContent] Extracted ${entityId}: ${Object.keys(assetUpdates).length} assets, ${Object.keys(propertyUpdates).length} props.`);

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

export function hydrateProject(
    project: Project,
): HydratedProject {
    return {
        ...project,
        scenes: project.scenes.map((scene) => hydrateEntity(scene, project.assets)),
        characters: project.characters.map((character) => hydrateEntity(character, project.assets)),
        locations: project.locations.map((location) => hydrateEntity(location, project.assets)),
    };
};

export function hydrateEntity<T extends { id: string }>(
    entity: T,
    registry: AssetRegistry | null | undefined
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
};

/**
 * Processes a patch and determines what goes to the Asset Version Manager
 * and what goes to the standard DB column update.
 */
export function dehydrateEntityPatch(
    entityType: EntityType,
    patch: Partial<Scene> | Partial<Character> | Partial<Location>
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