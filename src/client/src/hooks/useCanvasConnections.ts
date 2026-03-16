// src/client/src/hooks/useCanvasConnections.ts
//
// Typed connection handler for the ReactFlow canvas.
//
// KEY CHANGE from the multi-handle scheme:
//   one-to-one enforcement for scene_sequence no longer checks by target
//   handle ID (since all scene connections share scene_target). Instead,
//   it checks whether the target scene already has an incoming edge of the
//   same EdgeType. This is semantically cleaner and handle-agnostic.

import { useCallback } from 'react';
import type { CSSProperties } from 'react';
import type { Connection } from '@xyflow/react';
import { useNodeStore } from '../store/useNodeStore.js';
import { useCanvasInteractionStore } from '../store/useCanvasInteractionStore.js';
import {
    resolveConnectionRule,
    isValidConnection as validateConnection,
} from '../domain/canvas/ConnectionValidator.js';
import { NodeFactory } from '../domain/canvas/NodeFactory.js';
import { PENDING_EDGE_STYLE } from '../domain/canvas/NodeTypes.js';
import type { CanvasNode, CanvasEdge, CanvasNodeType } from '../domain/canvas/NodeTypes.js';

// Pending-remove style: red dashed — visible but clearly queued for deletion.
const PENDING_REMOVE_STYLE: CSSProperties = {
    stroke: '#ef4444',
    strokeWidth: 2,
    strokeDasharray: '6 3',
    opacity: 0.75,
};

// ============================================================================
// HOOK
// ============================================================================

export function useCanvasConnections(nodes: CanvasNode[]) {
    const nodeTypeMap = useCallback(
        (id: string): CanvasNodeType | undefined =>
            nodes.find((n) => n.id === id)?.type as CanvasNodeType | undefined,
        [nodes],
    );

    // ── isValidConnection ────────────────────────────────────────────────────
    const isValidConnectionFn = useCallback(
        (connection: Connection) => validateConnection(connection, nodeTypeMap),
        [nodeTypeMap],
    );

    // ── onConnect ────────────────────────────────────────────────────────────
    const onConnect = useCallback(
        (connection: Connection) => {
            const { source, target, sourceHandle, targetHandle } = connection;
            if (!source || !target) return;

            const sourceType = nodeTypeMap(source);
            const targetType = nodeTypeMap(target);
            if (!sourceType || !targetType) return;

            const rule = resolveConnectionRule(sourceType, targetType, sourceHandle, targetHandle);
            if (!rule) return;

            const { edges, deleteEdge, addEdge, updateNodeData } = useNodeStore.getState();
            const { addPendingChange } = useCanvasInteractionStore.getState();

            // ── One-to-one enforcement (by EdgeType, not by handle ID) ───────────
            // A target scene can only have ONE incoming edge of each one-to-one type
            // (currently only scene_sequence). Since all scene connections share the
            // single `scene_target` handle, we cannot use handle matching — we use
            // the edge type as the discriminator instead.
            if (rule.oneToOne) {
                const conflicting = edges.find(
                    (e) => e.target === target && e.type === rule.edgeType,
                );
                if (conflicting) {
                    addPendingChange({
                        edgeId: conflicting.id,
                        changeType: 'remove',
                        sourceId: conflicting.source,
                        targetId: conflicting.target,
                        sourceHandle: conflicting.sourceHandle ?? undefined,
                        targetHandle: conflicting.targetHandle ?? undefined,
                        edgeType: rule.edgeType,
                        timestamp: Date.now(),
                    });
                    deleteEdge(conflicting.id);
                }
            }

            // ── Build the pending edge ───────────────────────────────────────────
            const newEdge = NodeFactory.createEdge({
                sourceId: source,
                targetId: target,
                type: rule.edgeType,
                sourceHandle: sourceHandle ?? undefined,
                targetHandle: targetHandle ?? undefined,
                pending: true,
            });

            addEdge(newEdge);

            // ── Register pending change ──────────────────────────────────────────
            addPendingChange({
                edgeId: newEdge.id,
                changeType: 'add',
                sourceId: source,
                targetId: target,
                sourceHandle: sourceHandle ?? undefined,
                targetHandle: targetHandle ?? undefined,
                edgeType: rule.edgeType,
                timestamp: Date.now(),
            });

            bumpPendingCount(source, updateNodeData);
            bumpPendingCount(target, updateNodeData);
        },
        [nodeTypeMap],
    );

    // ── markEdgePendingRemove ────────────────────────────────────────────────
    const markEdgePendingRemove = useCallback((edgeId: string) => {
        const { edges, setEdges, updateNodeData } = useNodeStore.getState();
        const edge = edges.find((e) => e.id === edgeId);
        if (!edge) return;

        // pending-add → discard outright (no backend record yet).
        if (edge.data?.pendingType === 'add') {
            useNodeStore.getState().deleteEdge(edgeId);
            useCanvasInteractionStore.getState().removePendingChange(edgeId);
            decrementPendingCount(edge.source, updateNodeData);
            decrementPendingCount(edge.target, updateNodeData);
            return;
        }

        // Live edge → style red-dashed + mark pending-remove in a single setEdges call.
        setEdges(
            edges.map((e): CanvasEdge =>
                e.id === edgeId
                    ? {
                        ...e,
                        style: PENDING_REMOVE_STYLE,
                        data: { ...e.data, pending: true, pendingType: 'remove' as const },
                    }
                    : e,
            ),
        );

        useCanvasInteractionStore.getState().addPendingChange({
            edgeId,
            changeType: 'remove',
            sourceId: edge.source,
            targetId: edge.target,
            sourceHandle: edge.sourceHandle ?? undefined,
            targetHandle: edge.targetHandle ?? undefined,
            edgeType: (edge.type ?? 'scene_sequence') as any,
            timestamp: Date.now(),
        });

        bumpPendingCount(edge.source, updateNodeData);
        bumpPendingCount(edge.target, updateNodeData);
    }, []);

    return { onConnect, isValidConnection: isValidConnectionFn, markEdgePendingRemove };
}

// ============================================================================
// HELPERS
// ============================================================================

function bumpPendingCount(
    nodeId: string,
    updateNodeData: (id: string, data: any) => void,
): void {
    const node = useNodeStore.getState().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    updateNodeData(nodeId, {
        pendingChangeCount: (node.data.pendingChangeCount ?? 0) + 1,
    });
}

function decrementPendingCount(
    nodeId: string,
    updateNodeData: (id: string, data: any) => void,
): void {
    const node = useNodeStore.getState().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const next = Math.max(0, (node.data.pendingChangeCount ?? 1) - 1);
    updateNodeData(nodeId, { pendingChangeCount: next });
}