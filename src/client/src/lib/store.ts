// client/src/lib/store.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import { Project as ProjectBackend, Scene as SceneBackend, Character as CharacterBackend, Location as LocationBackend, InterruptValueType } from '../../../shared/types/index.js';
import { PipelineStatus, PipelineMessage } from '../../../shared/types/pipeline.types.js';
import {
  AssetRegistry,
  AssetKey,
  AssetVersion,
  AssetHistory
} from '../../../shared/types/assets.types.js';
import {
  getAllBestAssets,
  getAllLatestAssets,
  getBestAsset,
  getLatestAsset,
  getAssetVersion,
  getAllAssetVersions,
  getAssetUrl,
  getAssetUrls,
} from '../../../shared/utils/assets-utils.js';
import { enableMapSet } from "immer"

// ---------------------------------------------------------------------------
// Stripped types: the client-facing Project/Scene/Character/Location types
// explicitly OMIT `assets` so that nothing in component-land can accidentally
// read .assets off an entity.  The single source of truth is the `assets` Map.
// ---------------------------------------------------------------------------
type Scene = Omit<SceneBackend, "assets">;
type Character = Omit<CharacterBackend, "assets">;
type Location = Omit<LocationBackend, "assets">;
type Project = Omit<(ProjectBackend & { characters: Character[]; scenes: Scene[]; locations: Location[]; }), "assets">;

// ============================================================================
// SINGLETON GUARD
// ============================================================================

if ((globalThis as any).__STORE_INITIALIZED__) {
  console.error("❌ CRITICAL: Multiple Store Instances Detected!");
}
(globalThis as any).__STORE_INITIALIZED__ = true;

// ============================================================================
// TYPES
// ============================================================================

type ConnectionStatus = "connected" | "disconnected" | "connecting";

/**
 * Optimistic update tracking
 */
interface OptimisticUpdate {
  id: string;
  entityId: string;
  assetKey: AssetKey;
  version: number;
  timestamp: number;
  revertData?: any;
}

export type InterruptionState = {
  error: string;
  functionName?: string;
  currentParams: any;
  type: InterruptValueType;
}

// ============================================================================
// STATE INTERFACE
// ============================================================================

interface AppState {
  // --- project & pipeline ------------------------------------------------
  selectedProject: string | null;
  connectionStatus: ConnectionStatus;
  isHydrated: boolean;
  project: Project | null;
  projectStatus: PipelineStatus;
  isLoading: boolean;
  error: string | null;
  interruptState: InterruptionState | null;
  messages: PipelineMessage[];

  // --- UI -----------------------------------------------------------------
  selectedSceneIndex: number | null;
  currentPlaybackTime: number;
  isPlaying: boolean;
  activeTab: string;
  isDark: boolean;
  viewedScenesHistory: string[];

  // --- normalised asset state ---------------------------------------------
  /**
   * Authoritative asset store.
   * Key: entityId (project/scene/character/location)
   * Updating an entity's assets means calling `setAssets(id, newRegistry)`.
   */
  assets: Map<string, AssetRegistry>;

  /** Optimistic updates pending server confirmation */
  optimisticUpdates: Map<string, OptimisticUpdate>;

  /** Optimistic timestamps for UI updates */
  optimisticTimestamps: Record<string, number>;

  /** URLs that failed to load — UI components should skip these. */
  ignoreAssetUrls: Set<string>;

