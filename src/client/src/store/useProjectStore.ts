// src/client/src/store/useProjectStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Project, Scene, Character, Location } from '../../../shared/types/index.js';
import type { ProjectMetadata } from '../../../shared/types/metadata.types.js';
import type { EditableSceneFields, EditableCharacterFields, EditableLocationFields } from '../../../shared/types/editable.types.js';
import { useAssetStore } from './useAssetStore.js';
import { subscribeWithSelector } from 'zustand/middleware';

// singleton guard
if ((globalThis as any).__STORE_INITIALIZED__) {
  console.error("❌ CRITICAL: Multiple Store Instances Detected!");
  console.trace("Store initialization trace:");
}
(globalThis as any).__STORE_INITIALIZED__ = true;

// ============================================================================
// TYPES
// ============================================================================

export type EntitySaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ProjectStoreState {
  // --- entity maps (keyed by entity id) -----------------------------------
  scenes: Map<string, Scene>;
  characters: Map<string, Character>;
  locations: Map<string, Location>;
  metadata: ProjectMetadata | null;

  // --- project selection --------------------------------------------------
  selectedProjectId: string | null;

  // --- scene navigation (previously in store.ts) --------------------------
  selectedSceneIndex: number | null;
  selectedCharacterId: string | null;
  selectedLocationId: string | null;
  viewedScenesHistory: string[];

  // --- per-entity save status ---------------------------------------------
  entitySaveStatus: Record<string, EntitySaveStatus>;
  entityLastSavedAt: Record<string, Date | null>;

  // --- actions -----------------------------------------------------------

  /**
   * Orchestrator called on FULL_STATE / WORKFLOW_STARTED.
   * 1. Hydrates scenes/characters/locations records
   * 2. Calls useAssetStore.normalizeFromProject(project) to extract asset Map
   * 3. Sets selectedProjectId
   */
  hydrateProject: (project: Project) => void;

  // Entity updaters — updateScene absorbs the old updateSceneClientSide logic:
  //   • Accepts Partial<Scene> OR functional updater (prev: Scene) => Partial<Scene>
  //   • Strips `assets` if accidentally included, routing them to useAssetStore
  //   • Does NOT trigger debounce — debounce is triggered externally by inspection panel
  updateScene: (id: string, updates: Partial<Scene> | ((prev: Scene) => Partial<Scene>)) => void;
  updateCharacter: (id: string, updates: Partial<Character> | ((prev: Character) => Partial<Character>)) => void;
  updateLocation: (id: string, updates: Partial<Location> | ((prev: Location) => Partial<Location>)) => void;

  addScene: (scene: Scene) => void;
  addCharacter: (character: Character) => void;
  addLocation: (location: Location) => void;

  deleteScene: (id: string) => void;
  deleteCharacter: (id: string) => void;
  deleteLocation: (id: string) => void;

  // Save status management
  setEntitySaveStatus: (entityId: string, status: EntitySaveStatus) => void;
  setEntityLastSavedAt: (entityId: string, date: Date) => void;

  // Scene navigation
  setSelectedSceneIndex: (idx: number | null) => void;
  setSelectedCharacterId: (id: string | null) => void;
  setSelectedLocationId: (id: string | null) => void;
  addViewedScene: (sceneId: string) => void;

  // Project selection
  setSelectedProjectId: (id: string | null) => void;

  // Metadata management
  updateMetadata: (updates: Partial<ProjectMetadata>) => void;

  // Session cleanup
  clearSession: () => void;
}

// ============================================================================
// STORE
// ============================================================================

