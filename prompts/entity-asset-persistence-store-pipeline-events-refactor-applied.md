# CineNode — Entity Persistence, Store Refactor & Pipeline Event Migration
## One-Shot Implementation Prompt

> **This document is fully self-contained.** Implement every section completely in a single pass. Every architectural decision, type definition, store interface, API contract, debounce strategy, and migration path is specified below. Do not ask for clarification — all decisions have been made.

---

## TABLE OF CONTENTS

1. [Goals & Scope](#1-goals--scope)
2. [File Inventory — Create / Modify / Delete](#2-file-inventory)
3. [New Shared Types](#3-new-shared-types)
4. [New Pipeline Event: `ENTITY_UPDATED`](#4-new-pipeline-event-entity_updated)
5. [New Store: `useProjectStore`](#5-new-store-useprojectstore)
6. [New Store: `useAssetStore`](#6-new-store-useassetstore)
7. [Updated Store: `useCanvasUIStore`](#7-updated-store-usecanvasuistore)
8. [Updated Store: `usePipelineStore`](#8-updated-store-usepipelinestore)
9. [Store: `useWorldStore`](#9-store-useworldstore)
10. [Store: `useNodeStore`](#10-store-usenodestore)
11. [Auth Context Refactor](#11-auth-context-refactor)
12. [Composed Sign-Out: `useSignOut`](#12-composed-sign-out-usesignout)
13. [Entity Debounce Module](#13-entity-debounce-module)
14. [Client API Layer — `api.ts`](#14-client-api-layer--apits)
15. [Updated Hook: `use-pipeline-events.ts`](#15-updated-hook-use-pipeline-eventsts)
16. [Updated Hook: `use-media-preloader.ts`](#16-updated-hook-use-media-preloaderts)
17. [Updated Hook: `use-swr-api.ts`](#17-updated-hook-use-swr-apits)
18. [Backend: New REST Routes](#18-backend-new-rest-routes)
19. [Backend: `command-handler.ts` Rewrite](#19-backend-command-handlerts-rewrite)
20. [Pipeline: `SCENE_UPDATE` → `ENTITY_UPDATED` Migration](#20-pipeline-scene_update--entity_updated-migration)
21. [`WorldBuilderCanvas.tsx` Import Updates](#21-worldbuildercanvastsx-import-updates)
22. [Vitest Test Migration](#22-vitest-test-migration)
23. [Complete Implementation Checklist](#23-complete-implementation-checklist)

---

## 1. Goals & Scope

### What this refactor accomplishes

1. **Eliminates `store.ts`** — the monolithic store is dismantled. All state is migrated to purpose-specific stores. No state property is lost; all are relocated to the correct owner.

2. **Introduces `useProjectStore`** (renamed from `useEntityStore`) as the single source of truth for entity attributes (`Scene`, `Character`, `Location`), selected project ID, per-entity save status, and the `hydrateProject()` orchestrator.

3. **Introduces `useAssetStore`** as the single source of truth for the normalized `assets: Map<string, AssetRegistry>`. All asset hooks (`useSceneAssets`, etc.) migrate here.

4. **Introduces entity attribute persistence via REST** — a new `PATCH /api/entities` endpoint with a 3000ms debounced batch flush. Replaces the absent persistence layer that previously left entity edits client-side only.

5. **Introduces asset version promotion via REST** — `PATCH /api/assets/:entityId` replaces the existing `UPDATE_SCENE_ASSET` PubSub command. Direct DB write → SSE publish.

6. **Replaces `SCENE_UPDATE` pipeline event with `ENTITY_UPDATED`** — a single unified SSE event type covering all entity state changes (pipeline-driven and user-driven).

7. **Per-node save status** — each entity tracks `'idle' | 'saving' | 'saved' | 'error'` with a timestamp. Global toolbar derives aggregate. LocalStorage fallback on error with 1-hour TTL.

8. **Composes `clearSession`** across all stores via a single `useSignOut` hook.

### What does NOT change

- Schema (production-ready, no migrations needed)
- `useNodeStore.ts` — unchanged
- `useWorldStore.ts` — unchanged
- `indexedDBStorage.ts` — unchanged
- `use-mobile.tsx` — unchanged
- All canvas components that do not import from `store.ts` (e.g. `WorldBuilderCanvas` imports are updated but logic is unchanged)
- `assets-utils.ts` — unchanged
- `project-repository.ts` — unchanged
- All existing Drizzle query patterns — unchanged

---

## 2. File Inventory

### Files to CREATE (new)

| Path | Purpose |
|---|---|
| `src/client/src/store/useProjectStore.ts` | Replaces `useEntityStore.ts` — entities + save status + hydration orchestrator |
| `src/client/src/store/useAssetStore.ts` | Extracted from `store.ts` — normalized asset Map + all asset hooks |
| `src/client/src/lib/entityDebounce.ts` | Module-level debounce Map + flush logic |
| `src/client/src/hooks/useSignOut.ts` | Composed sign-out across all stores |
| `shared/types/editable.types.ts` | `EditableSceneFields`, `EditableCharacterFields`, `EditableLocationFields`, `EntityPatch`, `BatchEntityUpdateRequest` |

### Files to MODIFY

| Path | Change |
|---|---|
| `src/client/src/store/useCanvasUIStore.ts` | Add `isHydrated`, `isLoading`, `error`, `propertiesPanelTab`, `selectedSceneIndex`, `selectedCharacterId`, `selectedLocationId`, `currentPlaybackTime`, `isPlaying`, `activeTab`, `isDark`, `viewedScenesHistory` |
| `src/client/src/store/usePipelineStore.ts` | Add `connectionStatus`, unify `events`+`messages`, `clearAll()` action |
| `src/client/src/lib/auth-context.tsx` | Add `activeTeamId` state, update `signOut` to call `useSignOut` hook |
| `src/client/src/lib/api.ts` | Add `patchEntities()`, `patchAsset()` |
| `src/client/src/hooks/use-pipeline-events.ts` | Full rewrite — dispatch to new stores, handle `ENTITY_UPDATED` |
| `src/client/src/hooks/use-media-preloader.ts` | Replace `useStore` with `useAssetStore` |
| `src/client/src/hooks/use-swr-api.ts` | Remove `useStopPipeline`, keep remaining hooks |
| `src/server/routes.ts` | Add `PATCH /api/entities`, `PATCH /api/assets/:entityId` |
| `src/pipeline/command-handler.ts` | Rewrite `handleUpdateAsset` → `handleUpdateEntityAsset`, universal entity support |
| `src/pipeline/index.ts` | Remove `UPDATE_SCENE_ASSET` case, update `SCENE_UPDATE` emissions → `ENTITY_UPDATED` |
| `shared/types/pipeline.types.ts` | Add `EntityUpdatedEvent`, remove `SCENE_UPDATE` type, remove `UpdateSceneAssetCommand`, update `PipelineEvent` union, update `UpdateEntitiesCallback` |
| `src/components/canvas/WorldBuilderCanvas.tsx` | Update `useEntityStore` → `useProjectStore` import |
| All `*.test.*` files | Update store imports and event references (see Section 22) |

### Files to DELETE

| Path | Reason |
|---|---|
| `src/client/src/store/store.ts` | Fully replaced by purpose-specific stores |
| `src/client/src/store/useEntityStore.ts` | Renamed to `useProjectStore.ts` (not a rename — write fresh) |

---

## 3. New Shared Types

### `shared/types/editable.types.ts` — CREATE THIS FILE

```typescript
// shared/types/editable.types.ts
// Defines the editable field sets for each entity type.
// Used by PATCH /api/entities and the client debounce layer.

import { z } from 'zod';
import { SceneAttributes, SceneStatus } from './scene.types.js';
import { CharacterAttributes } from './character.types.js';
import { LocationAttributes } from './location.types.js';
import { AssetKey } from './assets.types.js';

// ============================================================================
// EDITABLE FIELD TYPES
// All fields are editable — use exclude by property name if restrictions needed later.
// Applicable asset keys are annotated per entity type.
// ============================================================================

export const SCENE_APPLICABLE_ASSET_KEYS: AssetKey[] = [
  'scene_video',
  'scene_start_frame',
  'scene_end_frame',
  'scene_description',
  'scene_prompt',
  'start_frame_prompt',
  'end_frame_prompt',
];

export const CHARACTER_APPLICABLE_ASSET_KEYS: AssetKey[] = [
  'character_image',
  'character_description',
  'character_prompt',
];

export const LOCATION_APPLICABLE_ASSET_KEYS: AssetKey[] = [
  'location_image',
  'location_description',
  'location_prompt',
];

// Editable fields for each entity — all fields from domain types are included.
export type EditableSceneFields = Partial<
  z.infer<typeof SceneAttributes> & z.infer<typeof SceneStatus>
>;

export type EditableCharacterFields = Partial<
  z.infer<typeof CharacterAttributes>
>;

export type EditableLocationFields = Partial<
  z.infer<typeof LocationAttributes>
>;

// ============================================================================
// ENTITY PATCH — discriminated union for type-safe batch updates
// ============================================================================

export type EntityPatch =
  | { entityId: string; entityType: 'scene';     patch: EditableSceneFields }
  | { entityId: string; entityType: 'character'; patch: EditableCharacterFields }
  | { entityId: string; entityType: 'location';  patch: EditableLocationFields };

// ============================================================================
// BATCH REQUEST BODY — sent to PATCH /api/entities
// ============================================================================

export interface BatchEntityUpdateRequest {
  projectId: string;
  updates: EntityPatch[];
}
```

### Add to `shared/types/index.ts`

Export `EditableSceneFields`, `EditableCharacterFields`, `EditableLocationFields`, `EntityPatch`, `BatchEntityUpdateRequest`, `SCENE_APPLICABLE_ASSET_KEYS`, `CHARACTER_APPLICABLE_ASSET_KEYS`, `LOCATION_APPLICABLE_ASSET_KEYS` from `editable.types.js`.

---

## 4. New Pipeline Event: `ENTITY_UPDATED`

### Changes to `shared/types/pipeline.types.ts`

#### ADD — `EntityUpdatedEvent`

```typescript
/**
 * Unified entity state update event.
 *
 * Emitted by:
 *   1. The REST PATCH /api/entities handler (user-initiated attribute edits)
 *   2. The REST PATCH /api/assets/:entityId handler (asset version promotion)
 *   3. The pipeline worker wherever SCENE_UPDATE was previously emitted
 *
 * Payload is an array to support both single-entity (REST) and
 * batch (pipeline) update patterns without multiple round-trips.
 *
 * Scalability note: payload carries the full entity object. For very large
 * entities this could become expensive; consider delta payloads in a future
 * optimisation if p95 SSE payload size exceeds ~50KB.
 */
export type EntityUpdatedEvent = PubSubMessage<
  "ENTITY_UPDATED",
  Array<{
    entityId: string;
    entityType: 'scene' | 'character' | 'location' | 'project';
    entity: Partial<Scene> | Partial<Character> | Partial<Location>;
    assets?: AssetRegistry;  // optional — included when asset best-pointer changed
  }>
>;
```

#### REMOVE — `SceneUpdateEvent`

Delete the `SceneUpdateEvent` type and its `"SCENE_UPDATE"` literal from the `PipelineEvent` union entirely.

#### REMOVE — `UpdateSceneAssetCommand`

Delete `UpdateSceneAssetCommand` type and remove `"UPDATE_SCENE_ASSET"` from the `PipelineCommand` union.

#### UPDATE — `PipelineEvent` union

```typescript
export type PipelineEvent =
  | WorkflowStartedEvent
  | FullStateEvent
  | SceneStartedEvent
  | EntityUpdatedEvent        // ← replaces SceneUpdateEvent
  | SceneSkippedEvent
  | WorkflowCompletedEvent
  | WorkflowFailedEvent
  | LlmInterventionNeededEvent
  | InterventionResolvedEvent
  | LogEvent
  | NewAssetsBatchEvent;
```

#### UPDATE — `UpdateEntitiesCallback` and `UpdateEntitiesCallbackArgs`

The existing `UpdateEntitiesCallback` type is used inside the pipeline worker to batch-emit scene state. Rename and update to match the `ENTITY_UPDATED` shape:

```typescript
// Replaces UpdateEntitiesCallbackArgs / UpdateEntitiesCallback
export type UpdateEntitiesCallbackArgs = [
  updates: Array<{
    entityId: string;
    entityType: 'scene' | 'character' | 'location';
    entity: Partial<Scene> | Partial<Character> | Partial<Location>;
    assets?: AssetRegistry;
  }>,
  saveToDb?: boolean,
];
export type UpdateEntitiesCallback = (...args: UpdateEntitiesCallbackArgs) => void;
```

Keep the old aliases as deprecated `@deprecated` type aliases pointing to the new names to prevent breaking any existing callers beyond the explicit migration sites:
```typescript
/** @deprecated Use UpdateEntitiesCallback */
export type UpdateEntitiesCallback = UpdateEntitiesCallback;
/** @deprecated Use UpdateEntitiesCallbackArgs */
export type UpdateEntitiesCallbackArgs = UpdateEntitiesCallbackArgs;
```

---

## 5. New Store: `useProjectStore`

**File:** `src/client/src/store/useProjectStore.ts`

This replaces `useEntityStore.ts`. It is the single source of truth for:
- Domain entity attribute data (`scenes`, `characters`, `locations`)
- Selected project ID
- Per-entity save status + last saved timestamps
- `hydrateProject()` orchestrator
- `clearSession()` for project-scoped state cleanup

```typescript
// src/client/src/store/useProjectStore.ts

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Project, Scene, Character, Location } from '../../../shared/types/index.js';
import type { EditableSceneFields, EditableCharacterFields, EditableLocationFields } from '../../../shared/types/editable.types.js';
import { useAssetStore } from './useAssetStore.js';

// ============================================================================
// TYPES
// ============================================================================

export type EntitySaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ProjectStoreState {
  // --- entity maps (keyed by entity id) -----------------------------------
  scenes:     Record<string, Scene>;
  characters: Record<string, Character>;
  locations:  Record<string, Location>;

  // --- project selection --------------------------------------------------
  selectedProjectId: string | null;

  // --- scene navigation (previously in store.ts) --------------------------
  selectedSceneIndex:    number | null;
  selectedCharacterId:   string | null;
  selectedLocationId:    string | null;
  viewedScenesHistory:   string[];

  // --- per-entity save status ---------------------------------------------
  entitySaveStatus:   Record<string, EntitySaveStatus>;
  entityLastSavedAt:  Record<string, Date | null>;

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
  updateScene:     (id: string, updates: Partial<Scene> | ((prev: Scene) => Partial<Scene>)) => void;
  updateCharacter: (id: string, updates: Partial<Character> | ((prev: Character) => Partial<Character>)) => void;
  updateLocation:  (id: string, updates: Partial<Location>  | ((prev: Location)  => Partial<Location>))  => void;

  deleteScene:     (id: string) => void;
  deleteCharacter: (id: string) => void;
  deleteLocation:  (id: string) => void;

  // Save status management
  setEntitySaveStatus: (entityId: string, status: EntitySaveStatus) => void;
  setEntityLastSavedAt: (entityId: string, date: Date) => void;

  // Scene navigation
  setSelectedSceneIndex:    (idx: number | null) => void;
  setSelectedCharacterId:   (id: string | null) => void;
  setSelectedLocationId:    (id: string | null) => void;
  addViewedScene:            (sceneId: string) => void;

  // Project selection
  setSelectedProjectId: (id: string | null) => void;

  // Session cleanup
  clearSession: () => void;
}

// ============================================================================
// STORE
// ============================================================================

export const useProjectStore = create<ProjectStoreState>()(
  immer((set, get) => ({
    scenes:     {},
    characters: {},
    locations:  {},

    selectedProjectId:    null,
    selectedSceneIndex:   null,
    selectedCharacterId:  null,
    selectedLocationId:   null,
    viewedScenesHistory:  [],

    entitySaveStatus:  {},
    entityLastSavedAt: {},

    // -----------------------------------------------------------------------
    hydrateProject: (project) => {
      // 1. Delegate asset extraction to useAssetStore
      useAssetStore.getState().normalizeFromProject(project);

      // 2. Populate entity maps (entities have .assets stripped by normalizeFromProject)
      set((state) => {
        state.scenes = Object.fromEntries(
          (project.scenes ?? []).map((s) => {
            const { assets: _, ...rest } = s as any;
            return [s.id, rest as Scene];
          })
        );
        state.characters = Object.fromEntries(
          (project.characters ?? []).map((c) => {
            const { assets: _, ...rest } = c as any;
            return [c.id, rest as Character];
          })
        );
        state.locations = Object.fromEntries(
          (project.locations ?? []).map((l) => {
            const { assets: _, ...rest } = l as any;
            return [l.id, rest as Location];
          })
        );
        state.selectedProjectId = project.id;
      });
    },

    // -----------------------------------------------------------------------
    updateScene: (id, updates) =>
      set((state) => {
        const existing = state.scenes[id];
        if (!existing) return;
        const resolved =
          typeof updates === 'function' ? updates(existing) : updates;
        // Strip assets if accidentally included — route them to useAssetStore
        if ('assets' in resolved && (resolved as any).assets) {
          useAssetStore.getState().mergeAssets(id, (resolved as any).assets);
          const { assets: _, ...rest } = resolved as any;
          Object.assign(state.scenes[id], rest);
        } else {
          Object.assign(state.scenes[id], resolved);
        }
      }),

    updateCharacter: (id, updates) =>
      set((state) => {
        const existing = state.characters[id];
        if (!existing) return;
        const resolved =
          typeof updates === 'function' ? updates(existing) : updates;
        Object.assign(state.characters[id], resolved);
      }),

    updateLocation: (id, updates) =>
      set((state) => {
        const existing = state.locations[id];
        if (!existing) return;
        const resolved =
          typeof updates === 'function' ? updates(existing) : updates;
        Object.assign(state.locations[id], resolved);
      }),

    deleteScene: (id) =>
      set((state) => { delete state.scenes[id]; }),
    deleteCharacter: (id) =>
      set((state) => { delete state.characters[id]; }),
    deleteLocation: (id) =>
      set((state) => { delete state.locations[id]; }),

    setEntitySaveStatus: (entityId, status) =>
      set((state) => { state.entitySaveStatus[entityId] = status; }),

    setEntityLastSavedAt: (entityId, date) =>
      set((state) => { state.entityLastSavedAt[entityId] = date; }),

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

    clearSession: () =>
      set((state) => {
        state.scenes = {};
        state.characters = {};
        state.locations = {};
        state.selectedProjectId = null;
        state.selectedSceneIndex = null;
        state.selectedCharacterId = null;
        state.selectedLocationId = null;
        state.viewedScenesHistory = [];
        state.entitySaveStatus = {};
        state.entityLastSavedAt = {};
      }),
  }))
);

// ============================================================================
// SELECTORS
// ============================================================================

export const selectCurrentScene = (state: ProjectStoreState): Scene | null =>
  state.selectedSceneIndex !== null
    ? (Object.values(state.scenes)[state.selectedSceneIndex] ?? null)
    : null;

export const selectCurrentCharacter = (state: ProjectStoreState): Character | null =>
  state.selectedCharacterId
    ? (state.characters[state.selectedCharacterId] ?? null)
    : null;

export const selectCurrentLocation = (state: ProjectStoreState): Location | null =>
  state.selectedLocationId
    ? (state.locations[state.selectedLocationId] ?? null)
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
  if (statuses.some(s => s === 'error'))  return 'error';
  if (statuses.some(s => s === 'saved'))  return 'saved';
  return 'idle';
};

export const selectMostRecentSavedAt = (state: ProjectStoreState): Date | null => {
  const dates = Object.values(state.entityLastSavedAt).filter(Boolean) as Date[];
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map(d => d.getTime())));
};
```

---

## 6. New Store: `useAssetStore`

**File:** `src/client/src/store/useAssetStore.ts`

Extracted from `store.ts`. Owns the normalized `assets: Map<string, AssetRegistry>`. All asset accessor hooks live here.

```typescript
// src/client/src/store/useAssetStore.ts

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import type { AssetRegistry, AssetKey, AssetVersion, AssetHistory } from '../../../shared/types/assets.types.js';
import type { Project } from '../../../shared/types/entities.types.js';
import type { SceneBackend, CharacterBackend, LocationBackend } from '../../../shared/types/index.js'; // adjust imports as needed
import {
  getAllBestAssets, getAllLatestAssets,
  getBestAsset, getLatestAsset,
  getAssetVersion, getAssetUrl,
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
```

---

## 7. Updated Store: `useCanvasUIStore`

**File:** `src/client/src/store/useCanvasUIStore.ts`

Add the following fields (migrated from `store.ts`) to the existing `useCanvasUIStore`. Do not remove any existing fields.

```typescript
// ADD to the state interface:

// Canvas loading state (previously in store.ts)
isHydrated: boolean;
isLoading:  boolean;
error:      string | null;

// Right sidebar active tab
propertiesPanelTab:
  | 'prompt'
  | 'camera'
  | 'gen'
  | 'traits'
  | 'attributes'
  | 'composite'
  | 'details'
  | 'quality'
  | 'continuity';

// Playback state (previously in store.ts)
currentPlaybackTime: number;
isPlaying:           boolean;

// App-level UI (previously in store.ts)
activeTab: string;
isDark:    boolean;

// ADD actions:
setIsHydrated:         (v: boolean) => void;
setIsLoading:          (v: boolean) => void;
setError:              (e: string | null) => void;
setPropertiesPanelTab: (tab: CanvasUIStore['propertiesPanelTab']) => void;
setCurrentPlaybackTime:(time: number) => void;
setIsPlaying:          (v: boolean) => void;
setActiveTab:          (tab: string) => void;
setIsDark:             (v: boolean) => void;

// ADD initial state values:
isHydrated:          false,
isLoading:           false,
error:               null,
propertiesPanelTab:  'prompt',
currentPlaybackTime: 0,
isPlaying:           false,
activeTab:           'scenes',
isDark:              true,
```

All action implementations are standard `set({ field: value })` patterns.

---

## 8. Updated Store: `usePipelineStore`

**File:** `src/client/src/store/usePipelineStore.ts`

Full replacement. Consolidates `events` and `messages` into a single `events` array (the old `messages` concept maps exactly to pipeline events). Adds `connectionStatus`. Adds `clearAll`.

```typescript
// src/client/src/store/usePipelineStore.ts

import { create } from 'zustand';

export type PipelineStatus =
  | 'idle' | 'analyzing' | 'generating' | 'evaluating'
  | 'error' | 'complete' | 'paused';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export interface PipelineEvent {
  id:        string;
  type:      'info' | 'warn' | 'error' | 'success';
  message:   string;
  timestamp: Date;
  sceneId?:  string;
}

export interface PipelineIntervention {
  jobType:        string;
  sceneId?:       string;
  commandId:      string;
  error:          string;
  originalParams: Record<string, any>;
  functionName?:  string;
  type?:          string;
}

interface PipelineStoreState {
  status:           PipelineStatus;
  connectionStatus: ConnectionStatus;
  events:           PipelineEvent[];     // max 100 — covers old 'messages' + 'events'
  interrupt:        PipelineIntervention | null;

  setStatus:           (status: PipelineStatus) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  pushEvent:           (event: PipelineEvent) => void;
  setInterrupt:        (interrupt: PipelineIntervention | null) => void;
  clearEvents:         () => void;
  clearAll:            () => void;  // called by useSignOut
}

export const usePipelineStore = create<PipelineStoreState>((set) => ({
  status:           'idle',
  connectionStatus: 'disconnected',
  events:           [],
  interrupt:        null,

  setStatus:           (status) => set({ status }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  pushEvent: (event) => set((state) => ({
    events: [event, ...state.events].slice(0, 100),
  })),

  setInterrupt: (interrupt) => set({ interrupt }),
  clearEvents:  () => set({ events: [] }),

  clearAll: () => set({
    status:    'idle',
    events:    [],
    interrupt: null,
    connectionStatus: 'disconnected',
  }),
}));
```

**Note on old `InterruptionState` type from `store.ts`:**

The old `InterruptionState` shape was:
```typescript
{ error: string; functionName?: string; currentParams: any; type: InterruptValueType }
```
The new `PipelineIntervention` covers the same fields. Update all call sites that used `setInterruptState` to use `usePipelineStore.getState().setInterrupt(...)` with the new shape. The `functionName` and `type` fields are preserved as optional on `PipelineIntervention`.

---

## 9. Store: `useWorldStore`

**File:** `src/client/src/store/useWorldStore.ts` — **NO CHANGES.** Keep exactly as-is.

---

## 10. Store: `useNodeStore`

**File:** `src/client/src/store/useNodeStore.ts` — **NO CHANGES.** Keep exactly as-is.

---

## 11. Auth Context Refactor

**File:** `src/client/src/lib/auth-context.tsx`

Add `activeTeamId` state to the auth context. The `signOut` function is updated to call `useSignOut` (see Section 12). `clearSession` in the old `store.ts` is no longer needed in the auth context — it is replaced by the composed `useSignOut` hook.

```typescript
// Add to AuthContextType:
activeTeamId: string | null;
setActiveTeamId: (id: string | null) => void;

// Add to AuthProvider state:
const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

// Update signOut to call the composed hook (inject it via prop or call directly):
// Since useSignOut is a hook and can't be called outside a component, 
// expose a clearStores function that AuthProvider calls:
```

**Implementation pattern for `signOut` in `AuthProvider`:**

```tsx
// Inside AuthProvider component:
const signOut = async () => {
  await supabase.auth.signOut();
  // Call each store's clear action directly (stores can be accessed outside React via .getState())
  useProjectStore.getState().clearSession();
  useAssetStore.getState().clearAllAssets();
  usePipelineStore.getState().clearAll();
  setActiveTeamId(null);
};
```

This is the idiomatic pattern — calling `store.getState().action()` outside React components is explicitly supported by Zustand and avoids the hook composition problem entirely. The `useSignOut` hook (Section 12) wraps this same logic for use inside components.

**Update `AuthContextType`:**
```typescript
interface AuthContextType {
  user:           User | null;
  session:        Session | null;
  isLoading:      boolean;
  activeTeamId:   string | null;
  setActiveTeamId:(id: string | null) => void;
  signOut:        () => Promise<void>;
}
```

**Export `useAuth` hook** — keep exactly as-is, it still reads from `AuthContext`.

---

## 12. Composed Sign-Out: `useSignOut`

**File:** `src/client/src/hooks/useSignOut.ts` — CREATE

```typescript
// src/client/src/hooks/useSignOut.ts
// Composes the sign-out action across all stores.
// Use this hook in components that need a sign-out button.
// Auth context's signOut also calls the same store.getState() pattern directly
// for non-component contexts.

import { useAuth } from '../lib/auth-context.js';
import { useProjectStore } from '../store/useProjectStore.js';
import { useAssetStore }   from '../store/useAssetStore.js';
import { usePipelineStore } from '../store/usePipelineStore.js';

export function useSignOut() {
  const { signOut } = useAuth();
  return signOut;
  // signOut in auth-context already calls all three store clearers.
  // This hook exists as a stable import target for components
  // so they don't need to import auth-context directly.
}
```

---

## 13. Entity Debounce Module

**File:** `src/client/src/lib/entityDebounce.ts` — CREATE

This module owns the debounce timer and dirty entity Map. It is called from `useProjectStore.updateScene/Character/Location` action wrappers via the inspection panel components (NOT from within the Zustand immer producer). The store actions update state immediately; the debounce schedules the persistence call separately.

```typescript
// src/client/src/lib/entityDebounce.ts
//
// Module-level debounce for entity attribute persistence.
// Accumulates dirty entities across multiple calls into a single
// batch request fired 3000ms after the last edit.
//
// DESIGN RULES:
//   • Lives outside React — no hooks, no closures over component state.
//   • One global dirty map. Key = entityId. Value = last-write-wins deep merge.
//   • Flush sends one PATCH /api/entities call regardless of dirty count.
//   • On success: marks each flushed entity as 'saved', clears localStorage.
//   • On failure: marks each entity as 'error', writes localStorage backup.

import { patchEntities } from './api.js';
import { useProjectStore } from '../store/useProjectStore.js';
import type { EntityPatch } from '../../../shared/types/editable.types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEBOUNCE_MS          = 3000;
const LS_KEY_PREFIX        = 'entity_unsaved_';
const LS_TTL_MS            = 60 * 60 * 1000; // 1 hour

// ============================================================================
// MODULE STATE
// ============================================================================

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingProjectId: string | null = null;

/**
 * The dirty map: entityId → latest deep-merged EntityPatch.
 * Last write wins per-field within the same entity.
 */
const dirtyMap = new Map<string, EntityPatch>();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Schedule a debounced persistence flush for a dirty entity.
 *
 * Call this from inspection panel onChange handlers AFTER calling
 * useProjectStore.updateScene/Character/Location to update in-memory state.
 *
 * @param projectId   Current project ID
 * @param patch       The EntityPatch describing what changed
 */
export function scheduleEntityFlush(projectId: string, patch: EntityPatch): void {
  pendingProjectId = projectId;

  // Deep-merge the new patch into any existing pending patch for this entity
  const existing = dirtyMap.get(patch.entityId);
  if (existing && existing.entityType === patch.entityType) {
    dirtyMap.set(patch.entityId, {
      ...existing,
      patch: deepMerge((existing as any).patch, (patch as any).patch),
    } as EntityPatch);
  } else {
    dirtyMap.set(patch.entityId, patch);
  }

  // Mark the entity as 'idle' in save status (pending, not yet flushed)
  // We intentionally do NOT set 'saving' here — only set on actual flush start
  // so that rapid typing doesn't flicker between idle/saving.

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushDirtyEntities, DEBOUNCE_MS);
}

/**
 * Force an immediate flush (e.g. on component unmount / route change).
 */
export function flushNow(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  flushDirtyEntities();
}

/**
 * Check localStorage for any stale unsaved changes on startup.
 * Call once on app init / project load.
 * If found and not expired: applies the patch to in-memory state and
 * sets the entity to 'error' save status so the user sees the recovery indicator.
 */
export function restoreUnsavedChanges(projectId: string): void {
  const now = Date.now();
  for (const [key, value] of Object.entries(localStorage)) {
    if (!key.startsWith(LS_KEY_PREFIX)) continue;
    try {
      const record = JSON.parse(value) as {
        patch: EntityPatch;
        projectId: string;
        timestamp: number;
      };
      // Skip if expired or belongs to a different project
      if (now - record.timestamp > LS_TTL_MS) {
        localStorage.removeItem(key);
        continue;
      }
      if (record.projectId !== projectId) continue;

      // Apply the stale patch to in-memory state
      const { patch } = record;
      if (patch.entityType === 'scene') {
        useProjectStore.getState().updateScene(patch.entityId, patch.patch as any);
      } else if (patch.entityType === 'character') {
        useProjectStore.getState().updateCharacter(patch.entityId, patch.patch as any);
      } else if (patch.entityType === 'location') {
        useProjectStore.getState().updateLocation(patch.entityId, patch.patch as any);
      }

      // Mark as error so node shows recovery indicator
      useProjectStore.getState().setEntitySaveStatus(patch.entityId, 'error');

      // Schedule a flush to attempt to persist the recovered changes
      scheduleEntityFlush(projectId, patch);
    } catch {
      localStorage.removeItem(key);
    }
  }

  // Clean up expired keys proactively
  cleanupExpiredLocalStorage();
}

// ============================================================================
// INTERNAL
// ============================================================================

async function flushDirtyEntities(): Promise<void> {
  if (!dirtyMap.size || !pendingProjectId) return;

  const projectId = pendingProjectId;
  const flushBatch = [...dirtyMap.values()];
  const flushIds = [...dirtyMap.keys()];

  // Clear the dirty map before the async call to avoid double-flush
  dirtyMap.clear();

  // Mark all flushed entities as 'saving'
  const { setEntitySaveStatus, setEntityLastSavedAt } = useProjectStore.getState();
  flushIds.forEach((id) => setEntitySaveStatus(id, 'saving'));

  try {
    await patchEntities({ projectId, updates: flushBatch });

    // Success
    const now = new Date();
    flushIds.forEach((id) => {
      setEntitySaveStatus(id, 'saved');
      setEntityLastSavedAt(id, now);
      localStorage.removeItem(`${LS_KEY_PREFIX}${id}`);
    });
  } catch (error) {
    console.error('[entityDebounce] Failed to persist entity changes:', error);

    // Failure — write localStorage backup, mark as error
    const timestamp = Date.now();
    flushBatch.forEach((patch) => {
      setEntitySaveStatus(patch.entityId, 'error');
      try {
        localStorage.setItem(
          `${LS_KEY_PREFIX}${patch.entityId}`,
          JSON.stringify({ patch, projectId, timestamp })
        );
      } catch {
        // localStorage quota exceeded — fail silently
      }
    });
  }
}

function cleanupExpiredLocalStorage(): void {
  const now = Date.now();
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(LS_KEY_PREFIX)) continue;
    try {
      const record = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (now - (record.timestamp ?? 0) > LS_TTL_MS) {
        localStorage.removeItem(key);
      }
    } catch {
      localStorage.removeItem(key);
    }
  }
}

/** Deep merge helper — last write wins per leaf key. */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      (result as any)[key] = deepMerge(result[key], value);
    } else {
      (result as any)[key] = value;
    }
  }
  return result;
}
```

### How inspection panel components use this

```typescript
// Inside any inspection panel onChange handler:
import { scheduleEntityFlush } from '#/lib/entityDebounce.js';
import { useProjectStore } from '#/store/useProjectStore.js';

// 1. Update in-memory state immediately (no flicker):
useProjectStore.getState().updateScene(sceneId, { description: newValue });

// 2. Schedule debounced persistence:
scheduleEntityFlush(projectId, {
  entityId: sceneId,
  entityType: 'scene',
  patch: { description: newValue },
});
```

### Save Status UI in canvas nodes

Canvas node components read:
```typescript
const saveStatus = useProjectStore(s => s.entitySaveStatus[entityId] ?? 'idle');
const lastSavedAt = useProjectStore(s => s.entityLastSavedAt[entityId] ?? null);
```

Node header shows:
- `'saving'` → spinner + "Saving..."
- `'saved'` + timestamp → "Saved 2 min ago" (use a `useRelativeTime` utility)
- `'error'` → red dot + "Unsaved" + tooltip explaining the error toast

**Error toast** (call from the flush failure branch):
```
"Changes could not be saved. Your edits are backed up locally and will be retried."
```
Show toast via the app's existing toast system.

**Global toolbar** reads `selectGlobalSaveStatus(useProjectStore.getState())`.

---

## 14. Client API Layer — `api.ts`

**File:** `src/client/src/lib/api.ts`

Add the following two functions. All existing functions remain unchanged.

```typescript
// ============================================================================
// Entity Attribute Updates
// ============================================================================

/**
 * Batch PATCH for entity attribute changes.
 * Called exclusively by the entityDebounce flush function.
 * Response body is intentionally ignored here — state is updated via SSE ENTITY_UPDATED.
 */
export const patchEntities = async (
  body: BatchEntityUpdateRequest
): Promise<void> => {
  await apiFetch('/entities', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
};

// ============================================================================
// Asset Version Promotion
// ============================================================================

/**
 * Promote an asset version (update the `best` pointer on asset_entries).
 * Replaces the old PubSub UPDATE_SCENE_ASSET command.
 * State update arrives via SSE ENTITY_UPDATED event.
 */
export const patchAsset = async (
  entityId: string,
  body: {
    entityType: 'scene' | 'character' | 'location' | 'project';
    assetKey: AssetKey;
    version: number | null;
    projectId: string;
  }
): Promise<void> => {
  await apiFetch(`/assets/${entityId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
};
```

**Import additions at top of `api.ts`:**
```typescript
import type { AssetKey } from '../../../shared/types/assets.types.js';
import type { BatchEntityUpdateRequest } from '../../../shared/types/editable.types.js';
```

---

## 15. Updated Hook: `use-pipeline-events.ts`

**File:** `src/client/src/hooks/use-pipeline-events.ts` — FULL REWRITE

This hook is a dispatcher only. All `useStore` imports are replaced with purpose-specific stores.

```typescript
// src/client/src/hooks/use-pipeline-events.ts

import { EventSource } from 'eventsource';
import { useEffect } from 'react';
import { useAuth } from '#/lib/auth-context.js';
import { PipelineEvent } from '../../../shared/types/pipeline.types.js';
import { reviveDates } from '../../../shared/utils/utils.js';
import { requestFullState } from '#/lib/api.js';
import { supabase } from '#/lib/supabase.js';
import { v7 as uuidv7 } from 'uuid';
import { restoreUnsavedChanges } from '#/lib/entityDebounce.js';

// New stores
import { useProjectStore } from '#/store/useProjectStore.js';
import { useAssetStore }   from '#/store/useAssetStore.js';
import { usePipelineStore } from '#/store/usePipelineStore.js';
import { useCanvasUIStore } from '#/store/useCanvasUIStore.js';

interface UsePipelineEventsProps {
  projectId: string | null;
}

export function usePipelineEvents({ projectId }: UsePipelineEventsProps) {
  // --- project store ---
  const hydrateProject       = useProjectStore((s) => s.hydrateProject);
  const updateScene          = useProjectStore((s) => s.updateScene);
  const updateCharacter      = useProjectStore((s) => s.updateCharacter);
  const updateLocation       = useProjectStore((s) => s.updateLocation);
  const setSelectedSceneIndex = useProjectStore((s) => s.setSelectedSceneIndex);

  // --- asset store ---
  const mergeAssetHistories  = useAssetStore((s) => s.mergeAssetHistories);
  const mergeAssets          = useAssetStore((s) => s.mergeAssets);

  // --- pipeline store ---
  const setStatus            = usePipelineStore((s) => s.setStatus);
  const setConnectionStatus  = usePipelineStore((s) => s.setConnectionStatus);
  const setInterrupt         = usePipelineStore((s) => s.setInterrupt);
  const pushEvent            = usePipelineStore((s) => s.pushEvent);

  // --- canvas UI store ---
  const setIsHydrated        = useCanvasUIStore((s) => s.setIsHydrated);
  const setIsLoading         = useCanvasUIStore((s) => s.setIsLoading);
  const setError             = useCanvasUIStore((s) => s.setError);

  // --- auth ---
  const { activeTeamId } = useAuth();

  useEffect(() => {
    if (!projectId) {
      setConnectionStatus('disconnected');
      setIsLoading(false);
      setError(null);
      return;
    }

    setError(null);
    setConnectionStatus('connecting');

    let isMounted = true;
    let eventSource: EventSource | null = null;

    const connectEventSource = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        eventSource = new EventSource(`/api/events/${projectId}`, {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              headers: {
                ...init.headers,
                ...(session?.access_token
                  ? { Authorization: `Bearer ${session.access_token}` }
                  : {}),
                ...(activeTeamId ? { 'x-team-id': activeTeamId } : {}),
              },
            }),
        });

        eventSource.onopen = handleOpen;
        eventSource.onmessage = handleMessage;
        eventSource.onerror = handleError;
      } catch (err) {
        console.error('Failed to setup SSE', err);
        if (isMounted) {
          setConnectionStatus('disconnected');
          setError('Failed to fetch authentication session for stream');
        }
      }
    };

    const handleOpen = () => {
      setConnectionStatus('connected');
      setError(null);
      // Restore any locally-backed-up unsaved changes from the previous session
      restoreUnsavedChanges(projectId);
      requestFullState({ projectId })
        .catch((e) => console.error({ e }, 'Failed to request full state'));
    };

    const handleMessage = (event: any) => {
      try {
        setIsLoading(true);
        const raw = JSON.parse(event.data);
        const parsed = reviveDates(raw) as PipelineEvent;

        switch (parsed.type) {
          // ------------------------------------------------------------------
          // WORKFLOW_STARTED
          // ------------------------------------------------------------------
          case 'WORKFLOW_STARTED':
            if (parsed.payload.project) {
              hydrateProject(parsed.payload.project);
              setIsLoading(false);
              setStatus('analyzing');
            }
            break;

          // ------------------------------------------------------------------
          // FULL_STATE
          // isHydrated is read via getState() — NOT from the closure — to
          // prevent the effect from tearing down the EventSource when it flips.
          // ------------------------------------------------------------------
          case 'FULL_STATE':
            hydrateProject(parsed.payload.project);
            if (!useCanvasUIStore.getState().isHydrated) {
              setIsHydrated(true);
              setIsLoading(false);
            }
            break;

          // ------------------------------------------------------------------
          // SCENE_STARTED — pipeline signals a scene is beginning generation
          // ------------------------------------------------------------------
          case 'SCENE_STARTED':
            updateScene(parsed.payload.scene.id, { status: 'generating' });
            setSelectedSceneIndex(parsed.payload.scene.sceneIndex);
            setStatus('generating');
            break;

          // ------------------------------------------------------------------
          // ENTITY_UPDATED
          // Replaces the old SCENE_UPDATE. Handles scenes, characters, locations.
          // Strips assets from entity payload and routes them to useAssetStore.
          // ------------------------------------------------------------------
          case 'ENTITY_UPDATED': {
            const updates = parsed.payload;
            for (const update of updates) {
              const { assets, entity, entityId, entityType } = update;

              // Merge assets if included in the payload
              if (assets) {
                mergeAssets(entityId, assets);
              }

              // Update entity in the correct store map
              if (entityType === 'scene') {
                updateScene(entityId, entity as any);
                const scene = entity as any;
                if (scene.sceneIndex !== undefined) {
                  setSelectedSceneIndex(scene.sceneIndex);
                }
                if (scene.status === 'evaluating') setStatus('evaluating');
                else if (scene.status === 'generating') setStatus('generating');
              } else if (entityType === 'character') {
                updateCharacter(entityId, entity as any);
              } else if (entityType === 'location') {
                updateLocation(entityId, entity as any);
              }
            }
            break;
          }

          // ------------------------------------------------------------------
          // NEW_ASSETS_BATCH — delta asset history merge
          // ------------------------------------------------------------------
          case 'NEW_ASSETS_BATCH':
            mergeAssetHistories(parsed.payload);
            break;

          case 'SCENE_SKIPPED':
            // Reserved for future UI wiring
            break;

          // ------------------------------------------------------------------
          // LOG — surface errors, warnings, and summary markers
          // ------------------------------------------------------------------
          case 'LOG': {
            const { level, message, sceneId } = parsed.payload;
            if (
              level === 'error' ||
              level === 'warn' ||
              message.includes('✓') ||
              message.includes('✗')
            ) {
              pushEvent({
                id: uuidv7(),
                type: level,
                message,
                timestamp: new Date(parsed.timestamp),
                sceneId,
              });
            }
            break;
          }

          case 'WORKFLOW_COMPLETED':
            setStatus('complete');
            setIsLoading(false);
            break;

          case 'WORKFLOW_FAILED':
            setError(parsed.payload.error);
            setStatus('error');
            setIsLoading(false);
            pushEvent({
              id: uuidv7(),
              type: 'error',
              message: `Workflow failed: ${parsed.payload.error}`,
              timestamp: new Date(parsed.timestamp),
            });
            break;

          case 'LLM_INTERVENTION_NEEDED':
            setInterrupt({
              error:          parsed.payload.error,
              functionName:   parsed.payload.functionName,
              originalParams: parsed.payload.params ?? {},
              commandId:      uuidv7(),
              jobType:        parsed.payload.jobType ?? '',
              type:           parsed.payload.type,
            });
            setStatus('paused');
            pushEvent({
              id: uuidv7(),
              type: 'warn',
              message: `Paused. Intervention required: ${parsed.payload.error}`,
              timestamp: new Date(parsed.timestamp),
            });
            break;

          default:
            console.warn('[SSE] Unexpected event type:', (parsed as any).type);
        }
      } catch (e) {
        console.error('Failed to parse SSE event:', e, event.data);
      }
    };

    const handleError = (err: any) => {
      console.error(`SSE error for project ${projectId}:`, err);
      setConnectionStatus('disconnected');
      setError('Connection to event stream failed');
    };

    connectEventSource();

    return () => {
      isMounted = false;
      eventSource?.close();
      setConnectionStatus('disconnected');
    };
  }, [
    projectId,
    hydrateProject,
    updateScene, updateCharacter, updateLocation,
    setSelectedSceneIndex,
    mergeAssetHistories, mergeAssets,
    setStatus, setConnectionStatus, setInterrupt, pushEvent,
    setIsHydrated, setIsLoading, setError,
    activeTeamId,
  ]);

  return {};
}
```

---

## 16. Updated Hook: `use-media-preloader.ts`

**File:** `src/client/src/hooks/use-media-preloader.ts`

Replace `useStore` with `useAssetStore`. The logic is identical; only the store import changes.

```typescript
// Replace:
import { useStore } from '#/lib/store.js';
// ...
const sceneRegistries = useStoreWithEqualityFn(
  useStore,
  (state) => targetSceneIds.map((id) => ({
    sceneId: id,
    registry: state.assets.get(id) ?? null,
  })),
  ...
);

// With:
import { useAssetStore } from '#/store/useAssetStore.js';
// ...
const sceneRegistries = useStoreWithEqualityFn(
  useAssetStore,
  (state) => targetSceneIds.map((id) => ({
    sceneId: id,
    registry: state.assets.get(id) ?? null,
  })),
  (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].sceneId !== b[i].sceneId) return false;
      if (a[i].registry !== b[i].registry) return false;
    }
    return true;
  }
);
```

All other logic in this file is unchanged.

---

## 17. Updated Hook: `use-swr-api.ts`

**File:** `src/client/src/hooks/use-swr-api.ts`

Remove `useStopPipeline` (deleted). Keep all other hooks unchanged. Ensure `fetcher` uses `apiFetch` consistently.

---

## 18. Backend: New REST Routes

**File:** `src/server/routes.ts`

Add both endpoints inside `registerRoutes`. They share the same `eventsTopic` already available in scope.

### Helper: publish `ENTITY_UPDATED` event

```typescript
// Add inside registerRoutes, alongside publishCommand:
async function publishEntityUpdatedEvent(
  projectId: string,
  updates: EntityUpdatedEvent['payload']
) {
  const event: EntityUpdatedEvent = {
    type: 'ENTITY_UPDATED',
    projectId,
    timestamp: new Date().toISOString(),
    payload: updates,
  };
  const data = Buffer.from(JSON.stringify(event));
  await eventsTopic.publishMessage({
    data,
    attributes: { projectId, type: 'ENTITY_UPDATED' },
  });
}
```

### Endpoint 1: `PATCH /api/entities`

```typescript
app.patch('/api/entities', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body as BatchEntityUpdateRequest;

    if (!body.projectId) return res.status(400).json({ error: 'projectId is required.' });
    if (!Array.isArray(body.updates) || !body.updates.length) {
      return res.status(400).json({ error: 'updates array is required and must not be empty.' });
    }

    const projectRepository = new ProjectRepository();

    // Group updates by entityType for efficient batch writes
    const sceneUpdates     = body.updates.filter(u => u.entityType === 'scene');
    const characterUpdates = body.updates.filter(u => u.entityType === 'character');
    const locationUpdates  = body.updates.filter(u => u.entityType === 'location');

    await Promise.all([
      sceneUpdates.length > 0
        ? projectRepository.updateScenes(
            sceneUpdates.map(u => ({
              id: u.entityId,
              projectId: body.projectId,
              sceneIndex: (u.patch as any).sceneIndex ?? 0,
              ...u.patch,
            }))
          )
        : Promise.resolve(),
      characterUpdates.length > 0
        ? projectRepository.updateCharacters(
            characterUpdates.map(u => ({ id: u.entityId, ...u.patch } as any))
          )
        : Promise.resolve(),
      locationUpdates.length > 0
        ? projectRepository.updateLocations(
            locationUpdates.map(u => ({ id: u.entityId, ...u.patch } as any))
          )
        : Promise.resolve(),
    ]);

    // Publish ENTITY_UPDATED so all connected clients (including the sender)
    // receive the canonical persisted state.
    await publishEntityUpdatedEvent(
      body.projectId,
      body.updates.map(u => ({
        entityId:   u.entityId,
        entityType: u.entityType,
        entity:     u.patch,
      }))
    );

    return res.status(204).send();
  } catch (error) {
    console.error({ error }, 'Error processing PATCH /api/entities');
    return res.status(500).json({ error: 'Failed to update entities.' });
  }
});
```

### Endpoint 2: `PATCH /api/assets/:entityId`

```typescript
app.patch('/api/assets/:entityId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { entityId } = req.params;
    const { entityType, assetKey, version, projectId } = req.body as {
      entityType: 'scene' | 'character' | 'location' | 'project';
      assetKey:   AssetKey;
      version:    number | null;
      projectId:  string;
    };

    if (!entityType) return res.status(400).json({ error: 'entityType is required.' });
    if (!assetKey)   return res.status(400).json({ error: 'assetKey is required.' });
    if (!projectId)  return res.status(400).json({ error: 'projectId is required.' });

    await PipelineCommandHandler.handleUpdateEntityAsset({
      entityId, entityType, assetKey, version, projectId,
    });

    // Publish ENTITY_UPDATED so client updates the asset best-pointer
    await publishEntityUpdatedEvent(projectId, [{
      entityId,
      entityType,
      entity: {},   // no attribute changes — SSE signals the asset pointer update
      assets: undefined,
      // Client will re-derive best asset from useAssetStore on ENTITY_UPDATED receipt
    }]);

    return res.status(204).send();
  } catch (error) {
    console.error({ error }, 'Error processing PATCH /api/assets/:entityId');
    return res.status(500).json({ error: 'Failed to update asset.' });
  }
});
```

**Add to imports in `routes.ts`:**
```typescript
import { PipelineCommandHandler } from '../pipeline/command-handler.js';
import type { AssetKey } from '../shared/types/assets.types.js';
import type { BatchEntityUpdateRequest, EntityUpdatedEvent } from '../shared/types/index.js';
```

---

## 19. Backend: `command-handler.ts` Rewrite

**File:** `src/pipeline/command-handler.ts` — FULL REWRITE

Remove `handleUpdateAsset`. Replace with `handleUpdateEntityAsset` that supports all entity types and uses the `asset_entries` / `asset_versions` tables.

```typescript
// src/pipeline/command-handler.ts

import { db } from '../shared/db/index.js';
import { assetEntries } from '../shared/db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { AssetKey } from '../shared/types/assets.types.js';

export const PipelineCommandHandler = {
  /**
   * UPDATE ENTITY ASSET — promotes or rejects a specific asset version.
   *
   * Updates the `best` pointer on the corresponding `asset_entries` row.
   * Entity type is used to build the correct WHERE clause (FK column selection).
   *
   * @param entityType  Determines which FK column to match in asset_entries
   * @param entityId    The ID of the entity (scene/character/location/project)
   * @param assetKey    Which asset slot to update
   * @param version     Version number to promote; null = reject (sets best to 0)
   * @param projectId   For validation
   */
  async handleUpdateEntityAsset(params: {
    entityId:   string;
    entityType: 'scene' | 'character' | 'location' | 'project';
    assetKey:   AssetKey;
    version:    number | null;
    projectId:  string;
  }): Promise<void> {
    const { entityId, entityType, assetKey, version } = params;

    // Build the WHERE clause targeting the correct FK column
    const entityFilter = (() => {
      switch (entityType) {
        case 'scene':     return eq(assetEntries.sceneId,     entityId);
        case 'character': return eq(assetEntries.characterId, entityId);
        case 'location':  return eq(assetEntries.locationId,  entityId);
        case 'project':
          // Project assets have all three FK columns as NULL
          return and(
            eq(assetEntries.projectId, entityId),
            // sceneId/characterId/locationId are null — handled by unique index
          );
        default:
          throw new Error(`Unknown entityType: ${entityType}`);
      }
    })();

    const newBest = version === null ? 0 : version;

    await db
      .update(assetEntries)
      .set({ best: newBest, updatedAt: new Date() })
      .where(
        and(
          entityFilter,
          eq(assetEntries.assetKey, assetKey)
        )
      );
  },
};
```

**In `src/pipeline/index.ts`:**

Remove the `UPDATE_SCENE_ASSET` switch case:
```typescript
// DELETE THIS BLOCK:
case 'UPDATE_SCENE_ASSET':
  try {
    await PipelineCommandHandler.handleUpdateAsset(command);
    await workflowOperator.getProjectState(projectId);
  } catch (error) { ... }
  break;
```

---

## 20. Pipeline: `SCENE_UPDATE` → `ENTITY_UPDATED` Migration

### In `src/pipeline/` — wherever `SCENE_UPDATE` is published

Search the entire pipeline codebase for all occurrences of:
```
type: "SCENE_UPDATE"
```
and:
```
publishPipelineEvent({
  type: "SCENE_UPDATE",
```

Replace each with:
```typescript
publishPipelineEvent({
  type: 'ENTITY_UPDATED',
  projectId: <projectId>,
  timestamp: new Date().toISOString(),
  payload: updates.map(update => {
    const { assets, ...entityFields } = update;
    return {
      entityId:   update.id,
      entityType: 'scene' as const,
      entity:     entityFields,
      assets:     assets,
    };
  }),
});
```

### `UpdateEntitiesCallback` call sites

Any place in the pipeline that calls `updateScenesCallback(sceneIds, updates, saveToDb)` must be updated to call `updateEntitiesCallback(updates, saveToDb)` where `updates` use the new `EntityUpdatedEvent['payload']` shape.

The callback implementation itself (in `workflow-service.ts` or equivalent) must publish `ENTITY_UPDATED` instead of `SCENE_UPDATE`.

---

## 21. `WorldBuilderCanvas.tsx` Import Updates

**File:** `src/components/canvas/WorldBuilderCanvas.tsx`

```typescript
// Replace:
import { useEntityStore } from '../../store/useEntityStore.js';
// With:
import { useProjectStore } from '../../store/useProjectStore.js';
```

Update any usage of `useEntityStore(...)` → `useProjectStore(...)` in this file.

---

## 22. Vitest Test Migration

The agent **must scan all files matching `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`** using a recursive file search before writing any test changes.

For each test file found, apply the following migration rules:

### Import replacements

| Old import | New import |
|---|---|
| `import { useStore } from '#/lib/store.js'` | Replace with appropriate new store |
| `import { useEntityStore } from '...'` | `import { useProjectStore } from '...'` |
| `useStore.getState().updateSceneClientSide` | `useProjectStore.getState().updateScene` |
| `useStore.getState().setAssets` | `useAssetStore.getState().setAssets` |
| `useStore.getState().mergeAssets` | `useAssetStore.getState().mergeAssets` |
| `useStore.getState().mergeAssetHistories` | `useAssetStore.getState().mergeAssetHistories` |
| `useStore.getState().setProject` | `useProjectStore.getState().hydrateProject` |
| `useStore.getState().setProjectStatus` | `usePipelineStore.getState().setStatus` |
| `useStore.getState().setInterruptState` | `usePipelineStore.getState().setInterrupt` |
| `useStore.getState().addMessage` | `usePipelineStore.getState().pushEvent` |
| `useStore.getState().setConnectionStatus` | `usePipelineStore.getState().setConnectionStatus` |
| `useStore.getState().setIsHydrated` | `useCanvasUIStore.getState().setIsHydrated` |
| `useStore.getState().setIsLoading` | `useCanvasUIStore.getState().setIsLoading` |
| `useStore.getState().setError` | `useCanvasUIStore.getState().setError` |

### Event type replacements in tests

| Old event type | New event type |
|---|---|
| `"SCENE_UPDATE"` | `"ENTITY_UPDATED"` |
| `"UPDATE_SCENE_ASSET"` (command) | Remove — test via `patchAsset()` API call |

### `PipelineCommandHandler` tests

Tests for `handleUpdateAsset` must be rewritten for `handleUpdateEntityAsset`:
- Old: takes `UpdateSceneAssetCommand` shape
- New: takes `{ entityId, entityType, assetKey, version, projectId }`
- Test all four `entityType` values
- Test `version: null` → sets `best = 0`
- Test `version: 2` → sets `best = 2`

### State initialization in tests

Any test that calls `useStore.setState(...)` must be split across the appropriate new stores:
```typescript
// Old:
useStore.setState({ project: mockProject, projectStatus: 'generating' });

// New:
useProjectStore.getState().hydrateProject(mockProject);
usePipelineStore.setState({ status: 'generating' });
```

---

## 23. Complete Implementation Checklist

Work through this list in order. Each item must be fully complete before proceeding.

### Phase 1: Shared Types

- [ ] Create `shared/types/editable.types.ts` with all editable field types and `BatchEntityUpdateRequest`
- [ ] Add `EntityUpdatedEvent` to `shared/types/pipeline.types.ts`
- [ ] Remove `SceneUpdateEvent` and `UpdateSceneAssetCommand` from `pipeline.types.ts`
- [ ] Update `PipelineEvent` union
- [ ] Add `UpdateEntitiesCallback` / `UpdateEntitiesCallbackArgs`, deprecate old names
- [ ] Export new types from `shared/types/index.ts`

### Phase 2: New Client Stores

- [ ] Create `useProjectStore.ts` — full implementation per Section 5
- [ ] Create `useAssetStore.ts` — full implementation per Section 6
- [ ] Update `useCanvasUIStore.ts` — add all new fields per Section 7
- [ ] Rewrite `usePipelineStore.ts` per Section 8

### Phase 3: Client Infrastructure

- [ ] Create `entityDebounce.ts` per Section 13
- [ ] Update `auth-context.tsx` per Section 11 — add `activeTeamId`, update `signOut`
- [ ] Create `useSignOut.ts` per Section 12
- [ ] Add `patchEntities()` and `patchAsset()` to `api.ts` per Section 14

### Phase 4: Client Hooks

- [ ] Rewrite `use-pipeline-events.ts` per Section 15
- [ ] Update `use-media-preloader.ts` per Section 16
- [ ] Update `use-swr-api.ts` per Section 17 — remove `useStopPipeline`

### Phase 5: Canvas Components

- [ ] Update `WorldBuilderCanvas.tsx` imports per Section 21
- [ ] Scan all other canvas components for `useEntityStore` or `useStore` imports and update to appropriate new stores

### Phase 6: Backend

- [ ] Add `PATCH /api/entities` to `routes.ts` per Section 18
- [ ] Add `PATCH /api/assets/:entityId` to `routes.ts` per Section 18
- [ ] Add `publishEntityUpdatedEvent` helper to `routes.ts`
- [ ] Rewrite `command-handler.ts` per Section 19
- [ ] Remove `UPDATE_SCENE_ASSET` case from `pipeline/index.ts` per Section 19
- [ ] Replace all `SCENE_UPDATE` emissions in pipeline per Section 20
- [ ] Update `UpdateEntitiesCallback` call sites per Section 20

### Phase 7: Deletion

- [ ] Delete `src/client/src/store/store.ts` — verify zero remaining imports first
- [ ] Delete `src/client/src/store/useEntityStore.ts` — verify zero remaining imports first
- [ ] Verify no remaining `import { useStore }` anywhere in client code

### Phase 8: Tests

- [ ] Run recursive scan for all `*.test.*` and `*.spec.*` files
- [ ] Apply all migration rules from Section 22 to each affected test file
- [ ] Run `vitest` — all tests must pass before this phase is complete

### Phase 9: Verification

- [ ] `useStore` has zero imports anywhere in the codebase
- [ ] `useEntityStore` has zero imports anywhere in the codebase
- [ ] `SCENE_UPDATE` event type has zero occurrences (only deprecated alias remains in types)
- [ ] `UPDATE_SCENE_ASSET` command type has zero occurrences
- [ ] `updateSceneClientSide` has zero call sites
- [ ] `PATCH /api/entities` batch endpoint responds correctly for scene/character/location
- [ ] `PATCH /api/assets/:entityId` updates `asset_entries.best` and publishes SSE
- [ ] `ENTITY_UPDATED` SSE event reaches the client and updates `useProjectStore` correctly
- [ ] Per-node save status shows "Saving..." during debounce and "Saved X ago" after
- [ ] Error state shows red indicator; localStorage backup is written and restored on reload
- [ ] All Vitest tests pass

---

*End of specification. Implement all sections completely. All architectural decisions are final as documented.*