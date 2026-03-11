// src/client/src/store/useAssetStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import type { AssetRegistry, AssetKey, AssetVersion, AssetHistory } from '../../../shared/types/assets.types.js';
import type { Project } from '../../../shared/types/entities.types.js';
import {
  getAllBestAssets,
  getAllLatestAssets,
  getBestAsset,
  getAssetVersion,
  getAssetUrl,
} from '../../../shared/utils/assets-utils.js';

enableMapSet();

interface AssetStoreState {
  // Map<entityId, AssetRegistry> — keyed by scene/character/location/project id
  assets: Map<string, AssetRegistry>;

  /**
   * Called by useProjectStore.hydrateProject().
   * Extracts assets from all project entities into the flat Map.
   * The Project object that comes from the server has .assets on every entity;
   * this method strips them out into the Map so the entity stores never see .assets.
   */
  normalizeFromProject: (project: Project) => void;

  setAssets:           (entityId: string, registry: AssetRegistry) => void;
  removeAssets:        (entityId: string) => void;
  clearAllAssets:      () => void;
  mergeAssets:         (entityId: string, registry: AssetRegistry) => void;
  mergeAssetHistories: (histories: { entityId: string; assetKey: AssetKey; history: AssetHistory }[]) => void;
}

export const useAssetStore = create<AssetStoreState>()(
  immer((set) => ({
    assets: new Map<string, AssetRegistry>(),

    normalizeFromProject: (project) =>
      set((state) => {
        // Project-level assets
        if ((project as any).assets) {
          state.assets.set(project.id, (project as any).assets);
        }
        (project.scenes ?? []).forEach((s: any) => {
          if (s.assets) state.assets.set(s.id, s.assets);
        });
        (project.characters ?? []).forEach((c: any) => {
          if (c.assets) state.assets.set(c.id, c.assets);
        });
        (project.locations ?? []).forEach((l: any) => {
          if (l.assets) state.assets.set(l.id, l.assets);
        });
      }),

    setAssets: (entityId, registry) =>
      set((state) => { state.assets.set(entityId, registry); }),

    removeAssets: (entityId) =>
      set((state) => { state.assets.delete(entityId); }),

    clearAllAssets: () =>
      set((state) => { state.assets.clear(); }),

    mergeAssets: (entityId, registry) =>
      set((state) => {
        const existing = state.assets.get(entityId);
        if (!existing) {
          state.assets.set(entityId, registry);
          return;
        }
        Object.entries(registry).forEach(([key, history]) => {
          const k = key as AssetKey;
          if (!existing[k]) {
            existing[k] = history;
          } else {
            Object.assign(existing[k]!, history);
          }
        });
      }),

    mergeAssetHistories: (histories) =>
      set((state) => {
        histories.forEach(({ entityId, assetKey, history }) => {
          const existing = state.assets.get(entityId) ?? {};
          const existingHistory = existing[assetKey];

          const merged: AssetHistory = existingHistory ? {
            head: Math.max(existingHistory.head, history.head),
            best: history.best !== 0 ? history.best : existingHistory.best,
            versions: [
              ...existingHistory.versions.filter(
                v => !history.versions.some(hv => hv.version === v.version)
              ),
              ...history.versions,
            ].sort((a, b) => a.version - b.version),
          } : history;

          state.assets.set(entityId, { ...existing, [assetKey]: merged });
        });
      }),
  }))
);

// ============================================================================
// ASSET HOOKS — moved from store.ts
// ============================================================================

export function useSceneAssets(sceneId: string | null) {
  const registry = useAssetStore(
    (state) => (sceneId ? (state.assets.get(sceneId) ?? null) : null)
  );
  return buildAssetAccessors(registry);
}

export function useProjectAssets(projectId: string | null) {
  const registry = useAssetStore(
    (state) => (projectId ? (state.assets.get(projectId) ?? null) : null)
  );
  return buildAssetAccessors(registry);
}

export function useCharacterAssets(characterId: string | null) {
  const registry = useAssetStore(
    (state) => (characterId ? (state.assets.get(characterId) ?? null) : null)
  );
  return buildAssetAccessors(registry);
}

export function useLocationAssets(locationId: string | null) {
  const registry = useAssetStore(
    (state) => (locationId ? (state.assets.get(locationId) ?? null) : null)
  );
  return buildAssetAccessors(registry);
}

function buildAssetAccessors(registry: AssetRegistry | null) {
  if (!registry) {
    return {
      assets: null,
      bestAssets: {} as Partial<Record<AssetKey, AssetVersion>>,
      latestAssets: {} as Partial<Record<AssetKey, AssetVersion>>,
      getAsset: (): AssetVersion | undefined => undefined,
      getAssetUrl: (): string | undefined => undefined,
    };
  }
  return {
    assets: registry,
    bestAssets: getAllBestAssets(registry),
    latestAssets: getAllLatestAssets(registry),
    getAsset: (key: AssetKey, version?: number): AssetVersion | undefined =>
      version !== undefined
        ? getAssetVersion(registry, key, version)
        : getBestAsset(registry, key),
    getAssetUrl: (key: AssetKey, version?: number): string | undefined =>
      getAssetUrl(registry, key, version),
  };
}
