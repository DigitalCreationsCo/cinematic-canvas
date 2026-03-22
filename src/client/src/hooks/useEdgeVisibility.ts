// src/client/src/hooks/useEdgeVisibility.ts
//
// Derives the `hidden` property for every canvas edge based on:
//   1. Which node is currently selected (selectedNodeId from useCanvasUIStore)
//   2. The global edge visibility toggle (edgeVisibilityMode from useCanvasInteractionStore)
//   3. Whether there are pending changes (pendingChanges from useCanvasInteractionStore)
//
// Priority:
//   • If there are PENDING CHANGES → show ALL edges (so users can see pending connections)
//   • If a node IS selected → show only edges that touch that node; hide all others.
//   • If NO node is selected → apply the global toggle ('all' | 'none').
//
// When pending changes are confirmed or cancelled, the visibility reverts to the
// previous setting (either 'all' or 'none' based on edgeVisibilityMode).

import { useMemo } from 'react';
import { useCanvasUIStore } from '../store/useCanvasUIStore.js';
import { useCanvasInteractionStore } from '../store/useCanvasInteractionStore.js';
import type { CanvasEdge } from '../domain/canvas/NodeTypes.js';

export function useEdgeVisibility(edges: CanvasEdge[]): CanvasEdge[] {
  const selectedNodeId = useCanvasUIStore((s) => s.selectedNodeId);
  const edgeVisibilityMode = useCanvasInteractionStore((s) => s.edgeVisibilityMode);
  const pendingChanges = useCanvasInteractionStore((s) => s.pendingChanges);
  const hasPendingChanges = pendingChanges.size > 0;

  return useMemo(() => {
    // Case 1: There are pending changes — show all edges so users can see them
    if (hasPendingChanges) {
      return edges.map((edge) => {
        if (edge.hidden === false) return edge;
        return { ...edge, hidden: false };
      });
    }

    // Case 2: a node is selected — show only edges that touch that node
    if (selectedNodeId) {
      return edges.map((edge) => {
        const shouldBeHidden = edge.source !== selectedNodeId && edge.target !== selectedNodeId;
        if (edge.hidden === shouldBeHidden) return edge;
        return { ...edge, hidden: shouldBeHidden };
      });
    }

    // Case 3: nothing selected — apply global toggle
    const hide = edgeVisibilityMode === 'none';
    return edges.map((edge) => {
      const shouldBeHidden = hide ? true : false;
      if (edge.hidden === shouldBeHidden) return edge;
      return { ...edge, hidden: shouldBeHidden };
    });
  }, [edges, selectedNodeId, edgeVisibilityMode, hasPendingChanges]);
}