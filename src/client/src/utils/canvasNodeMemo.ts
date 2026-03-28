// src/client/src/utils/canvasNodeMemo.ts
//
// PERFORMANCE OPTIMIZATION UTILITIES FOR CANVAS NODES:
// ======================================================
// This module provides memoization utilities specifically designed for
// React Flow custom nodes with image/video content.
//
// KEY OPTIMIZATIONS:
// 1. SHALLOW SELECTORS: Prevent re-renders when parent state changes but relevant data doesn't
// 2. STABLE COMPARATORS: Custom comparison functions for efficient change detection
// 3. NODE IDENTITY PRESERVATION: Maintain object references to allow React Flow's internal optimization
// 4. BATCH COMPARISON: Compare multiple fields efficiently in a single pass
//
// USAGE:
// - Use createNodeSelector() for memoized node lookups
// - Use useStableNode() for memoizing node props in custom node components
// - Use compareNodes() for efficient node comparison
//
// MEMOIZATION MARKERS (for code clarity):
// - PERF-SELECT: Optimized selectors
// - PERF-COMPARE: Efficient comparison logic
// - PERF-PRESERVE: Identity preservation
// ============================================================================

import { useMemo, useRef } from 'react';
import type { CanvasNode, CanvasNodeData } from '../domain/canvas/NodeTypes.js';

/**
 * PERF-SELECT: Creates a memoized node lookup Map for O(1) access.
 * This avoids repeated O(n) array.find() calls.
 */
export function createNodeMap(nodes: CanvasNode[]): Map<string, CanvasNode> {
  const map = new Map<string, CanvasNode>();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    map.set(node.id, node);
  }
  return map;
}

/**
 * PERF-SELECT: O(1) node lookup from a pre-built Map.
 */
export function getNodeById(nodeMap: Map<string, CanvasNode>, id: string): CanvasNode | undefined {
  return nodeMap.get(id);
}

/**
 * PERF-SELECT: Creates a filtered node list based on predicate.
 * More efficient than Array.filter for frequent filtering operations.
 */
export function filterNodes<T extends CanvasNode>(
  nodes: T[],
  predicate: (node: T) => boolean
): T[] {
  const result: T[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (predicate(node)) {
      result.push(node);
    }
  }
  return result;
}

/**
 * PERF-SELECT: Gets nodes by type efficiently.
 */
export function getNodesByType(nodes: CanvasNode[], type: string): CanvasNode[] {
  const result: CanvasNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type === type) {
      result.push(node);
    }
  }
  return result;
}

/**
 * PERF-PRESERVE: Stable reference for node data comparison.
 * Only returns a new object if actual data changed.
 */
export function useStableNodeData<T extends CanvasNodeData>(
  data: T,
  comparator?: (prev: T, curr: T) => boolean
): T {
  const prevDataRef = useRef<T>(data);
  
  // Default comparison: check all keys
  const defaultComparator = (prev: T, curr: T): boolean => {
    const prevKeys = Object.keys(prev);
    const currKeys = Object.keys(curr);
    
    if (prevKeys.length !== currKeys.length) return false;
    
    for (const key of prevKeys) {
      if (prev[key as keyof T] !== curr[key as keyof T]) {
        return false;
      }
    }
    return true;
  };
  
  const compare = comparator || defaultComparator;
  
  if (!compare(prevDataRef.current, data)) {
    prevDataRef.current = data;
  }
  
  return prevDataRef.current;
}

/**
 * PERF-COMPARE: Efficient multi-field node comparison.
 * Returns true if node properties haven't meaningfully changed.
 */
export function compareNodes(
  prevNode: CanvasNode,
  currNode: CanvasNode,
  options?: {
    comparePosition?: boolean;
    compareData?: boolean;
    compareSelected?: boolean;
  }
): boolean {
  const { comparePosition = true, compareData = true, compareSelected = true } = options || {};
  
  // Quick ID check
  if (prevNode.id !== currNode.id) return false;
  
  // Position comparison (most frequent change during drag)
  if (comparePosition) {
    if (prevNode.position.x !== currNode.position.x || 
        prevNode.position.y !== currNode.position.y) {
      return false;
    }
  }
  
  // Selected state comparison
  if (compareSelected) {
    if (prevNode.selected !== currNode.selected) {
      return false;
    }
  }
  
  // Data comparison (expensive - only check if position/selected unchanged)
  if (compareData) {
    const prevData = prevNode.data;
    const currData = currNode.data;
    
    const prevKeys = Object.keys(prevData);
    const currKeys = Object.keys(currData);
    
    if (prevKeys.length !== currKeys.length) return false;
    
    for (const key of prevKeys) {
      if (prevData[key as keyof CanvasNodeData] !== currData[key as keyof CanvasNodeData]) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * PERF-SELECT: Memoized node lookup hook.
 * Replaces useMemo(() => nodes.find(n => n.id === id), [nodes, id])
 * but with proper cleanup when node doesn't exist.
 */
export function useNodeById(nodes: CanvasNode[], nodeId: string | null): CanvasNode | null {
  return useMemo(() => {
    if (!nodeId) return null;
    
    // Fast path: linear search (nodes array typically < 1000)
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === nodeId) {
        return nodes[i];
      }
    }
    return null;
  }, [nodes, nodeId]);
}

/**
 * PERF-SELECT: Memoized connected nodes lookup.
 */
export function useConnectedNodes(
  nodes: CanvasNode[],
  edgeSources: Set<string>,
  edgeTargets: Set<string>
): { incoming: CanvasNode[]; outgoing: CanvasNode[] } {
  return useMemo(() => {
    const incoming: CanvasNode[] = [];
    const outgoing: CanvasNode[] = [];
    
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (edgeTargets.has(node.id)) {
        incoming.push(node);
      }
      if (edgeSources.has(node.id)) {
        outgoing.push(node);
      }
    }
    
    return { incoming, outgoing };
  }, [nodes, edgeSources, edgeTargets]);
}

/**
 * PERF-SELECT: Creates edge lookup maps for efficient connected node queries.
 */
export function useEdgeLookups(edges: { source: string; target: string }[]): {
  sourceToTargets: Map<string, Set<string>>;
  targetToSources: Map<string, Set<string>>;
} {
  return useMemo(() => {
    const sourceToTargets = new Map<string, Set<string>>();
    const targetToSources = new Map<string, Set<string>>();
    
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      
      // Source -> Targets
      let targets = sourceToTargets.get(edge.source);
      if (!targets) {
        targets = new Set<string>();
        sourceToTargets.set(edge.source, targets);
      }
      targets.add(edge.target);
      
      // Target -> Sources
      let sources = targetToSources.get(edge.target);
      if (!sources) {
        sources = new Set<string>();
        targetToSources.set(edge.target, sources);
      }
      sources.add(edge.source);
    }
    
    return { sourceToTargets, targetToSources };
  }, [edges]);
}
