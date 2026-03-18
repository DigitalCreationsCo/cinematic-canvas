// src/client/src/hooks/useSavePendingChanges.ts
//
// Commits or discards all staged canvas connection changes.
//
// SAVE flow:
//   1. Read all PendingChange entries from useCanvasInteractionStore.
//   2. For each change, update the corresponding entity in useProjectStore
//      (characterIds, locationId, startFrameSceneId, etc.) — this is the
//      optimistic local update. Add your API call here if the project store
//      does not already sync to the backend on mutation.
//   3. Promote every pending-add edge to a live edge (remove amber style).
//   4. Remove every pending-remove edge from the node store.
//   5. Reset all pendingChangeCount values to 0.
//   6. Clear the interaction store.
//
// DISCARD flow:
//   1. Delete all pending-add edges from the node store.
//   2. Restore all pending-remove edges to their live visual style.
//   3. Reset pendingChangeCount on all nodes.
//   4. Clear the interaction store.

import { useCallback, useState } from 'react';
import { useNodeStore } from '../store/useNodeStore.js';
import { useCanvasInteractionStore } from '../store/useCanvasInteractionStore.js';
import { useProjectStore } from '../store/useProjectStore.js';
import { NodeFactory } from '../domain/canvas/NodeFactory.js';
import type { CanvasEdge } from '../domain/canvas/NodeTypes.js';
import type { EditableSceneFields, PendingChange } from '../../../shared/types/index.js';
import { apiFetch } from '#/lib/api.js';
import { EntityPatch } from '../../../shared/types/editable.types.js';
import { useAssetStore, useSceneAssets } from '#/store/useAssetStore.js';
import { Scene } from '../../../shared/types/workflow.types.js';
import { api } from '#/lib/routes.js';

// ============================================================================
// HOOK
// ============================================================================

interface UseSavePendingChangesResult {
    /** Commit all staged changes to local state (and optionally backend). */
    save: () => Promise<void>;
    /** Revert all staged changes — restore the canvas to its pre-edit state. */
    discard: () => void;
    isSaving: boolean;
    error: string | null;
}

export function useSavePendingChanges(projectId: string): UseSavePendingChangesResult {
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── discard ───────────────────────────────────────────────────────────────
    const discard = useCallback(() => {
        const { pendingChanges, clearPendingChanges } = useCanvasInteractionStore.getState();
        if (pendingChanges.size === 0) return;

        const { edges, setEdges } = useNodeStore.getState();

        const nextEdges: CanvasEdge[] = [];
        for (const edge of edges) {
            const pt = edge.data?.pendingType;
            if (pt === 'add') {
                // Pending-add: never saved → drop it entirely.
                continue;
            }
            if (pt === 'remove') {
                // Pending-remove: restore to its original live style so it stays on canvas.
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
        const { nodes, edges, setEdges, updateNodeData } = useNodeStore.getState();
        const projectId = useProjectStore.getState().selectedProjectId;

        if (pendingChanges.size === 0) return;

        setIsSaving(true);

        // PHASE 1: VISUAL CONFIRMATION (The "Dotted" state)
        // Transition edges to 'confirming' style locally
        const affectedEdgeIds = Array.from(pendingChanges.keys());
        setEdges(edges.map(e =>
            affectedEdgeIds.includes(e.id)
                ? { ...e, data: { ...e.data, isConfirming: true } }
                : e
        ));

        try {
            // PHASE 2: CONSTRUCT BATCH REQUEST
            const updates: EntityPatch[] = [];
            // Logic to map pending changes to standard EntityPatches...

            const response = await apiFetch(api.canvas.confirmChanges(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    updates,
                    pendingChanges: Array.from(pendingChanges.values())
                }),
            });

            if (!response.ok) throw new Error("Batch update failed");

            // PHASE 3: RECONCILIATION
            // Promote edges: remove amber style, remove deleted edges
            const finalEdges = useNodeStore.getState().edges.filter(e => {
                const change = pendingChanges.get(e.id);
                return !(change?.changeType === 'remove');
            }).map(e => ({
                ...e,
                style: {}, // Reset to default live style
                data: { ...e.data, pending: false, isConfirming: false }
            }));

            setEdges(finalEdges);
            resetAllPendingCounts();
            clearPendingChanges();

        } catch (err) {
            console.error("Save failed, reverting UI state:", err);
            // Rollback edge styles here if necessary
        } finally {
            setIsSaving(false);
        }
    }, []);

    return { save, discard, isSaving, error };
}

// ============================================================================
// ENTITY MUTATION LOGIC
// ============================================================================

/**
 * Applies a single pending change to the project entity store.
 *
 * Extend this function as you add new edge types. The pattern is:
 *   - 'add'    → add the sourceId to the relevant collection on the target entity
 *   - 'remove' → remove the sourceId from that collection
 *
 * If your updateScene / updateCharacter / updateLocation functions already
 * call the backend (recommended), no additional API calls are needed here.
 * If they are local-only, add your API call after the local update below.
 */
