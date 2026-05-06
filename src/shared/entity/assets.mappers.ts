import { AssetRegistry, AssetVersion } from "#shared/types/assets.types.js";
import {
  AssetEntry,
  AssetVersionRow,
  InsertAssetVersion,
} from "#shared/types/schema.types.js";
import { z } from "zod";

/**
 * Convert DB version row to domain AssetVersion type.
 */
export function dbVersionToAssetVersion(v: InsertAssetVersion): AssetVersion {
  const assetVersion: AssetVersion = AssetVersion.parse(v);
  return assetVersion;
}

/**
 * Convert domain AssetVersion type to DB version.
 */
export function assetVersionToDbAssetVersionRow(
  v: z.input<InsertAssetVersion>,
): InsertAssetVersion {
  const insertAssetVersion: InsertAssetVersion = InsertAssetVersion.parse(v);
  return insertAssetVersion;
}

/**
 * Build AssetRegistry from entries and versions.
 */
export function buildRegistryFromEntries(
  entries: AssetEntry[],
  versions: AssetVersionRow[],
): AssetRegistry {
  const registry: AssetRegistry = {};

  // 1. Group versions by entry ID in $O(M)$ time
  const versionsByEntry = new Map<string, AssetVersionRow[]>();
  for (const v of versions) {
    const list = versionsByEntry.get(v.assetEntryId) || [];
    list.push(v);
    versionsByEntry.set(v.assetEntryId, list);
  }

  // 2. Map entries in $O(N)$ time
  for (const entry of entries) {
    const entryVersions = (versionsByEntry.get(entry.id) || []).map((v) =>
      dbVersionToAssetVersion(v),
    );

    registry[entry.assetKey] = {
      head: entry.head,
      best: entry.best,
      versions: entryVersions,
    };
  }

  return registry;
}
