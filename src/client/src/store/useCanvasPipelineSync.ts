// src/client/src/hooks/useCanvasPipelineSync.ts
//
// Bridges the SSE pipeline event stores → ReactFlow canvas (useNodeStore).
//
// WHY THIS EXISTS:
//   use-pipeline-events.ts handles the SSE transport layer and writes to
//   useProjectStore / usePipelineStore / useCanvasUIStore. It knows nothing
//   about the canvas. This hook is the single place that translates those
//   store mutations into canvas node/edge operations.
//
// DESIGN:
//   - Pure store subscriptions (no React renders triggered here).
//   - Uses prevState reference equality to skip no-op updates.
//   - All node creation delegates to NodeFactory — never inline.
//   - spawnedIds Set provides O(1) idempotency across all subscribe callbacks.
//   - Status sync keeps node.data in step with ProjectStore so SceneNode
//     renders the correct status without needing to reach into ProjectStore
//     directly (that refactor can come later, scoped to SceneNode).

import { useEffect } from 'react';
import { useProjectStore } from '#/store/useProjectStore.js';
import { usePipelineStore } from '#/store/usePipelineStore.js';
import { useCanvasUIStore } from '#/store/useCanvasUIStore.js';
import { useNodeStore } from '#/store/useNodeStore.js';
import { NodeFactory } from '../domain/canvas/NodeFactory.js';
import type { CanvasNodeType } from '../domain/canvas/NodeTypes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Layout helpers
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_ROW: Partial<Record<CanvasNodeType | 'metadata', number>> = {
    metadata: -1,   // above the fold, invisible anchor
    scene: 0,
    character: 1,
    location: 2,
};
const COL_WIDTH = 420;
const ROW_HEIGHT = 350;
const LEFT_PAD = 80;
const TOP_PAD = 120;

/**
 * Simple grid-based spawn position.
 * Groups nodes by type in horizontal rows; column is the count of already-
 * spawned nodes of the same type, wrapping every 5 columns.
 * This is intentionally simple — AutoLayout can be applied post-spawn.
 */
function gridPosition(
    type: string,
    countOfType: number,
): { x: number; y: number; } {
    const row = TYPE_ROW[ type as CanvasNodeType ] ?? 2;
    const col = countOfType % 5;
    return {
        x: col * COL_WIDTH + LEFT_PAD,
        y: row * ROW_HEIGHT + TOP_PAD,
    };
}