  // --- actions ------------------------------------------------------------
  setSelectedProject: (projectId: string | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setIsHydrated: (hydrated: boolean) => void;
  setProject: (state: ProjectBackend | null) => void;
  setProjectStatus: (status: PipelineStatus) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setInterruptState: (state: AppState['interruptState']) => void;

  addMessage: (message: PipelineMessage) => void;
  clearMessages: () => void;
  removeMessage: (id: string) => void;

  updateSceneClientSide: (
    sceneId: string,
    updates: Partial<Scene> | ((state: Scene) => Partial<Scene>)
  ) => void;

  setSelectedSceneIndex: (idx: number | null) => void;
  setCurrentPlaybackTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setActiveTab: (tab: string) => void;
  setIsDark: (isDark: boolean) => void;
  setOptimisticTimestamp: (sceneId: string, timestamp: number) => void;
  resetDashboard: () => void;
  addViewedScene: (sceneId: string) => void;

  /**
   * Update assets for a specific entity.
   * This is the primary way to update the normalized cache.
   */
  setAssets: (entityId: string, assets: AssetRegistry) => void;

  /**
   * Remove assets for an entity (e.g. deletion)
   */
  removeAssets: (entityId: string) => void;

  /**
   * Clear all assets (e.g. on project switch)
   */
  clearAllAssets: () => void;
  /**
   * Merge a single AssetHistory into one entity's registry.
   *
   * Use this for NEW_ASSETS_BATCH events — it preserves every sibling key that is
   * already cached.  (setAssets replaces the whole registry; this doesn't.)
   *
   * The read of the current registry and the write of the updated one happen
   * inside the same immer producer, so there is no stale-closure window.
   */
  mergeAssetHistories: (histories: { entityId: string, assetKey: AssetKey, history: AssetHistory; }[]) => void;
  /**
   * Intelligently merges a full registry into the store.
   * Preserves existing keys not present in new registry.
   * Merges history for conflicting keys.
   */
  mergeAssets: (entityId: string, registry: AssetRegistry) => void;

  addOptimisticUpdate: (update: Omit<OptimisticUpdate, 'timestamp'>) => void;
  confirmOptimisticUpdate: (updateId: string) => void;
  revertOptimisticUpdate: (updateId: string) => void;
  clearOptimisticUpdates: () => void;

  addIgnoreAssetUrl: (url: string) => void;
  removeIgnoreAssetUrl: (url: string) => void;
  clearIgnoreAssetUrls: () => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract every `assets` property from the project tree and
 * move them into the flat Map.  The project object that is stored in state
 * will have no `assets` fields — this is the contract enforced by the
 * Omit<…, "assets"> types above.
 *
 * We work on a shallow clone of `project` so that any external reference held
 * by the network layer (e.g. a response cache) is not mutated.
 */
function normalizeProjectAssets(project: ProjectBackend, assetsMap: Map<string, AssetRegistry>) {
  const out = { ...project } as any;

  if (out.assets) {
    assetsMap.set(out.id, out.assets);
    delete out.assets;
  }

  if (out.scenes) {
    out.scenes = out.scenes.map((s: SceneBackend) => {
      if (s.assets) {
        assetsMap.set(s.id, s.assets);
        const { assets: _, ...rest } = s;
        return rest;
      }
      return s;
    });
  }

  if (out.characters) {
    out.characters = out.characters.map((c: CharacterBackend) => {
      if (c.assets) {
        assetsMap.set(c.id, c.assets);
        const { assets: _, ...rest } = c;
        return rest;
      }
      return c;
    });
  }

  if (out.locations) {
    out.locations = out.locations.map((l: LocationBackend) => {
      if (l.assets) {
        assetsMap.set(l.id, l.assets);
        const { assets: _, ...rest } = l;
        return rest;
      }
      return l;
    });
  }

  return out as Project;
}

// ============================================================================
// STORE
// ============================================================================

enableMapSet();

export const useStore = create<AppState>()(
  subscribeWithSelector(
    immer((set) => ({
      // --- initial state ----------------------------------------------
      selectedProject: null,
      project: null,
      projectStatus: "ready",
      connectionStatus: "disconnected",
      messages: [],
      isHydrated: false,
      isLoading: false,
      error: null,
      interruptState: null,

      selectedSceneIndex: null,
      currentPlaybackTime: 0,
      isPlaying: false,
      isDark: true,
      activeTab: "scenes",
      viewedScenesHistory: [],

      assets: new Map<string, AssetRegistry>(),
      optimisticUpdates: new Map<string, OptimisticUpdate>(),
      optimisticTimestamps: {} as Record<string, number>,
      ignoreAssetUrls: new Set<string>(),

      // --- project & pipeline actions ---------------------------------
      setSelectedProject: (projectId) =>
        set((state) => {
          state.selectedProject = projectId;
          state.project = null;
          state.isHydrated = false;
          state.isLoading = false;
          state.error = null;
          state.projectStatus = 'ready';
          state.messages = [];
          state.assets.clear(); 
          state.viewedScenesHistory = [];
        }),

      /**
       * The single entry-point for hydrating project state.
       * Normalisation runs here; downstream code never sees .assets on entities.
       */
      setProject: (project) =>
        set((state) => {
          if (project) {
            state.project = normalizeProjectAssets(project, state.assets);
          } else {
            state.project = null;
          }
        }),

      setProjectStatus: (status) => set({ projectStatus: status }),
      setConnectionStatus: (status) => set({ connectionStatus: status }),
      setIsHydrated: (hydrated) => set({ isHydrated: hydrated }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      setInterruptState: (interruptState) => set({ interruptState }),

      // --- messages ---------------------------------------------------
      addMessage: (message) =>
        set((state) => {
          state.messages.unshift(message);
        }),
      clearMessages: () => set({ messages: [] }),
      removeMessage: (id) =>
        set((state) => {
          state.messages = state.messages.filter((m) => m.id !== id);
        }),

      // --- scene ------------------------------------------------------
      updateSceneClientSide: (sceneId, updates) =>
        set((state) => {
          if (state.project?.scenes) {
            const sceneIndex = state.project.scenes.findIndex((s) => s.id === sceneId);
            if (sceneIndex !== -1) {
              const scene = state.project.scenes[sceneIndex];
              
              const newValues = typeof updates === 'function' ? updates(scene) : updates;
              
              // If the caller accidentally included assets (e.g. from a raw API
              // response that wasn't normalised), extract them here too.
              if ('assets' in newValues && newValues.assets) {
                state.assets.set(sceneId, newValues.assets);
                const { assets, ...rest } = newValues as any; 
                Object.assign(scene, rest);
              } else {
                Object.assign(scene, newValues);
              }
            }
          }
        }),

      // --- UI ---------------------------------------------------------
      setSelectedSceneIndex: (index) => set({ selectedSceneIndex: index }),
      setCurrentPlaybackTime: (time) => set({ currentPlaybackTime: time }),
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      setIsDark: (isDark) => set({ isDark }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setOptimisticTimestamp: (sceneId, timestamp) =>
        set((state) => {
          state.optimisticTimestamps[sceneId] = timestamp;
        }),
      resetDashboard: () =>
        set({
          projectStatus: "ready",
          selectedSceneIndex: null,
          currentPlaybackTime: 0,
        }),
      addViewedScene: (sceneId) =>
        set((state) => {
          if (!state.viewedScenesHistory.includes(sceneId)) {
            state.viewedScenesHistory.push(sceneId);
            state.viewedScenesHistory = state.viewedScenesHistory.slice(-5);
          }
        }),

      // --- asset map --------------------------------------------------
      setAssets: (entityId, assets) =>
        set((state) => {
            state.assets.set(entityId, assets);
        }),
      removeAssets: (entityId) =>
        set((state) => {
          state.assets.delete(entityId);
        }),
      clearAllAssets: () =>
        set((state) => {
          state.assets.clear();
        }),
      mergeAssetHistories: (histories) =>
        set((state) => {
          histories.forEach(({ entityId, assetKey, history }) => {
            const existing = state.assets.get(entityId) ?? {};
            const existingHistory = existing[assetKey];
            
            // Deep merge to prevent race conditions and data loss
            const mergedHistory: AssetHistory = existingHistory ? {
              head: Math.max(existingHistory.head, history.head),
              best: history.best !== 0 ? history.best : existingHistory.best,
              versions: [
                ...existingHistory.versions.filter(v => !history.versions.some(hv => hv.version === v.version)),
                ...history.versions
              ].sort((a, b) => a.version - b.version)
            } : history;

            state.assets.set(entityId, { 
              ...existing, 
              [assetKey]: mergedHistory 
            });
          });
        }),
      mergeAssets: (entityId, registry) =>
        set((state) => {
          const existing = state.assets.get(entityId);
          if (!existing) {
             state.assets.set(entityId, registry);
             return;
          }
          // Merge keys
          Object.entries(registry).forEach(([key, history]) => {
              if (!existing[key as AssetKey]) {
                  existing[key as AssetKey] = history;
              } else {
                  // Merge existing history with new history
                  Object.assign(existing[key as AssetKey]!, history);
              }
          });
        }),

      // --- optimistic updates -----------------------------------------
      addOptimisticUpdate: (update) =>
        set((state) => {
          state.optimisticUpdates.set(update.id, {
            ...update,
            timestamp: Date.now(),
          });
        }),
      confirmOptimisticUpdate: (updateId) =>
        set((state) => {
          state.optimisticUpdates.delete(updateId);
        }),
      /**
      * TODO: when revertData is populated, splice it back into state.assets
      * before deleting the optimistic entry.
      */
      revertOptimisticUpdate: (updateId) =>
        set((state) => {
          state.optimisticUpdates.delete(updateId);
        }),
      clearOptimisticUpdates: () =>
        set((state) => {
          state.optimisticUpdates.clear();
        }),

      // --- ignore list ------------------------------------------------
      addIgnoreAssetUrl: (url) =>
        set((state) => {
          state.ignoreAssetUrls.add(url);
        }),
      removeIgnoreAssetUrl: (url) =>
        set((state) => {
          state.ignoreAssetUrls.delete(url);
        }),
      clearIgnoreAssetUrls: () =>
        set((state) => {
          state.ignoreAssetUrls.clear();
        }),
    }))
  )
);

// ============================================================================
// SELECTORS
// ============================================================================
// These are the only way components should read from the store.
// Each selector is referentially stable when its slice hasn't changed,
// which is what keeps subscribeWithSelector from triggering spurious re-renders.

export const selectProject = (state: AppState) => state.project;
export const selectProjectStatus = (state: AppState) => state.projectStatus;
export const selectSelectedSceneIndex = (state: AppState) => state.selectedSceneIndex;
export const selectIsLoading = (state: AppState) => state.isLoading;

/**
 * Get current scene with proper null handling (without assets property)
 */
export const selectCurrentScene = (state: AppState): Scene | null => {
  if (!state.project?.scenes || state.selectedSceneIndex === null) {
    return null;
  }
  return state.project.scenes[state.selectedSceneIndex] ?? null;
};

/**
 * Get assets for current scene from normalized store
 */
export const selectCurrentSceneAssets = (state: AppState): AssetRegistry | null => {
  const scene = selectCurrentScene(state);
  if (!scene) return null;
  return state.assets.get(scene.id) ?? null;
};

/**
 * Get best assets for current scene
 */
export const selectCurrentSceneBestAssets = (state: AppState) => {
  const assets = selectCurrentSceneAssets(state);
  return getAllBestAssets(assets);
};

// ============================================================================
// HOOKS
// ============================================================================

/**
 * All asset accessors scoped to one scene.
 *
 * @param sceneId - The scene to read assets for, or null for a no-op stub.
 */
export function useSceneAssets(sceneId: string | null) {
  const registry = useStore((state) =>
    sceneId ? (state.assets.get(sceneId) ?? null) : null
  );

  if (!registry) {
    return {
      assets: null,
      bestAssets: {} as Partial<Record<AssetKey, AssetVersion>>,
      latestAssets: {} as Partial<Record<AssetKey, AssetVersion>>,
      getAsset: () => undefined as AssetVersion | undefined,
      getAssetUrl: () => undefined as string | undefined,
    };
  }

  // All derived values are computed from `registry`.  Because the cache in
  // asset-utils is keyed on the registry object reference, these are O(1) on
  // repeat renders as long as the registry hasn't changed.
  return {
    assets: registry,
    bestAssets: getAllBestAssets(registry),
    latestAssets: getAllLatestAssets(registry),
    getAsset: (key: AssetKey, version?: number): AssetVersion | undefined =>
      version !== undefined ? getAssetVersion(registry, key, version) : getBestAsset(registry, key),
    getAssetUrl: (key: AssetKey, version?: number): string | undefined =>
      getAssetUrl(registry, key, version),
  };
}

/**
 * All asset accessors scoped to the currently-loaded project.
 * Subscribes to both `project` (for the id) and `assets` (for the registry).
 */
export function useProjectAssets() {
  const projectId = useStore((state) => state.project?.id ?? null);
  const registry = useStore((state) =>
    state.project ? (state.assets.get(state.project.id) ?? null) : null
  );
  
  if (!registry) {
    return {
      assets: null,
      bestAssets: {} as Partial<Record<AssetKey, AssetVersion>>,
      latestAssets: {} as Partial<Record<AssetKey, AssetVersion>>,
      getAsset: () => undefined as AssetVersion | undefined,
      getAssetUrl: () => undefined as string | undefined,
    };
  }

  return {
    assets: registry,
    bestAssets: getAllBestAssets(registry),
    latestAssets: getAllLatestAssets(registry),
    getAsset: (key: AssetKey, version?: number): AssetVersion | undefined =>
      version !== undefined ? getAssetVersion(registry, key, version) : getBestAsset(registry, key),
    getAssetUrl: (key: AssetKey, version?: number): string | undefined =>
      getAssetUrl(registry, key, version),
  };
}

/**
 * All asset accessors scoped to one character.
 *
 * @param characterId - The character to read assets for, or null for a no-op stub.
 */
export function useCharacterAssets(characterId: string | null) {
  const registry = useStore((state) =>
    characterId ? (state.assets.get(characterId) ?? null) : null
  );

  if (!registry) {
    return {
      assets: null,
      bestAssets: {} as Partial<Record<AssetKey, AssetVersion>>,
      latestAssets: {} as Partial<Record<AssetKey, AssetVersion>>,
      getAsset: () => undefined as AssetVersion | undefined,
      getAssetUrl: () => undefined as string | undefined,
    };
  }

  return {
    assets: registry,
    bestAssets: getAllBestAssets(registry),
    latestAssets: getAllLatestAssets(registry),
    getAsset: (key: AssetKey, version?: number): AssetVersion | undefined =>
      version !== undefined ? getAssetVersion(registry, key, version) : getBestAsset(registry, key),
    getAssetUrl: (key: AssetKey, version?: number): string | undefined =>
      getAssetUrl(registry, key, version),
  };
}

/**
 * All asset accessors scoped to one location.
 *
 * @param locationId - The location to read assets for, or null for a no-op stub.
 */
export function useLocationAssets(locationId: string | null) {
  const registry = useStore((state) =>
    locationId ? (state.assets.get(locationId) ?? null) : null
  );

  if (!registry) {
    return {
      assets: null,
      bestAssets: {} as Partial<Record<AssetKey, AssetVersion>>,
      latestAssets: {} as Partial<Record<AssetKey, AssetVersion>>,
      getAsset: () => undefined as AssetVersion | undefined,
      getAssetUrl: () => undefined as string | undefined,
    };
  }

  return {
    assets: registry,
    bestAssets: getAllBestAssets(registry),
    latestAssets: getAllLatestAssets(registry),
    getAsset: (key: AssetKey, version?: number): AssetVersion | undefined =>
      version !== undefined ? getAssetVersion(registry, key, version) : getBestAsset(registry, key),
    getAssetUrl: (key: AssetKey, version?: number): string | undefined =>
      getAssetUrl(registry, key, version),
  };
}