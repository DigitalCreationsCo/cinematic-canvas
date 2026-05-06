import { AssetKey, AssetRegistry, AssetVersion, AssetHistory, Scope } from "#shared/types/assets.types.js";
import { EntityPrimitiveType } from "#shared/types/entity.types.js";
import {
  SCENE_APPLICABLE_ASSET_KEYS,
  CHARACTER_APPLICABLE_ASSET_KEYS,
  LOCATION_APPLICABLE_ASSET_KEYS,
} from "#shared/types/editable.types.js";

// ============================================================================
// ACCESSORS
// ============================================================================

/**
 * All best versions in one pass.
 * O(K) where K is number of asset keys.
 */
export function getAllBestAssets(assets: AssetRegistry | undefined | null): Partial<Record<AssetKey, AssetVersion>> {
  if (!assets) return {};

  const result: Partial<Record<AssetKey, AssetVersion>> = {};
  for (const [key, history] of Object.entries(assets) as [AssetKey, AssetHistory][]) {
    if (!history?.versions?.length) continue;
    const versionBest = history.versions.find((v) => v.version === history.best);
    if (versionBest) {
      result[key as AssetKey] = versionBest;
    }
  }
  return result;
}

/**
 * All latest (head) versions in one pass.
 * O(K) where K is number of asset keys.
 */
export function getAllLatestAssets(assets: AssetRegistry | undefined | null): Partial<Record<AssetKey, AssetVersion>> {
  if (!assets) return {};

  const result: Partial<Record<AssetKey, AssetVersion>> = {};
  for (const [key, history] of Object.entries(assets) as [AssetKey, AssetHistory][]) {
    if (!history?.versions?.length) continue;
    const versionLatest = history.versions.find((v) => v.version === history.head);
    if (versionLatest) {
      result[key as AssetKey] = versionLatest;
    }
  }
  return result;
}

/**
 * Get the best version for a single asset key.
 * O(n)
 *
 * @param assets - Asset registry
 * @param assetKey - Specific asset to retrieve
 * @returns Best version or undefined
 */
export function getBestAsset(assets: AssetRegistry | undefined | null, assetKey: AssetKey): AssetVersion | undefined {
  if (!assets) return undefined;
  return getAllBestAssets(assets)[assetKey];
}

/**
 * Get the latest version for a single asset key.
 * O(n)
 *
 * @param assets - Asset registry
 * @param assetKey - Specific asset to retrieve
 * @returns Latest version or undefined
 */
export function getLatestAsset(
  registry: AssetRegistry | undefined | null,
  assetKey: AssetKey,
): AssetVersion | undefined {
  if (!registry) return undefined;
  return getAllLatestAssets(registry)[assetKey];
}

/**
 * Get a specific version by number.
 *
 * Time Complexity: O(n) where n = number of versions for this key
 *
 * @param assets - Asset registry
 * @param assetKey - Asset key
 * @param version - Version number to retrieve
 * @returns Specific version or undefined
 */
export function getAssetVersion(
  registry: AssetRegistry | undefined | null,
  assetKey: AssetKey,
  version: number,
): AssetVersion | undefined {
  if (!registry) return undefined;
  return registry[assetKey]?.versions.find((v) => v.version === version);
}

/**
 * Get all versions for a single asset key, newest first.
 *
 * @param assets - Asset registry
 * @param assetKey - Asset key
 * @returns Array of all versions, newest first
 */
export function getAllAssetVersions(registry: AssetRegistry | undefined | null, assetKey: AssetKey): AssetVersion[] {
  if (!registry) return [];
  const history = registry[assetKey];
  if (!history) return [];
  return [...history.versions].sort((a, b) => b.version - a.version);
}

// ============================================================================
// ACCESSORS — metadata & existence
// ============================================================================

/**
 * Get asset history metadata (head, best pointers).
 *
 * @param assets - Asset registry
 * @param assetKey - Asset key
 * @returns History metadata or undefined
 */
export function getAssetHistoryMetadata(
  registry: AssetRegistry | undefined | null,
  assetKey: AssetKey,
): { head: number; best: number; count: number } | undefined {
  if (!registry) return undefined;
  const history = registry[assetKey];
  if (!history) return undefined;
  return { head: history.head, best: history.best, count: history.versions.length };
}

/**
 * Check if an asset exists and has at least one version.
 *
 * @param assets - Asset registry
 * @param assetKey - Asset key to check
 * @returns true if asset exists with versions
 */
export function hasAsset(assets: AssetRegistry | undefined | null, assetKey: AssetKey): boolean {
  if (!assets) return false;
  const history = assets[assetKey];
  return !!(history && history.versions.length > 0);
}

/**
 * Check if a specific version exists.
 *
 * @param assets - Asset registry
 * @param assetKey - Asset key
 * @param version - Version number to check
 * @returns true if version exists
 */
export function hasAssetVersion(
  assets: AssetRegistry | undefined | null,
  assetKey: AssetKey,
  version: number,
): boolean {
  if (!assets) return false;
  return !!assets[assetKey]?.versions.some((v) => v.version === version);
}

// ============================================================================
// ACCESSORS — convenience URL helpers
// ============================================================================

/**
 * Get asset data URL (best version by default).
 * Convenience helper for UI components.
 *
 * @param assets - Asset registry
 * @param assetKey - Asset key
 * @param version - Optional specific version, defaults to best
 * @returns Data URL string or undefined
 */
