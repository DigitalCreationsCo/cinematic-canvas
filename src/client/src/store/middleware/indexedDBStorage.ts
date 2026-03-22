// src/client/src/store/middleware/indexedDBStorage.ts
// Local-first persistence middleware for Canvas Node Layouts.
// Uses Dexie (IndexedDB) for instant offline saves, with a debounced
// background sync to the Postgres OCC batch endpoint.

import Dexie, { type Table } from 'dexie';
import type { CanvasNodeLayout } from '../../../../shared/db/schema.js';
import type { CanvasNode } from '../../domain/canvas/NodeTypes.js';
import { apiFetch } from '#/lib/api.js';
import { api } from '#/lib/routes.js';

const AnyDexie = Dexie as any;

export class CanvasLayoutDB extends AnyDexie {
    layouts!: Table<CanvasNodeLayout, string>;

    constructor() {
        super('CinematicCanvasDB');
        this.version(1).stores({
            layouts: 'idLayout, idContext, [idContext+idEntity]',
        });
    }
}

export const dbLocal = new CanvasLayoutDB();

const SYNC_DEBOUNCE_MS = 1300;

export type LayoutPersistCallback = (result: {
    success: boolean;
    error?: string;
    timestamp: Date;
}) => void;

interface LayoutPersistInstance {
    timeoutId: ReturnType<typeof setTimeout> | null;
    previousPositions: Map<string, { x: number; y: number; version: number }>;
}

const instances = new Map<string, LayoutPersistInstance>();

function getOrCreateInstance(key: string): LayoutPersistInstance {
    if (!instances.has(key)) {
        instances.set(key, {
            timeoutId: null,
            previousPositions: new Map(),
        });
    }
    return instances.get(key)!;
}

function clearInstance(key: string) {
    const instance = instances.get(key);
    if (instance) {
        if (instance.timeoutId) {
            clearTimeout(instance.timeoutId);
        }
        instances.delete(key);
    }
}

export function clearPreviousPositions(contextId: string, contextType: 'project' | 'world') {
    const instanceKey = `${contextType}:${contextId}`;
    const instance = instances.get(instanceKey);
    if (instance) {
        instance.previousPositions.clear();
    }
}

export type ServerLayout = {
    idEntity: string;
    valPosX: number;
    valPosY: number;
    idxVersion: number;
};

export function initPreviousPositions(
    contextId: string,
    contextType: 'project' | 'world',
    layouts: ServerLayout[]
) {
    const instanceKey = `${contextType}:${contextId}`;
    const instance = getOrCreateInstance(instanceKey);
    
    layouts.forEach(layout => {
        instance.previousPositions.set(layout.idEntity, {
            x: layout.valPosX,
            y: layout.valPosY,
            version: layout.idxVersion,
        });
    });
    
    console.debug('[indexedDBStorage] Initialized previousPositions', {
        contextType,
        contextId,
        nodeCount: layouts.length,
    });
}

function debouncedPersistLayout(
    nodes: CanvasNode[],
    contextId: string,
    contextType: 'project' | 'world',
    onResult?: LayoutPersistCallback
) {
    const instanceKey = `${contextType}:${contextId}`;
    const instance = getOrCreateInstance(instanceKey);

    if (instance.timeoutId) {
        clearTimeout(instance.timeoutId);
    }

    instance.timeoutId = setTimeout(async () => {
        const changedNodes = nodes.filter(n => {
            const prev = instance.previousPositions.get(n.id);
            if (!prev) return true;
            return (
                prev.x !== n.position.x ||
                prev.y !== n.position.y ||
                prev.version !== n.data.idxVersion
            );
        });

        if (changedNodes.length === 0) {
            console.debug('[indexedDBStorage] No position changes detected, skipping persist');
            onResult?.({ success: true, timestamp: new Date() });
            return;
        }

        const payload = changedNodes.map(n => ({
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

        changedNodes.forEach(n => {
            instance.previousPositions.set(n.id, {
                x: n.position.x,
                y: n.position.y,
                version: n.data.idxVersion,
            });
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
                    
                    const prev = instance.previousPositions.get(entityId);
                    if (prev) {
                        prev.version = newVersion as number;
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

export { debouncedPersistLayout, clearInstance, clearPreviousPositions };
