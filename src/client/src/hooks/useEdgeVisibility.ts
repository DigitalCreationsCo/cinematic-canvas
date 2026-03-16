// src/client/src/hooks/useEdgeVisibility.ts
//
// Derives the `hidden` property for every canvas edge based on:
//   1. Which node is currently selected (selectedNodeId from useCanvasUIStore)
//   2. The global edge visibility toggle (edgeVisibilityMode from useCanvasInteractionStore)
//
// Priority:
//   • If a node IS selected  →  show only edges that touch that node; hide all others.
//   • If NO node is selected →  apply the global toggle ('all' | 'none').
//
// DESIGN: Pure computation — no side effects. Returns a new edge array that
// ReactFlow can use directly. Called once per render in the canvas component:
//
//   const visibleEdges = useEdgeVisibility(rawEdges);
//   <ReactFlow edges={visibleEdges} ... />

import { useMemo } from 'react';
import { useCanvasUIStore } from '../store/useCanvasUIStore.js';
import { useCanvasInteractionStore } from '../store/useCanvasInteractionStore.js';
import type { CanvasEdge } from '../domain/canvas/NodeTypes.js';

export function useEdgeVisibility(edges: CanvasEdge[]): CanvasEdge[] {
  const selectedNodeId = useCanvasUIStore((s) => s.selectedNodeId);
  const edgeVisibilityMode = useCanvasInteractionStore((s) => s.edgeVisibilityMode);

  return useMemo(() => {
    // ── Case 1: a node is selected ──────────────────────────────────────────
    // Show only edges where the selected node is source OR target.
    // All other edges are hidden regardless of the global toggle.
    if (selectedNodeId) {
      return edges.map((edge) => ({
        ...edge,
        hidden: edge.source !== selectedNodeId && edge.target !== selectedNodeId,
      }));
    }

    // ── Case 2: nothing selected — apply global toggle ──────────────────────
    const hide = edgeVisibilityMode === 'none';
    if (!hide) return edges.map((e) => ({ ...e, hidden: false }));
    return edges.map((e) => ({ ...e, hidden: true }));
  }, [edges, selectedNodeId, edgeVisibilityMode]);
}