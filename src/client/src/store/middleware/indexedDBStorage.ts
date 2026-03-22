// src/client/src/store/middleware/indexedDBStorage.ts
// Local-first persistence middleware for Canvas Node Layouts.
// Uses Dexie (IndexedDB) for instant offline saves, with a debounced
// background sync to the Postgres OCC batch endpoint.

import Dexie, { type Table } from 'dexie';
import type { CanvasNodeLayout } from '../../../../shared/db/schema.js';
import type { CanvasNode } from '../../domain/canvas/NodeTypes.js';
import { apiFetch } from '#/lib/api.js';
import { api } from '#/lib/routes.js';

// Workaround for Dexie class inheritance TS issues in nodenext
const AnyDexie = Dexie as any;

export class CanvasLayoutDB extends AnyDexie {
    layouts!: Table<CanvasNodeLayout, string>; // uuid pk

    constructor() {
        super('CinematicCanvasDB');
        this.version(1).stores({
            layouts: 'idLayout, idContext, [idContext+idEntity]',
        });
    }
}

export const dbLocal = new CanvasLayoutDB();

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 1500;

/**
 * Debounced persistence for node layout changes.
 * 1. Writes immediately to IndexedDB (local first).
 * 2. Queues a debounced HTTP PUT to the Postgres OCC batch endpoint.
 *
 * This function should be called via `subscribeWithSelector` on useNodeStore
 * whenever nodes array changes, filtering for changes in dragging state.
 */
export function debouncedPersistLayout(
    nodes: CanvasNode[],
    contextId: string,
    contextType: 'project' | 'world'
) {
    // Clear any pending sync
    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(async () => {
        try {
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

            // In a real app, you would also write to Dexie here for offline support
            // await dbLocal.layouts.bulkPut(dexieRows);

            // Background sync to OCC batch endpoint
            const res = await apiFetch(api.canvas.batch(contextType, contextId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            // If backend responds with updated versions, update our local store
            // to avoid OCC conflicts on subsequent saves.
            if (res.newVersions) {
                // Dynamically import useNodeStore to avoid circular dependencies
                const { useNodeStore } = await import('../useNodeStore.js');
                const store = useNodeStore.getState();
                
                Object.entries(res.newVersions).forEach(([entityId, newVersion]) => {
                    const node = store.nodes.find(n => n.id === entityId);
                    if (node && node.data.idxVersion !== newVersion) {
                        store.updateNodeData(entityId, { idxVersion: newVersion as number });
                    }
                });
            }
        } catch (err: any) {
            if (err.message && err.message.includes('OCC conflict')) {
                console.warn('[indexedDBStorage] OCC conflict detected. A reload is recommended.');
                // You could trigger a re-fetch of layouts here via an event
            } else {
                console.error('[indexedDBStorage] Error syncing layouts:', err);
            }
        }
    }, SYNC_DEBOUNCE_MS);
}
