import type { CanvasNode } from "#client/domain/canvas/NodeTypes.js";
import { HybridNodeStorage, OCCConflictError, getHybridNodeStorage } from "#client/services/hybridNodeStorage.js";
import { supabase } from "#client/lib/supabase.js";

const SYNC_DEBOUNCE_MS = 1300;

let storage: HybridNodeStorage | null = null;

function getStorage(): HybridNodeStorage {
  if (!storage) {
    storage = getHybridNodeStorage(supabase);

    if (!storage.isCloudSyncEnabled()) {
      console.warn(
        "[canvasIndexedDBStorage] Cloud canvas sync is disabled. Set VITE_ENABLE_CLOUD_NODE_SYNC=true to enable cloud persistence.",
      );
    }
  }
  return storage;
}

export type LayoutPersistCallback = (result: { success: boolean; error?: string; timestamp: Date }) => void;

let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Pending payload captured on each debouncedPersistLayout call.
 * Allows flushPendingPersist() to execute the latest pending persist
 * immediately on unmount / beforeunload without waiting for the debounce.
 */
let pendingPersistArgs: {
  nodes: CanvasNode[];
  contextId: string;
  contextType: "project" | "world";
  onResult?: LayoutPersistCallback;
} | null = null;

export function clearDebounce() {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
    debounceTimeout = null;
  }
  pendingPersistArgs = null;
}

/** Shared persist logic used by both the debounce timer and flush. */
async function executePersist(
  nodes: CanvasNode[],
  contextId: string,
  contextType: "project" | "world",
  onResult?: LayoutPersistCallback,
): Promise<void> {
  const payload = nodes.map((n) => ({
    idContextTarget: contextId,
    contextTypeTarget: contextType,
    idEntityTarget: n.id,
    nodeTypeTarget: n.type,
    valPosXTarget: n.position.x,
    valPosYTarget: n.position.y,
    valWidthTarget: n.width,
    valHeightTarget: n.height,
    jsonUiMetadata: {
      nodeTypeFlag: n.data.nodeTypeFlag,
      pipelineSelected: n.data.pipelineSelected,
      collapsed: n.data.collapsed,
    },
    idxVersionCurrent: n.data.idxVersion,
  }));

  console.debug("[canvasIndexedDBStorage] Persisting layout", {
    nodeCount: nodes.length,
  });

  try {
    const hybridStorage = getStorage();
    const res = await hybridStorage.upsert(payload);

    if (res.newVersions) {
      try {
        const { useNodeStore } = await import("#client/store/useNodeStore.js");
        const store = useNodeStore.getState();

        Object.entries(res.newVersions).forEach(([entityId, newVersion]) => {
          const node = store.nodes.find((n) => n.id === entityId);
          if (node && node.data.idxVersion !== newVersion) {
            store.updateNodeData(entityId, { idxVersion: newVersion as number });
          }
        });
      } catch (importErr) {
        console.error("Failed to update store versions, but data was persisted", importErr);
      }
    }

    if (res.error) {
      console.warn("[canvasIndexedDBStorage] Layouts saved locally with cloud sync warning:", res.error);
    } else {
      console.debug("[canvasIndexedDBStorage] Layouts persisted successfully");
    }

    onResult?.({
      success: res.success,
      ...(res.error ? { error: res.error } : {}),
      timestamp: new Date(),
    });
  } catch (err: unknown) {
    if (err instanceof OCCConflictError) {
      const errorMessage = `OCC conflict for entity: ${err.entityId}. Client version: ${err.clientVersion}, server version: ${err.serverVersion}`;
      console.error("[canvasIndexedDBStorage] OCC conflict:", errorMessage);
      onResult?.({ success: false, error: errorMessage, timestamp: new Date() });
    } else {
      const errorMessage = err instanceof Error ? err.message : "Failed to persist layouts";
      console.error("[canvasIndexedDBStorage] Error syncing layouts:", errorMessage);
      onResult?.({ success: false, error: errorMessage, timestamp: new Date() });
    }
  }
}

export function debouncedPersistLayout(
  nodes: CanvasNode[],
  contextId: string,
  contextType: "project" | "world",
  onResult?: LayoutPersistCallback,
) {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
  }

  // Store latest pending args so flushPendingPersist() can execute them.
  pendingPersistArgs = { nodes, contextId, contextType, onResult };

  debounceTimeout = setTimeout(async () => {
    pendingPersistArgs = null;
    debounceTimeout = null;
    await executePersist(nodes, contextId, contextType, onResult);
  }, SYNC_DEBOUNCE_MS);
}

/**
 * Immediately persists any pending (debounced) layout changes.
 * Call on beforeunload and component unmount to prevent data loss. (BUG-4 fix)
 */
export function flushPendingPersist(): void {
  if (!pendingPersistArgs) {
    console.debug("[canvasIndexedDBStorage] flushPendingPersist: no pending persist");
    return;
  }

  const { nodes, contextId, contextType, onResult } = pendingPersistArgs;
  pendingPersistArgs = null;

  // Clear the debounce timer since we're persisting now.
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
    debounceTimeout = null;
  }

  console.debug("[canvasIndexedDBStorage] flushPendingPersist: flushing", {
    nodeCount: nodes.length,
    contextId,
  });

  // Fire-and-forget: we can't await in beforeunload, but IndexedDB writes
  // are synchronous enough to typically complete before the page unloads.
  executePersist(nodes, contextId, contextType, onResult);
}

export function resetStorage(): void {
  storage = null;
}