export const useProjectStore = create<ProjectStoreState>()(
  subscribeWithSelector(
  immer((set, get) => ({
    scenes: new Map<string, Scene>(),
    characters: new Map<string, Character>(),
    locations: new Map<string, Location>(),
    metadata: null,
    metrics: null,

    selectedProjectId: null,
    selectedSceneIndex: null,
    selectedCharacterId: null,
    selectedLocationId: null,
    viewedScenesHistory: [],

    entitySaveStatus: {},
    entityLastSavedAt: {},

    // -----------------------------------------------------------------------
    hydrateProject: (project) => {
      console.debug('[useProjectStore] hydrateProject called', {
        projectId: project?.id,
        scenesCount: project?.scenes?.length ?? 0,
        charactersCount: project?.characters?.length ?? 0,
        locationsCount: project?.locations?.length ?? 0,
      });

      // 1. Delegate asset extraction to useAssetStore
      useAssetStore.getState().normalizeFromProject(project);

      // 2. Populate entity maps (entities have .assets stripped by normalizeFromProject)
      set((state) => {
        state.metadata = project.metadata || null;
        state.scenes = new Map(
          (project.scenes ?? []).map((s) => {
            const { assets: _, ...rest } = s;
            return [ s.id, rest as Scene ];
          })
        );
        state.characters = new Map(
          (project.characters ?? []).map((c: Character) => {
            const { assets: _, ...rest } = c as any;
            return [ c.id, rest as Character ];
          })
        );
        state.locations = new Map(
          (project.locations ?? []).map((l: Location) => {
            const { assets: _, ...rest } = l as any;
            return [ l.id, rest as Location ];
          })
        );
        state.selectedProjectId = project.id;
      });

      console.debug('[useProjectStore] hydrateProject completed', {
        projectId: project?.id,
        scenesMapSize: (project.scenes ?? []).length,
        charactersMapSize: (project.characters ?? []).length,
        locationsMapSize: (project.locations ?? []).length,
      });
    },

    // -----------------------------------------------------------------------
    updateScene: (id, updates) =>
      set((state) => {
        const existing = state.scenes.get(id);
        if (!existing) return;
        const resolved =
          typeof updates === 'function' ? updates(existing) : updates;

        // Strip assets if accidentally included — route them to useAssetStore
        if ('assets' in resolved && (resolved as any).assets) {
          useAssetStore.getState().mergeAssets(id, (resolved as any).assets);
          const { assets: _, ...rest } = resolved as any;
          state.scenes.set(id, { ...existing, ...rest } as Scene);
        } else {
          state.scenes.set(id, { ...existing, ...resolved } as Scene);
        }
      }),

    updateCharacter: (id, updates) =>
      set((state) => {
        const existing = state.characters.get(id);
        if (!existing) return;
        const resolved =
          typeof updates === 'function' ? updates(existing) : updates;
        state.characters.set(id, { ...existing, ...resolved } as Character);
      }),

    updateLocation: (id, updates) =>
      set((state) => {
        const existing = state.locations.get(id);
        if (!existing) return;
        const resolved =
          typeof updates === 'function' ? updates(existing) : updates;
        state.locations.set(id, { ...existing, ...resolved } as Location);
      }),

    addScene: (scene) =>
      set((state) => {
        state.scenes.set(scene.id, scene);
      }),
    addCharacter: (character) =>
      set((state) => {
        state.characters.set(character.id, character);
      }),
    addLocation: (location) =>
      set((state) => {
        state.locations.set(location.id, location);
      }),

    deleteScene: (id) =>
      set((state) => { state.scenes.delete(id); }),
    deleteCharacter: (id) =>
      set((state) => { state.characters.delete(id); }),
    deleteLocation: (id) =>
      set((state) => { state.locations.delete(id); }),

    setEntitySaveStatus: (entityId, status) =>
      set((state) => { state.entitySaveStatus[ entityId ] = status; }),

    setEntityLastSavedAt: (entityId, date) =>
      set((state) => { state.entityLastSavedAt[ entityId ] = date; }),

    setSelectedSceneIndex: (idx) =>
      set((state) => {
        state.selectedSceneIndex = idx;
        state.selectedCharacterId = null;
        state.selectedLocationId = null;
      }),
    setSelectedCharacterId: (id) =>
      set((state) => {
        state.selectedCharacterId = id;
        state.selectedSceneIndex = null;
        state.selectedLocationId = null;
      }),
    setSelectedLocationId: (id) =>
      set((state) => {
        state.selectedLocationId = id;
        state.selectedSceneIndex = null;
        state.selectedCharacterId = null;
      }),
    addViewedScene: (sceneId) =>
      set((state) => {
        if (!state.viewedScenesHistory.includes(sceneId)) {
          state.viewedScenesHistory.push(sceneId);
          if (state.viewedScenesHistory.length > 5) {
            state.viewedScenesHistory.shift();
          }
        }
      }),

    setSelectedProjectId: (id) =>
      set((state) => { state.selectedProjectId = id; }),

    updateMetadata: (updates) =>
      set((state) => {
        if (state.metadata) {
          state.metadata = { ...state.metadata, ...updates };
        }
      }),

    clearSession: () =>
      set((state) => {
        state.scenes = new Map();
        state.characters = new Map();
        state.locations = new Map();
        state.selectedProjectId = null;
        state.selectedSceneIndex = null;
        state.selectedCharacterId = null;
        state.selectedLocationId = null;
        state.viewedScenesHistory = [];
        state.entitySaveStatus = {};
        state.entityLastSavedAt = {};
      }),
  }))
  )
);

// ============================================================================
// SELECTORS
// ============================================================================

export const selectCurrentScene = (state: ProjectStoreState): Scene | null =>
  state.selectedSceneIndex !== null
    ? (Array.from(state.scenes.values())[ state.selectedSceneIndex ] ?? null)
    : null;

export const selectCurrentCharacter = (state: ProjectStoreState): Character | null =>
  state.selectedCharacterId
    ? (state.characters.get(state.selectedCharacterId) ?? null)
    : null;

export const selectCurrentLocation = (state: ProjectStoreState): Location | null =>
  state.selectedLocationId
    ? (state.locations.get(state.selectedLocationId) ?? null)
    : null;

/**
 * Derived global save status for the toolbar.
 * 'saving' if any entity is currently saving.
 * 'error' if any entity has an error.
 * 'saved' if at least one entity has been saved and none are saving/errored.
 * 'idle' otherwise.
 */
export const selectGlobalSaveStatus = (state: ProjectStoreState): EntitySaveStatus => {
  const statuses = Object.values(state.entitySaveStatus);
  if (statuses.some(s => s === 'saving')) return 'saving';
  if (statuses.some(s => s === 'error')) return 'error';
  if (statuses.some(s => s === 'saved')) return 'saved';
  return 'idle';
};

export const selectMostRecentSavedAt = (state: ProjectStoreState): Date | null => {
  const dates = Object.values(state.entityLastSavedAt).filter(Boolean) as Date[];
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map(d => d.getTime())));
};