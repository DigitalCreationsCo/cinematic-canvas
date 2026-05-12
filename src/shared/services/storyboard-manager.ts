// shared/services/storyboard-manager.ts
import {
  CharacterCondensed,
  LocationCondensed,
  SceneCondensed,
  LiveStoryboard,
} from "#shared/types/storyboard.types.js";
import { CharacterWithAssets, LocationWithAssets, SceneWithAssets } from "#shared/types/workflow.types.js";
import { ProjectMetadata } from "#shared/types/metadata.types.js";
import { getAllBestAssets } from "#shared/utils/assets.utils.js";

// ============================================================================
// INPUT CONTRACT
// ============================================================================

/**
 * The minimal projection of a project needed to compute a storyboard update.
 *
 * Callers pass the full entity arrays that represent the project's new state —
 * exactly what they are about to persist (or just persisted) to the DB.
 * Unchanged entity arrays should be forwarded from the in-memory project object
 * so that the storyboard always reflects the complete project, not just the
 * entities touched by the current job.
 */
export interface StoryboardUpdateSource {
  metadata: ProjectMetadata;
  characters: CharacterWithAssets[];
  locations: LocationWithAssets[];
  scenes: SceneWithAssets[];
}

// ============================================================================
// STORYBOARD MANAGER
// ============================================================================

export class StoryboardManager {
  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------

  /**
   * Unified entry point for all storyboard updates.
   *
   * Takes the current live storyboard (read from the in-memory project object,
   * never re-fetched) and the full entity state that should be reflected after
   * the current workload. Returns a new storyboard object via copy-modify-write
   * — the input is never mutated.
   *
   * Merge semantics:
   *  - Entities matched by `id` are updated in-place (insertion order preserved).
   *  - Entities absent from `current` are appended.
   *  - No entity is ever duplicated, even under repeated calls with the same data.
   *  - Scenes are always re-sorted by `sceneIndex` in the output.
   *  - Metadata is shallow-merged; incoming values win on key conflicts.
   */
  applyUpdates(current: LiveStoryboard, source: StoryboardUpdateSource): LiveStoryboard {
    const characters = this.upsertEntities(
      current.characters,
      source.characters.map((c) => this.extractCharacter(c)),
    );

    const locations = this.upsertEntities(
      current.locations,
      source.locations.map((l) => this.extractLocation(l)),
    );

    const scenes = this.upsertEntities(
      current.scenes,
      source.scenes.map((s) => this.extractScene(s)),
    ).sort((a, b) => a.sceneIndex - b.sceneIndex);

    const metadata: ProjectMetadata = {
      ...current.metadata,
      ...source.metadata,
    };

    // Zod's .readonly() produces a Readonly<T> at the type level, but the
    // runtime value is a plain object. We produce a structurally identical
    // object and cast — the consumer must not mutate it either.
    return { metadata, characters, locations, scenes } as unknown as LiveStoryboard;
  }



  private extractCharacter(entity: CharacterWithAssets): CharacterCondensed {
    const best = getAllBestAssets(entity.assets);
    return {
      id: entity.id,
      referenceId: entity.referenceId,
      name: entity.name,
      description: best["description"]?.data ?? "",
    };
  }

  private extractLocation(entity: LocationWithAssets): LocationCondensed {
    const best = getAllBestAssets(entity.assets);
    return {
      id: entity.id,
      referenceId: entity.referenceId,
      name: entity.name,
      description: best["description"]?.data ?? "",
    };
  }

  private extractScene(entity: SceneWithAssets): SceneCondensed {
    const best = getAllBestAssets(entity.assets);
    return {
      id: entity.id,
      sceneIndex: entity.sceneIndex,
      name: entity.name,
      description: best["description"]?.data ?? "",
    };
  }

  // --------------------------------------------------------------------------
  // MERGE PRIMITIVE
  // --------------------------------------------------------------------------

  /**
   * Upserts `incoming` into `existing`, matched by `id`.
   *
   * Pass 1 — walks `existing` in order. If an incoming item shares the same id,
   *           the incoming version replaces it (field update). Otherwise the
   *           existing item is kept unchanged (no-op for unaffected entities).
   * Pass 2 — appends items from `incoming` whose ids were not present in
   *           `existing` at all (net-new entities).
   *
   * Result is always duplicate-free. Existing insertion order is preserved for
   * non-new items; new items are appended in the order they appear in `incoming`.
   */
  private upsertEntities<T extends { id: string }>(existing: readonly T[], incoming: T[]): T[] {
    const incomingById = new Map(incoming.map((i) => [i.id, i]));

    // Pass 1: update or preserve — O(n) with Map lookup
    const updated = existing.map((e) => incomingById.get(e.id) ?? e);

    // Pass 2: append net-new items
    const existingIds = new Set(existing.map((e) => e.id));
    const netNew = incoming.filter((i) => !existingIds.has(i.id));

    return [...updated, ...netNew];
  }
}

// ============================================================================
// SINGLETON
//
// StoryboardManager is stateless — safe to share across all job executions.
// Import this singleton in worker-service.ts rather than instantiating per job.
// ============================================================================

export const storyboardManager = new StoryboardManager();