export function useCanvasPipelineSync(projectId: string): void {
    useEffect(() => {
        if (!projectId) return;

        /**
         * Local idempotency set — tracks which entityIds have been spawned
         * during this hook's lifetime. Prevents double-spawning when multiple
         * subscriptions fire in the same tick (e.g. scenes + characters on
         * FULL_STATE). Uses a closure-scoped Set rather than checking
         * useNodeStore.nodes on every call to avoid repeated array scans.
         */
        const spawnedIds = new Set<string>(
            useNodeStore.getState().nodes.map((n) => n.id)
        );

        // ── Internal helpers ────────────────────────────────────────────────────

        function ensureRootNode(): void {
            if (spawnedIds.has(projectId)) return;
            spawnedIds.add(projectId);
            useNodeStore.getState().addNode(
                NodeFactory.createNode({
                    type: 'metadata',
                    entityId: projectId,
                    contextId: projectId,
                    contextType: 'project',
                    posCanvas: { x: 0, y: 0 },
                    scope: 'project',
                })
            );
        }

        function spawnEntity(entityId: string, type: CanvasNodeType): void {
            if (spawnedIds.has(entityId)) return;
            spawnedIds.add(entityId);

            const existingOfType = useNodeStore
                .getState()
                .nodes.filter((n) => n.type === type).length;

            useNodeStore.getState().addNode(
                NodeFactory.createNode({
                    type,
                    entityId,
                    contextId: projectId,
                    contextType: 'project',
                    posCanvas: gridPosition(type, existingOfType),
                    scope: 'project',
                })
            );

            // Scene nodes get an animated edge from the project metadata root.
            // Character/location nodes are not sequenced — edges come from user
            // connections or future AutoLayout passes.
            if (type === 'scene') {
                ensureRootNode();
                // Guard against duplicate edges (NodeFactory IDs are deterministic)
                const edgeId = `${projectId}__scene_sequence__${entityId}`;
                const alreadyHasEdge = useNodeStore
                    .getState()
                    .edges.some((e) => e.id === edgeId);
                if (!alreadyHasEdge) {
                    useNodeStore.getState().addEdge(
                        NodeFactory.createEdge({
                            sourceId: projectId,
                            targetId: entityId,
                            type: 'scene_sequence',
                            animated: true,
                        })
                    );
                }
            }
        }

        /**
         * Syncs presentation fields (status, progress, progressMessage) from
         * ProjectStore scene data back into the canvas node's data object.
         *
         * This keeps SceneNode rendering consistent with the live pipeline state
         * without requiring SceneNode to reach into ProjectStore directly.
         * A future refactor can have SceneNode subscribe to ProjectStore and
         * eliminate this sync entirely.
         */
        function syncSceneStatus(
            sceneId: string,
            scene: Record<string, unknown>,
        ): void {
            const node = useNodeStore.getState().nodes.find((n) => n.id === sceneId);
            if (!node) return;

            const current = node.data as any;
            const nextStatus = scene.status;
            const nextProgress = scene.progress ?? scene.progressPercent ?? 0;
            const nextMessage = scene.progressMessage ?? '';

            // Only write if something actually changed — avoids flooding zundo history.
            if (
                current.status === nextStatus &&
                current.progress === nextProgress &&
                current.progressMessage === nextMessage
            ) return;

            useNodeStore.getState().updateNodeData(sceneId, {
                status: nextStatus,
                progress: nextProgress,
                progressMessage: nextMessage,
            } as any);
        }

        // ── 1. Seed from current store state ─────────────────────────────────────
        // Handles the case where the hook mounts after FULL_STATE has already been
        // processed (e.g. hot-reload, or navigating back to the canvas).
        {
            const { scenes, characters, locations } = useProjectStore.getState();
            if (scenes.size > 0 || characters.size > 0 || locations.size > 0) {
                ensureRootNode();
                scenes.forEach((_, id) => spawnEntity(id, 'scene'));
                characters.forEach((_, id) => spawnEntity(id, 'character'));
                locations.forEach((_, id) => spawnEntity(id, 'location'));
            }
        }

        // ── 2. Subscribe: scenes ─────────────────────────────────────────────────
        // Fires on every ProjectStore update; prevState reference equality short-
        // circuits the callback when scenes Map hasn't changed.
        const unsubScenes = useProjectStore.subscribe(
            (state, prev) => {
                if (state.scenes === prev.scenes) return;
                ensureRootNode();
                state.scenes.forEach((scene, id) => {
                    spawnEntity(id, 'scene');
                    syncSceneStatus(id, scene as any);
                });
            }
        );

        // ── 3. Subscribe: characters ─────────────────────────────────────────────
        const unsubCharacters = useProjectStore.subscribe(
            (state, prev) => {
                if (state.characters === prev.characters) return;
                state.characters.forEach((_, id) => spawnEntity(id, 'character'));
            }
        );

        // ── 4. Subscribe: locations ──────────────────────────────────────────────
        const unsubLocations = useProjectStore.subscribe(
            (state, prev) => {
                if (state.locations === prev.locations) return;
                state.locations.forEach((_, id) => spawnEntity(id, 'location'));
            }
        );

        // ── 5. Subscribe: LLM intervention → auto-select affected node ──────────
        // When the pipeline hits an intervention, auto-open the right sidebar on
        // the affected scene so the user can act immediately — mirrors the behavior
        // that was in PubSubCanvasAdapter's LLM_INTERVENTION_NEEDED handler.
        const unsubInterrupt = usePipelineStore.subscribe(
            (state, prev) => {
                if (state.interrupt === prev.interrupt || !state.interrupt) return;
                // interrupt.originalParams comes from use-pipeline-events setInterrupt call
                const sceneId = (state.interrupt as any).originalParams?.sceneId as
                    | string
                    | undefined;
                if (sceneId) {
                    useCanvasUIStore.getState().selectNode(sceneId);
                }
            }
        );

        return () => {
            unsubScenes();
            unsubCharacters();
            unsubLocations();
            unsubInterrupt();
        };
    }, [ projectId ]);
}