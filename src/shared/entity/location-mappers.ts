import { LocationAttributes } from "#shared/types/location.types.js";
import { LocationWithAssets, LocationBase, Location } from "#shared/types/workflow.types.js";
import { InsertLocation } from "#shared/types/schema.types.js";
import { AssetRegistry } from "#shared/types/assets.types.js";
import { z } from "zod";
import { hydrateEntity } from "#shared/utils/entity.utils.js";
import { locations } from "#shared/db/schema.js";
import { LocationCondensed } from "#shared/types/storyboard.types.js";
import { getAllBestAssets } from "#shared/utils/assets.utils.js";

export function mapLocationHydrationPayloadToLocation(payload: Location): Location {
  return Location.parse(payload);
}

export function mapLocationWithAssetsToDomainLocation(
  entity: typeof locations.$inferInsert & { assets: AssetRegistry },
): LocationWithAssets {
  const parsed = JSON.parse(JSON.stringify(entity));
  return LocationWithAssets.parse(parsed);
}

export function mapDomainLocationToInsertLocation(loc: z.input<typeof InsertLocation>): z.infer<typeof InsertLocation> {
  return InsertLocation.parse(loc);
}

export function mapLocationWithAssetsToLocationAttributes(loc: LocationWithAssets): LocationAttributes {
  return LocationAttributes.parse(hydrateEntity(loc, loc.assets));
}

export function mapLocationWithAssetsToLocationBase(loc: LocationBase): LocationBase {
  return LocationBase.parse(loc);
}

/**
 * Transforms a scene into a condensed scene, used for the storyboard view.
 * Description is intentionally sourced from the best versioned asset rather
 * than a column value, because descriptions for all entity types are stored as
 * versioned assets (see schema). CharacterWithAssets / LocationWithAssets /
 * SceneWithAssets omit the description column for exactly this reason.
 */
export function condenseLocation(location: LocationWithAssets): LocationCondensed {
  const description = getAllBestAssets(location.assets)["description"]?.data ?? "";
  return LocationCondensed.parse({ ...location, description });
}

interface Source {
  referenceId: string;
  id: string;
}

/**
 * Maps reference IDs to character IDs using an optimized Map lookup.
 * @param source - Array of source objects containing the ID mappings.
 * @param targetRefs - Array of reference IDs to be converted.
 * @returns Array of mapped characterIds.
 */
export function mapReferenceIdsToIds<T extends string>(source: Source[], targetRefs: T[]): T[] {
  // 1. Pre-allocate the Map size if possible to reduce re-hashing
  const lookupMap = new Map<string, T>();

  // 2. Single-pass index creation
  const sourceLength = source.length;
  for (let i = 0; i < sourceLength; i++) {
    const record = source[i];
    lookupMap.set(record.referenceId, record.id as T);
  }

  // 3. Map the targets using constant time O(1) lookups
  const result: T[] = [];
  const targetLength = targetRefs.length;

  for (let j = 0; j < targetLength; j++) {
    const match = lookupMap.get(targetRefs[j]);
    if (match !== undefined) {
      result.push(match);
    }
  }

  return result;
}
