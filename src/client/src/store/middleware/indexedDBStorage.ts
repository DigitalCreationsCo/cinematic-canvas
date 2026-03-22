// src/client/src/store/middleware/indexedDBStorage.ts
// Local-first persistence middleware for Canvas Node Layouts.
// Uses Dexie (IndexedDB) for instant offline saves, with a debounced
// background sync to the Postgres batch endpoint.

import type { CanvasNode } from '../../domain/canvas/NodeTypes.js';
import { apiFetch } from '#/lib/api.js';
import { api } from '#/lib/routes.js';

const SYNC_DEBOUNCE_MS = 1300;

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

        console.debug('[indexedDBStorage] Persisting layout', {
            nodeCount: nodes.length,
        });

        try {
            const res = await apiFetch(api.canvas.batch(contextType, contextId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

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

            console.debug('[indexedDBStorage] Layouts persisted successfully');
            onResult?.({ success: true, timestamp: new Date() });
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to persist layouts';
            console.error('[indexedDBStorage] Error syncing layouts:', errorMessage);
            onResult?.({ success: false, error: errorMessage, timestamp: new Date() });
        }
    }, SYNC_DEBOUNCE_MS);
}
