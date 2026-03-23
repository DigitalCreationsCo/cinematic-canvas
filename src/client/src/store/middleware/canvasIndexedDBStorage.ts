import type { CanvasNode } from '../../domain/canvas/NodeTypes.js';
import { HybridNodeStorage, OCCConflictError, getHybridNodeStorage } from '../../services/hybridNodeStorage.js';
import { supabase } from '../../lib/supabase.js';

const SYNC_DEBOUNCE_MS = 1300;

let storage: HybridNodeStorage | null = null;

function getStorage(): HybridNodeStorage {
    if (!storage) {
        storage = getHybridNodeStorage(supabase);
        
        if (!storage.isCloudSyncEnabled()) {
            console.warn('[canvasIndexedDBStorage] Cloud canvas sync is disabled. Set VITE_ENABLE_CLOUD_NODE_SYNC=true to enable cloud persistence.');
        }
    }
    return storage;
}

export type LayoutPersistCallback = (result: {
    success: boolean;
    error?: string;
    timestamp: Date;
}) => void;

let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

export function clearDebounce() {
    if (debounceTimeout) {
        clearTimeout(debounceTimeout);
        debounceTimeout = null;
    }
}

export function debouncedPersistLayout(
    nodes: CanvasNode[],
    contextId: string,
    contextType: 'project' | 'world',
    onResult?: LayoutPersistCallback
) {
    if (debounceTimeout) {
        clearTimeout(debounceTimeout);
    }

    debounceTimeout = setTimeout(async () => {
        const payload = nodes.map(n => ({
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

        console.debug('[canvasIndexedDBStorage] Persisting layout', {
            nodeCount: nodes.length,
        });

        try {
            const hybridStorage = getStorage();
            const res = await hybridStorage.upsert(payload);

            if (res.newVersions) {
                const { useNodeStore } = await import('../useNodeStore.js');
                const store = useNodeStore.getState();
                
                Object.entries(res.newVersions).forEach(([entityId, newVersion]) => {
                    const node = store.nodes.find(n => n.id === entityId);
                    if (node && node.data.idxVersion !== newVersion) {
                        store.updateNodeData(entityId, { idxVersion: newVersion as number });
                    }
                });
            }

            console.debug('[canvasIndexedDBStorage] Layouts persisted successfully');
            onResult?.({ success: true, timestamp: new Date() });
        } catch (err: unknown) {
            if (err instanceof OCCConflictError) {
                const errorMessage = `OCC conflict for entity: ${err.entityId}. Client version: ${err.clientVersion}, server version: ${err.serverVersion}`;
                console.error('[canvasIndexedDBStorage] OCC conflict:', errorMessage);
                onResult?.({ success: false, error: errorMessage, timestamp: new Date() });
            } else {
                const errorMessage = err instanceof Error ? err.message : 'Failed to persist layouts';
                console.error('[canvasIndexedDBStorage] Error syncing layouts:', errorMessage);
                onResult?.({ success: false, error: errorMessage, timestamp: new Date() });
            }
        }
    }, SYNC_DEBOUNCE_MS);
}

export function resetStorage(): void {
    storage = null;
}
