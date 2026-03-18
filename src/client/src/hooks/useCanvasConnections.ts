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
import type { CanvasNode, CanvasEdge } from '../domain/canvas/NodeTypes.js';
import type { CanvasNodeType } from '../../../shared/types/index.js';

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

            // Destructure the setter to clean up state after connection
            const { initiatorNodeId, setInitiatorNodeId, addPendingChange } = useCanvasInteractionStore.getState();
            const { edges, deleteEdge, addEdge, updateNodeData } = useNodeStore.getState();

            const isForwardDrag = initiatorNodeId === source;

            if (!source || !target) return;

            const sourceType = nodeTypeMap(source);
            const targetType = nodeTypeMap(target);
            if (!sourceType || !targetType) return;

            const rule = resolveConnectionRule(sourceType, targetType, sourceHandle, targetHandle);
            if (!rule) return;

            // ── One-to-one enforcement (by EdgeType, not by handle ID) ───────────
            if (rule.oneToOne) {
                const edgeConflicting = edges.find(
                    (e) => e.target === target && e.type === rule.edgeType,
                );
                if (edgeConflicting) {
                    addPendingChange({
                        sourceType,
                        targetType,
                        edgeId: edgeConflicting.id,
                        changeType: 'remove',
                        sourceId: edgeConflicting.source,
                        targetId: edgeConflicting.target,
                        sourceHandle: edgeConflicting.sourceHandle ?? undefined,
                        targetHandle: edgeConflicting.targetHandle ?? undefined,
                        edgeType: rule.edgeType,
                        timestamp: Date.now(),
                    });
                    deleteEdge(edgeConflicting.id);
                }
            }

            // ── Determine Discoverability Metadata (Options A & C) ───────────────
            // Only apply directional logic to frame_input bridging two scenes.
            const isDirectionalFlow = rule.edgeType === 'frame_input' && sourceType === 'scene' && targetType === 'scene';
            const stringDragDirection = isForwardDrag ? 'forward' : 'backward';

            let configEdgeLabel: string | undefined = undefined;
            let configEdgeClass: string | undefined = undefined;

            if (isDirectionalFlow) {
                configEdgeLabel = isForwardDrag ? 'Using Source End Frame' : 'Using Target Start Frame';
                configEdgeClass = isForwardDrag ? 'forward-flow' : 'backward-flow';
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

            // Option A: Apply the floating label
            if (configEdgeLabel) {
                newEdge.label = configEdgeLabel;
                newEdge.labelStyle = { fill: '#ffffff', fontWeight: 600, fontSize: 11 };
                newEdge.labelBgStyle = { fill: '#1a1a1a', fillOpacity: 0.85, rx: 4, ry: 4 };
                newEdge.labelBgPadding = [8, 4];
            }

            // Option C: Apply the directional animation class
            if (configEdgeClass) {
                newEdge.className = newEdge.className ? `${newEdge.className} ${configEdgeClass}` : configEdgeClass;
                newEdge.animated = true; // Ensure standard XYFlow animation is triggered
            }

            addEdge(newEdge);

            // ── Register pending change ──────────────────────────────────────────
            addPendingChange({
                edgeId: newEdge.id,
                sourceType,
                targetType,
                changeType: 'add',
                sourceId: source,
                targetId: target,
                sourceHandle: sourceHandle ?? undefined,
                targetHandle: targetHandle ?? undefined,
                edgeType: rule.edgeType,
                timestamp: Date.now(),
                // Pass the metadata down so the backend BatchUpdate can parse the Master frame
                jsonUiMetadata: isDirectionalFlow ? {
                    initiatorId: initiatorNodeId,
                    dragDirection: stringDragDirection
                } : undefined
            });

            bumpPendingCount(source, updateNodeData);
            bumpPendingCount(target, updateNodeData);

            // ── Cleanup: Reset initiator to prevent stale state ──────────────────
            setInitiatorNodeId(null);
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