// src/client/src/store/useCanvasInteractionStore.ts
//
// Manages two orthogonal canvas interaction concerns:
//
//   1. EDGE VISIBILITY MODE
//      Toggles between 'all' (show every edge) and 'none' (clean canvas).
//      Only active when no node is selected — selection always overrides this
//      to show only edges connected to the selected node.
//
//   2. PENDING CHANGES
//      Tracks unsaved connection additions and removals independently of
//      the ReactFlow edge store. This lets us:
//        • Render pending edges with a distinct visual style (amber dashed)
//        • Show pending-change badges on affected nodes
//        • Batch-commit or discard all changes on Save / Cancel
//
// RULE: This store holds NO entity data (characters, scenes, locations).
//   It is purely a canvas-interaction concern.

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { EdgeType } from '../../../shared/types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export type EdgeVisibilityMode = 'all' | 'none';
export type PendingChangeType = 'add' | 'remove';

export interface PendingChange {
    /** Matches the CanvasEdge.id this change is associated with. */
    edgeId: string;
    changeType: PendingChangeType;
    sourceId: string;
    targetId: string;
    sourceHandle?: string;
    targetHandle?: string;
    edgeType: EdgeType;
    timestamp: number;
}

// ============================================================================
// STORE STATE
// ============================================================================

interface CanvasInteractionState {
    // ── Edge visibility ────────────────────────────────────────────────────────
    edgeVisibilityMode: EdgeVisibilityMode;
    toggleEdgeVisibility: () => void;
    setEdgeVisibilityMode: (mode: EdgeVisibilityMode) => void;

    // ── Pending changes ────────────────────────────────────────────────────────
    /** All unsaved changes, keyed by edgeId. */
    pendingChanges: Map<string, PendingChange>;

    /** Derived set of node IDs that have at least one pending change. */
    nodesWithPendingChanges: Set<string>;

    addPendingChange: (change: PendingChange) => void;
    removePendingChange: (edgeId: string) => void;
    clearPendingChanges: () => void;

    // ── Helpers ────────────────────────────────────────────────────────────────
    /** Returns all pending changes touching a given node ID. */
    getPendingChangesForNode: (nodeId: string) => PendingChange[];
    hasPendingChanges: () => boolean;
}

// ============================================================================
// STORE
// ============================================================================

function recomputeNodeSet(changes: Map<string, PendingChange>): Set<string> {
    const nodes = new Set<string>();
    changes.forEach((c) => {
        nodes.add(c.sourceId);
        nodes.add(c.targetId);
    });
    return nodes;
}

export const useCanvasInteractionStore = create<CanvasInteractionState>()(
    subscribeWithSelector((set, get) => ({
        // ── Edge visibility ────────────────────────────────────────────────────
        edgeVisibilityMode: 'all',

        toggleEdgeVisibility: () =>
            set((s) => ({
                edgeVisibilityMode: s.edgeVisibilityMode === 'all' ? 'none' : 'all',
            })),

        setEdgeVisibilityMode: (mode) => set({ edgeVisibilityMode: mode }),

        // ── Pending changes ────────────────────────────────────────────────────
        pendingChanges: new Map(),
        nodesWithPendingChanges: new Set(),

        addPendingChange: (change) =>
            set((s) => {
                const next = new Map(s.pendingChanges);
                next.set(change.edgeId, change);
                return {
                    pendingChanges: next,
                    nodesWithPendingChanges: recomputeNodeSet(next),
                };
            }),

        removePendingChange: (edgeId) =>
            set((s) => {
                const next = new Map(s.pendingChanges);
                next.delete(edgeId);
                return {
                    pendingChanges: next,
                    nodesWithPendingChanges: recomputeNodeSet(next),
                };
            }),

        clearPendingChanges: () =>
            set({
                pendingChanges: new Map(),
                nodesWithPendingChanges: new Set(),
            }),

        // ── Helpers ────────────────────────────────────────────────────────────
        getPendingChangesForNode: (nodeId) => {
            const results: PendingChange[] = [];
            get().pendingChanges.forEach((c) => {
                if (c.sourceId === nodeId || c.targetId === nodeId) results.push(c);
            });
            return results;
        },

        hasPendingChanges: () => get().pendingChanges.size > 0,
    }))
);