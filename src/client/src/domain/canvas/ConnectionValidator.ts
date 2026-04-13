// src/client/src/domain/canvas/ConnectionValidator.ts
//
// Validates ReactFlow connections against the CONNECTION_RULES table in NodeTypes.ts.
//
// KEY CHANGE from the 3-handle scheme:
//   With a single scene_target handle, the one-to-one check for scene_sequence
//   can no longer rely on a specific targetHandle ID — it must check by EdgeType.
//   This is handled in useCanvasConnections.onConnect, not here.
//
// This file remains pure validation (no side effects):
//   1. ReactFlow `isValidConnection` prop — live drag validation
//   2. `resolveEdgeType` — used by onConnect to build the correct edge
//   3. `getCompatibleTargetHandles` — dims incompatible handles during drag

import type { Connection } from '@xyflow/react';
import { CONNECTION_RULES } from './NodeTypes.js';
import type { CanvasNodeType, EdgeType, ConnectionRule } from './NodeTypes.js';

// ============================================================================
// RESOLUTION
// ============================================================================

/**
 * Returns the first matching ConnectionRule for a connection attempt,
 * or null if no rule permits it.
 *
 * Handle matching is loose: a rule with `sourceHandle: undefined` matches
 * any source handle, allowing future rules to be handle-agnostic.
 */
export function resolveConnectionRule(
    sourceNodeType: CanvasNodeType,
    targetNodeType: CanvasNodeType,
    sourceHandle?: string | null,
    targetHandle?: string | null,
): ConnectionRule | null {
    for (const rule of CONNECTION_RULES) {
        if (rule.sourceNodeType !== sourceNodeType) continue;
        if (rule.targetNodeType !== targetNodeType) continue;
        if (rule.sourceHandle != null && rule.sourceHandle !== sourceHandle) continue;
        if (rule.targetHandle != null && rule.targetHandle !== targetHandle) continue;
        return rule;
    }
    return null;
}

/**
 * Returns the EdgeType for a valid connection, or null if invalid.
 */
export function resolveEdgeType(
    sourceNodeType: CanvasNodeType,
    targetNodeType: CanvasNodeType,
    sourceHandle?: string | null,
    targetHandle?: string | null,
): EdgeType | null {
    return (
        resolveConnectionRule(sourceNodeType, targetNodeType, sourceHandle, targetHandle)
            ?.edgeType ?? null
    );
}

// ============================================================================
// REACT FLOW `isValidConnection`
// ============================================================================

/**
 * Drop-in for ReactFlow's `isValidConnection` prop.
 *
 * Usage:
 *   const { isValidConnection } = useCanvasConnections(nodes);
 *   <ReactFlow isValidConnection={isValidConnection} />
 */
export function isValidConnection(
    connection: Connection,
    getNodeType: (id: string) => CanvasNodeType | undefined,
): boolean {
    if (!connection.source || !connection.target) return false;
    // Self-loops are never valid.
    if (connection.source === connection.target) return false;

    const sourceType = getNodeType(connection.source);
    const targetType = getNodeType(connection.target);
    if (!sourceType || !targetType) return false;

    return resolveEdgeType(
        sourceType,
        targetType,
        connection.sourceHandle,
        connection.targetHandle,
    ) !== null;
}

// ============================================================================
// HANDLE COMPATIBILITY (drag-affordance CSS)
// ============================================================================

/**
 * Given the type of node being dragged FROM, returns the Set of target handle
 * IDs that are valid drop targets.
 *
 * Node components use this to glow compatible handles and dim others:
 *   const compatible = getCompatibleTargetHandles(draggingNodeType, dragHandle);
 *   class={compatible.has(handleId) ? 'handle-compatible' : 'handle-incompatible'}
 */
export function getCompatibleTargetHandles(
    draggingFromNodeType: CanvasNodeType,
    draggingFromHandle?: string | null,
): Set<string> {
    const result = new Set<string>();
    for (const rule of CONNECTION_RULES) {
        if (rule.sourceNodeType !== draggingFromNodeType) continue;
        if (rule.sourceHandle != null && rule.sourceHandle !== draggingFromHandle) continue;
        if (rule.targetHandle) result.add(rule.targetHandle);
    }
    return result;
}

/**
 * Given a target node type being hovered, returns which source handle IDs
 * could connect to it. Used for the inverse affordance direction.
 */
export function getCompatibleSourceHandles(
    hoveringOverNodeType: CanvasNodeType,
    hoveringOverHandle?: string | null,
): Set<string> {
    const result = new Set<string>();
    for (const rule of CONNECTION_RULES) {
        if (rule.targetNodeType !== hoveringOverNodeType) continue;
        if (rule.targetHandle != null && rule.targetHandle !== hoveringOverHandle) continue;
        if (rule.sourceHandle) result.add(rule.sourceHandle);
    }
    return result;
}