async function applyChangeToProjectStore(
    change: PendingChange,
    store: {
        scenes: ReturnType<typeof useProjectStore.getState>['scenes'];
        characters: ReturnType<typeof useProjectStore.getState>['characters'];
        locations: ReturnType<typeof useProjectStore.getState>['locations'];
        updateScene: ReturnType<typeof useProjectStore.getState>['updateScene'];
    },
): Promise<void> {
    const { scenes, updateScene } = store;

    switch (change.edgeType) {
        // ── Character ↔ Scene ─────────────────────────────────────────────────
        case 'character_in_scene': {
            const scene = scenes.get(change.targetId);
            if (!scene) break;
            if (change.changeType === 'add') {
                const ids = scene.characterIds ?? [];
                if (!ids.includes(change.sourceId)) {
                    await updateScene(change.targetId, { characterIds: [...ids, change.sourceId] });
                }
            } else {
                await updateScene(change.targetId, {
                    characterIds: (scene.characterIds ?? []).filter((id) => id !== change.sourceId),
                });
            }
            break;
        }

        // ── Location → Scene ─────────────────────────────────────────────────
        case 'location_in_scene': {
            const scene = scenes.get(change.targetId);
            if (!scene) break;
            if (change.changeType === 'add') {
                await updateScene(change.targetId, { locationId: change.sourceId });
            } else {
                await updateScene(change.targetId, { locationId: undefined });
            }
            break;
        }

        // ── Scene → Scene (frame continuity) ─────────────────────────────────
        // Stores the preceding scene's ID on the target scene so the generation
        // pipeline knows to inherit the end frame as a start frame reference.
        case 'scene_sequence': {
            const scene = scenes.get(change.targetId);
            if (!scene) break;
            if (change.changeType === 'add') {
                await updateScene(change.targetId, { startFrameSceneId: change.sourceId } as any);
            } else {
                await updateScene(change.targetId, { startFrameSceneId: undefined } as any);
            }
            break;
        }

        // ── Audio → Scene ─────────────────────────────────────────────────────
        // TODO: Extend scene entity to support audioTrackIds[] if not already present.
        case 'audio_sync': {
            const scene = scenes.get(change.targetId);
            if (!scene) break;
            const audioIds: string[] = (scene as any).audioTrackIds ?? [];
            if (change.changeType === 'add') {
                if (!audioIds.includes(change.sourceId)) {
                    await updateScene(change.targetId, {
                        audioTrackIds: [...audioIds, change.sourceId],
                    } as any);
                }
            } else {
                await updateScene(change.targetId, {
                    audioTrackIds: audioIds.filter((id) => id !== change.sourceId),
                } as any);
            }
            break;
        }

        // ── Image (style/lore/import) → Scene ─────────────────────────────────
        case 'style_applied': {
            const scene = scenes.get(change.targetId);
            if (!scene) break;
            const refIds: string[] = (scene as any).styleReferenceIds ?? [];
            if (change.changeType === 'add') {
                if (!refIds.includes(change.sourceId)) {
                    await updateScene(change.targetId, {
                        styleReferenceIds: [...refIds, change.sourceId],
                    } as any);
                }
            } else {
                await updateScene(change.targetId, {
                    styleReferenceIds: refIds.filter((id) => id !== change.sourceId),
                } as any);
            }
            break;
        }

        // ── Frame Input (start/end frame) → Scene ───────────────────────────────
        // When connecting an image or scene output to frame input:
        // - Links the source image to the scene as start/end frame reference
        // - Creates a new asset version on the backend
        case 'frame_input': {
            const scene = scenes.get(change.targetId);
            if (!scene) break;
            if (change.changeType === 'add') {
                await handleFrameInputConnection(change, scene);
            } else {
                await updateScene(change.targetId, { startFrameImageId: undefined } as any);
            }
            break;
        }

        // ── Composite ─────────────────────────────────────────────────────────
        // TODO: implement when composite node entity model is defined.
        case 'composite_input':
        case 'composite_output':
            console.warn('[useSavePendingChanges] composite save not yet implemented', change);
            break;

        // ── Lore ──────────────────────────────────────────────────────────────
        case 'lore_context':
            console.warn('[useSavePendingChanges] lore_context save not yet implemented', change);
            break;

        default:
            console.warn('[useSavePendingChanges] unknown edge type in pending change', change);
    }
}

// ============================================================================
// HELPERS
// ============================================================================

async function handleFrameInputConnection(
    change: PendingChange,
    data: EditableSceneFields,
): Promise<void> {
    const { sourceId, targetId, sourceHandle } = change;
    const nodes = useNodeStore.getState().nodes;
    const sourceNode = nodes.find((n) => n.id === sourceId);

    if (!sourceNode) {
        console.warn('[handleFrameInputConnection] Source node not found:', sourceId);
        return;
    }

    const isSceneSource = sourceNode.type === 'scene';
    const isImageSource = sourceNode.type === 'image';

    if (!isSceneSource && !isImageSource) {
        console.warn('[handleFrameInputConnection] Invalid source node type for frame input:', sourceNode.type);
        return;
    }

    try {
        const response = await apiFetch(api.entities.sceneFrameInput(targetId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: useProjectStore.getState().selectedProjectId,
                sourceEntityId: sourceId,
                sourceType: sourceNode.type,
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to link frame: ${response.statusText}`);
        }

        const { result, history } = await response.json();

        useAssetStore.getState().mergeAssetHistories([
            {
                entityId: targetId,
                assetKey: "scene_start_frame",
                history,
            }
        ]);
    } catch (err) {
        console.error('[handleFrameInputConnection] Error linking frame:', err);
        throw err;
    }
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