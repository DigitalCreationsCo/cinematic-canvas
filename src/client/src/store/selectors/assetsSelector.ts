// assetSelectors.ts
import { useShallow } from 'zustand/react/shallow';
import { useAssetStore } from '../useAssetStore.js';
import { getAllBestAssets } from '../../../../shared/utils/assets-utils.js';
import type { AssetKey, AssetVersion } from '../../../../shared/types/assets.types.js';

export type BestAssets = Partial<Record<AssetKey, AssetVersion>>;

// Stable empty ref — prevents Object.is churn for entities with no assets.
// getAllBestAssets(null) returns a new {} each call, this fixes that.
export const EMPTY_BEST_ASSETS: BestAssets = Object.freeze({});

export const safeBestAssets = (
    s: ReturnType<typeof useAssetStore.getState>,
    entityId: string | null
): BestAssets =>
    entityId
        ? getAllBestAssets(s.assets.get(entityId) ?? null) || EMPTY_BEST_ASSETS
        : EMPTY_BEST_ASSETS;