// src/hooks/__tests__/useEdgeVisibility.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from '@testing-library/react';
import { useEdgeVisibility } from '../useEdgeVisibility.js';
import { useCanvasUIStore } from '../../store/useCanvasUIStore.js';
import { useCanvasInteractionStore } from '../../store/useCanvasInteractionStore.js';
import { NodeFactory } from '../../domain/canvas/NodeFactory.js';
import type { CanvasEdge } from '../../domain/canvas/NodeTypes.js';

// ============================================================================
// HELPERS
// ============================================================================

function makeEdge(
    sourceId: string,
    targetId: string,
    type: 'scene_sequence' | 'character_in_scene' = 'scene_sequence',
): CanvasEdge {
    return NodeFactory.createEdge({ sourceId, targetId, type });
}

beforeEach(() => {
    useCanvasUIStore.setState({ selectedNodeId: null });
    useCanvasInteractionStore.setState({
        edgeVisibilityMode: 'all',
        pendingChanges: new Map(),
        nodesWithPendingChanges: new Set(),
    });
});

// ============================================================================
// No selection — global toggle
// ============================================================================

describe('no node selected + visibility mode = "all"', () => {
    it('returns all edges with hidden: false', () => {
        const edges = [
            makeEdge('a', 'b'),
            makeEdge('c', 'd'),
        ];
        const { result } = renderHook(() => useEdgeVisibility(edges));
        result.current.forEach((e) => expect(e.hidden).toBe(false));
    });

    it('preserves edge id and other fields', () => {
        const edges = [makeEdge('scene-1', 'scene-2')];
        const { result } = renderHook(() => useEdgeVisibility(edges));
        expect(result.current[0].source).toBe('scene-1');
        expect(result.current[0].target).toBe('scene-2');
    });

    it('returns empty array when no edges provided', () => {
        const { result } = renderHook(() => useEdgeVisibility([]));
        expect(result.current).toHaveLength(0);
    });
});

describe('no node selected + visibility mode = "none"', () => {
    beforeEach(() => {
        useCanvasInteractionStore.getState().setEdgeVisibilityMode('none');
    });

    it('hides all edges', () => {
        const edges = [makeEdge('a', 'b'), makeEdge('c', 'd')];
        const { result } = renderHook(() => useEdgeVisibility(edges));
        result.current.forEach((e) => expect(e.hidden).toBe(true));
    });

    it('returns empty array when no edges provided', () => {
        const { result } = renderHook(() => useEdgeVisibility([]));
        expect(result.current).toHaveLength(0);
    });
});

// ============================================================================
// Node selected — shows only connected edges
// ============================================================================

describe('node selected', () => {
    beforeEach(() => {
        act(() => {
            useCanvasUIStore.getState().selectNode('scene-1');
        });
    });

    it('shows edges where selected node is source', () => {
        const edges = [
            makeEdge('scene-1', 'scene-2'),
            makeEdge('char-1', 'scene-1'),
            makeEdge('loc-1', 'scene-3'),
        ];
        const { result } = renderHook(() => useEdgeVisibility(edges));
        expect(result.current[0].hidden).toBe(false); // scene-1 is source
        expect(result.current[1].hidden).toBe(false); // scene-1 is target
        expect(result.current[2].hidden).toBe(true);  // scene-1 not involved
    });

    it('shows edges where selected node is target', () => {
        const edges = [makeEdge('char-1', 'scene-1')];
        const { result } = renderHook(() => useEdgeVisibility(edges));
        expect(result.current[0].hidden).toBe(false);
    });

    it('hides edges where selected node is neither source nor target', () => {
        const edges = [makeEdge('a', 'b'), makeEdge('c', 'd')];
        const { result } = renderHook(() => useEdgeVisibility(edges));
        result.current.forEach((e) => expect(e.hidden).toBe(true));
    });

    it('overrides the global "none" toggle — still shows connected edges', () => {
        useCanvasInteractionStore.getState().setEdgeVisibilityMode('none');
        const edges = [makeEdge('scene-1', 'scene-2')];
        const { result } = renderHook(() => useEdgeVisibility(edges));
        // Selection overrides global toggle
        expect(result.current[0].hidden).toBe(false);
    });

    it('returns empty array when no edges provided', () => {
        const { result } = renderHook(() => useEdgeVisibility([]));
        expect(result.current).toHaveLength(0);
    });
});

// ============================================================================
// Reactivity — re-runs when selection changes
// ============================================================================

describe('reactivity', () => {
    it('updates when selectedNodeId changes', () => {
        const edges = [makeEdge('scene-1', 'scene-2'), makeEdge('char-1', 'scene-3')];

        const { result, rerender } = renderHook(() => useEdgeVisibility(edges));
        // Nothing selected — all visible
        result.current.forEach((e) => expect(e.hidden).toBe(false));

        act(() => useCanvasUIStore.getState().selectNode('scene-1'));
        rerender();

        // scene-1 is source of first edge → visible; not involved in second → hidden
        expect(result.current[0].hidden).toBe(false);
        expect(result.current[1].hidden).toBe(true);
    });

    it('updates when visibility toggle changes', () => {
        const edges = [makeEdge('a', 'b')];
        const { result, rerender } = renderHook(() => useEdgeVisibility(edges));
        expect(result.current[0].hidden).toBe(false);

        act(() => useCanvasInteractionStore.getState().toggleEdgeVisibility());
        rerender();
        expect(result.current[0].hidden).toBe(true);
    });

    it('updates when selection is cleared back to null', () => {
        const edges = [makeEdge('scene-1', 'scene-2'), makeEdge('x', 'y')];
        act(() => useCanvasUIStore.getState().selectNode('scene-1'));

        const { result, rerender } = renderHook(() => useEdgeVisibility(edges));
        expect(result.current[1].hidden).toBe(true);

        act(() => useCanvasUIStore.getState().selectNode(null));
        rerender();
        result.current.forEach((e) => expect(e.hidden).toBe(false));
    });
});