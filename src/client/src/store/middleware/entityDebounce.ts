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

import { patchEntities } from '../../lib/api.js';
import { useProjectStore } from '../useProjectStore.js';
import type { EntityPatch } from '../../../../shared/types/editable.types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEBOUNCE_MS = 3000;
const LS_KEY_PREFIX = 'entity_unsaved_';
const LS_TTL_MS = 60 * 60 * 1000; // 1 hour

// ============================================================================
// MODULE STATE
// ============================================================================

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPacket: { projectId: string, worldId?: string, userId: string, teamId: string } | null = null;

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
export function scheduleEntityFlush(packet: { projectId: string, worldId?: string, userId: string, teamId: string }, patch: EntityPatch): void {
  pendingPacket = packet;

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
export function restoreUnsavedChanges(packet: { projectId: string, worldId?: string, userId: string, teamId: string }): void {
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
      if (record.projectId !== packet.projectId) continue;

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
      scheduleEntityFlush(packet, patch);
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
  if (!dirtyMap.size || !pendingPacket?.projectId) return;

  const { projectId, worldId, teamId } = pendingPacket;
  const flushBatch = [...dirtyMap.values()];
  const flushIds = [...dirtyMap.keys()];

  // Clear the dirty map before the async call to avoid double-flush
  dirtyMap.clear();

  // Mark all flushed entities as 'saving'
  const { setEntitySaveStatus, setEntityLastSavedAt } = useProjectStore.getState();
  flushIds.forEach((id) => setEntitySaveStatus(id, 'saving'));

  try {
    await patchEntities({
      projectId,
      worldId: worldId ?? undefined,
      teamId: teamId!,
      updates: flushBatch
    });

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
