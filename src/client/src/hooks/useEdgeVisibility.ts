// src/client/src/hooks/useEdgeVisibility.ts
//
// PERFORMANCE OPTIMIZATION:
// ======================
// This hook memoizes edge visibility transformations to avoid recalculating
// on every render. Uses identity preservation for unchanged edges.
//
// MEMOIZATION MARKERS:
// - PERF-MEMO: useMemo for expensive computations
// ============================================================================

import { useMemo } from 'react';
import { useCanvasUIStore } from '../store/useCanvasUIStore.js';
import { useCanvasInteractionStore } from '../store/useCanvasInteractionStore.js';
import type { CanvasEdge } from '../domain/canvas/NodeTypes.js';

export function useEdgeVisibility(edges: CanvasEdge[]): CanvasEdge[] {
  // PERF-SELECTOR: Individual selectors for granular re-renders
  const selectedNodeId = useCanvasUIStore((s) => s.selectedNodeId);
  const edgeVisibilityMode = useCanvasInteractionStore((s) => s.edgeVisibilityMode);
  const pendingChanges = useCanvasInteractionStore((s) => s.pendingChanges);
  
  // PERF-MEMO: Memoize derived state
  const hasPendingChanges = useMemo(
    () => pendingChanges.size > 0,
    [pendingChanges]
  );

  // PERF-MEMO: Memoize edge visibility calculations
  // Uses identity preservation - returns original edge reference if no changes needed
  return useMemo(() => {
    // Fast path: no selection and no pending changes - return original edges
    if (!selectedNodeId && !hasPendingChanges && edgeVisibilityMode !== 'none') {
      return edges;
    }

    // Process each edge
    const result = new Array<CanvasEdge>(edges.length);
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const isPendingEdge = edge.data?.pending === true;
      
      if (isPendingEdge) {
        // Pending edges: show if there are pending changes
        if (hasPendingChanges && edge.hidden !== false) {
          result[i] = { ...edge, hidden: false };
        } else {
          result[i] = edge;
        }
        continue;
      }

      if (selectedNodeId) {
        // Filter by selected node
        const shouldBeHidden = edge.source !== selectedNodeId && edge.target !== selectedNodeId;
        if (edge.hidden !== shouldBeHidden) {
          result[i] = { ...edge, hidden: shouldBeHidden };
        } else {
          result[i] = edge;
        }
        continue;
      }

      // Global visibility mode
      const shouldBeHidden = edgeVisibilityMode === 'none';
      if (edge.hidden !== shouldBeHidden) {
        result[i] = { ...edge, hidden: shouldBeHidden };
      } else {
        result[i] = edge;
      }
    }
    
    return result;
  }, [edges, selectedNodeId, edgeVisibilityMode, hasPendingChanges]);
}