export function getAssetUrl(
  assets: AssetRegistry | undefined | null,
  assetKey: AssetKey,
  version?: number,
): string | undefined {
  if (!assets) return undefined;
  const ver = version !== undefined ? getAssetVersion(assets, assetKey, version) : getBestAsset(assets, assetKey);
  return ver?.data;
}

/**
 * Batch get multiple asset URLs.
 *
 * @param assets - Asset registry
 * @param assetKeys - Array of asset keys to retrieve
 * @returns Map of asset keys to URLs
 */
export function getAssetUrls(
  assets: AssetRegistry | undefined | null,
  assetKeys: AssetKey[],
): Partial<Record<AssetKey, string>> {
  if (!assets) return {};
  const bestAssets = getAllBestAssets(assets);
  const result: Partial<Record<AssetKey, string>> = {};
  for (const key of assetKeys) {
    const asset = bestAssets[key];
    if (asset) result[key] = asset.data;
  }
  return result;
}

// ============================================================================
// FILTERING
// ============================================================================

/**
 * Get all assets of a specific type.
 *
 * @param assets - Asset registry
 * @param assetType - Type to filter by (video, image, text, etc.)
 * @param useBest - If true, returns best versions, otherwise latest
 * @returns Filtered asset map
 */
export function getAssetsByType(
  assets: AssetRegistry | undefined | null,
  assetType: AssetVersion["type"],
  useBest = true,
): Partial<Record<AssetKey, AssetVersion>> {
  if (!assets) return {};
  const sourceAssets = useBest ? getAllBestAssets(assets) : getAllLatestAssets(assets);
  const result: Partial<Record<AssetKey, AssetVersion>> = {};
  for (const [key, version] of Object.entries(sourceAssets) as [AssetKey, AssetVersion][]) {
    if (version.type === assetType) {
      result[key] = version;
    }
  }
  return result;
}

/**
 * Get all assets created after `since`.
 *
 * @param assets - Asset registry
 * @param since - Date threshold
 * @param useBest - If true, filters best versions, otherwise latest
 * @returns Filtered asset map
 */
export function getAssetsSince(
  assets: AssetRegistry | undefined | null,
  since: Date,
  useBest = true,
): Partial<Record<AssetKey, AssetVersion>> {
  if (!assets) return {};
  const sourceAssets = useBest ? getAllBestAssets(assets) : getAllLatestAssets(assets);
  const result: Partial<Record<AssetKey, AssetVersion>> = {};
  const sinceTime = since.getTime();
  for (const [key, version] of Object.entries(sourceAssets) as [AssetKey, AssetVersion][]) {
    if (version.createdAt.getTime() > sinceTime) {
      result[key] = version;
    }
  }
  return result;
}

// ============================================================================
// QUALITY & EVALUATION
// ============================================================================

/**
 * Check if asset has quality evaluation.
 *
 * @param version - Asset version to check
 * @returns true if evaluated
 */
export function isAssetEvaluated(version: AssetVersion | undefined): boolean {
  return !!version?.metadata?.evaluation;
}

/**
 * Get quality score from asset.
 *
 * @param version - Asset version
 * @returns Quality score or undefined
 */
export function getAssetQualityScore(version: AssetVersion | undefined): number | undefined {
  return version?.metadata?.evaluation?.score;
}

/**
 * Check if asset passes quality threshold.
 *
 * @param version - Asset version
 * @param threshold - Minimum quality score (0-1)
 * @returns true if passes threshold
 */
export function assetPassesQuality(version: AssetVersion | undefined, threshold: number): boolean {
  const score = getAssetQualityScore(version);
  return score !== undefined && score >= threshold;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if asset is a video.
 */
export function isVideoAsset(version: AssetVersion | undefined): version is AssetVersion & { type: "video" } {
  return version?.type === "video";
}

/**
 * Type guard to check if asset is an image.
 */
export function isImageAsset(version: AssetVersion | undefined): version is AssetVersion & { type: "image" } {
  return version?.type === "image";
}

/**
 * Type guard to check if asset is text.
 */
export function isTextAsset(version: AssetVersion | undefined): version is AssetVersion & { type: "text" } {
  return version?.type === "text";
}

export type ImageEntityPrimitiveType = "image";

/**
 * Get entity type from scope
 */
export function entityTypeOf(scope: Scope): EntityPrimitiveType | ImageEntityPrimitiveType {
  if ("sceneIds" in scope) return "scene";
  if ("characterIds" in scope) return "character";
  if ("locationIds" in scope) return "location";
  if ("propIds" in scope) return "prop";
  if ("fileIds" in scope) return "file";
  return "project";
}

/**
 * Get entity ID from scope at specific index
 */
export function entityIdAt(scope: Scope): { column: string; ids: string[] } {
  if ("sceneIds" in scope) return { column: "sceneId", ids: scope.sceneIds };
  if ("characterIds" in scope) return { column: "characterId", ids: scope.characterIds };
  if ("locationIds" in scope) return { column: "locationId", ids: scope.locationIds };
  if ("propIds" in scope) return { column: "propId", ids: scope.propIds };
  if ("fileIds" in scope) return { column: "fileId", ids: scope.fileIds };
  return { column: "projectId", ids: [scope.projectId] };
}

/**
 * Maps entity types to their respective valid asset keys for O(1) lookup.
 */
export const ASSET_KEY_MAP: Record<string, Set<string>> = {
  scene: new Set(SCENE_APPLICABLE_ASSET_KEYS),
  character: new Set(CHARACTER_APPLICABLE_ASSET_KEYS),
  location: new Set(LOCATION_APPLICABLE_ASSET_KEYS),
};
