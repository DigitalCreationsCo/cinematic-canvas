// src/client/src/hooks/useSavePendingChanges.ts
//
// Commits or discards all staged canvas connection changes.

import { useCallback, useState } from 'react';
import { useNodeStore } from '../store/useNodeStore.js';
import { useCanvasInteractionStore } from '../store/useCanvasInteractionStore.js';
import { useProjectStore } from '../store/useProjectStore.js';
import { NodeFactory } from '../domain/canvas/NodeFactory.js';
import type { CanvasEdge } from '../domain/canvas/NodeTypes.js';
import type { PendingChange } from '../../../shared/types/index.js';
import { apiFetch } from '#/lib/api.js';
import { EntityPatch } from '../../../shared/types/editable.types.js';
import { useAssetStore } from '#/store/useAssetStore.js';
import { api } from '#/lib/routes.js';

function buildEntityPatches(pendingChanges: Map<string, PendingChange>): EntityPatch[] {
    const patchesByEntity = new Map<string, EntityPatch>();

    for (const change of pendingChanges.values()) {
        if (change.edgeType === 'frame_input') {
            continue;
        }

        if (change.edgeType === 'character_in_scene') {
            continue;
        }

        if (change.edgeType === 'location_in_scene') {
            patchesByEntity.set(`${change.targetId}:scene`, {
                entityId: change.targetId,
                entityType: 'scene',
                patch: change.changeType === 'add'
                    ? { locationId: change.sourceId }
                    : { locationId: null }
            });
            continue;
        }

        if (change.edgeType === 'scene_sequence') {
            patchesByEntity.set(`${change.targetId}:scene`, {
                entityId: change.targetId,
                entityType: 'scene',
                patch: change.changeType === 'add'
                    ? { startFrameSceneId: change.sourceId }
                    : { startFrameSceneId: null }
            });
            continue;
        }
    }

    return Array.from(patchesByEntity.values());
}

function resetAllPendingCounts(): void {
    const { nodes, setNodes } = useNodeStore.getState();
    setNodes(
        nodes.map((n) =>
            (n.data.pendingChangeCount ?? 0) > 0
                ? { ...n, data: { ...n.data, pendingChangeCount: 0 } }
                : n,
        ),
    );
}

interface UseSavePendingChangesResult {
    save: () => Promise<void>;
    discard: () => void;
    isSaving: boolean;
    error: string | null;
}

export function useSavePendingChanges(projectId: string): UseSavePendingChangesResult {
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const discard = useCallback(() => {
        const { pendingChanges, clearPendingChanges } = useCanvasInteractionStore.getState();
        if (pendingChanges.size === 0) return;

        const { edges, setEdges } = useNodeStore.getState();

        const nextEdges: CanvasEdge[] = [];
        for (const edge of edges) {
            const pt = edge.data?.pendingType;
            if (pt === 'add') {
                continue;
            }
            if (pt === 'remove') {
                nextEdges.push(NodeFactory.promoteEdge(edge));
                continue;
            }
            nextEdges.push(edge);
        }

        setEdges(nextEdges);
        resetAllPendingCounts();
        clearPendingChanges();
    }, []);

    const save = useCallback(async () => {
        const { pendingChanges, clearPendingChanges } = useCanvasInteractionStore.getState();
        const { edges, setEdges } = useNodeStore.getState();

        if (pendingChanges.size === 0) return;

        setIsSaving(true);
        setError(null);

        const affectedEdgeIds = Array.from(pendingChanges.keys());
        setEdges(edges.map(e =>
            affectedEdgeIds.includes(e.id)
                ? { ...e, data: { ...e.data, isConfirming: true } }
                : e
        ));

        try {
            const updates = buildEntityPatches(pendingChanges);

            const response = await apiFetch(api.canvas.confirmChanges(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    updates,
                    pendingChanges: Array.from(pendingChanges.values())
                }),
            });

            if (response.newVersions) {
                const { useNodeStore: useNodeStoreSync } = await import('../store/useNodeStore.js');
                const store = useNodeStoreSync.getState();
                Object.entries(response.newVersions).forEach(([entityId, newVersion]) => {
                    const node = store.nodes.find(n => n.id === entityId);
                    if (node && node.data.idxVersion !== newVersion) {
                        store.updateNodeData(entityId, { idxVersion: newVersion as number });
                    }
                });
            }

            const finalEdges = useNodeStore.getState().edges.filter(e => {
                const change = pendingChanges.get(e.id);
                return !(change?.changeType === 'remove');
            }).map(e => ({
                ...e,
                style: {},
                data: { ...e.data, pending: false, isConfirming: false }
            }));

            setEdges(finalEdges);
            resetAllPendingCounts();
            clearPendingChanges();

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Save failed";
            console.error("[useSavePendingChanges] Save failed:", err);

            setError(errorMessage);

            setEdges(edges.map(e =>
                affectedEdgeIds.includes(e.id)
                    ? { ...e, data: { ...e.data, isConfirming: false } }
                    : e
            ));
        } finally {
            setIsSaving(false);
        }
    }, [projectId]);

    return { save, discard, isSaving, error };
}
