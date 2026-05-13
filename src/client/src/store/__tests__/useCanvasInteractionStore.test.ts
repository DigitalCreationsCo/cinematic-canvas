// src/__tests__/useCanvasInteractionStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasInteractionStore } from '../useCanvasInteractionStore.js';
import type { PendingChange } from '../useCanvasInteractionStore.js';

// ============================================================================
// HELPERS
// ============================================================================

function makePendingChange(overrides: Partial<PendingChange> = {}): PendingChange {
    return {
        edgeId: 'edge-abc',
        changeType: 'add',
        sourceId: 'char-1',
        targetId: 'scene-1',
        sourceHandle: 'source_character',
        targetHandle: 'entities',
        edgeType: 'character_in_scene',
        timestamp: Date.now(),
        ...overrides,
    };
}

beforeEach(() => {
    useCanvasInteractionStore.setState({
        edgeVisibilityMode: 'all',
        pendingChanges: new Map(),
        nodesWithPendingChanges: new Set(),
    });
});

// ============================================================================
// Edge visibility
// ============================================================================

describe('edge visibility', () => {
    it('starts with mode "all"', () => {
        expect(useCanvasInteractionStore.getState().edgeVisibilityMode).toBe('all');
    });

    it('toggleEdgeVisibility switches from "all" to "none"', () => {
        useCanvasInteractionStore.getState().toggleEdgeVisibility();
        expect(useCanvasInteractionStore.getState().edgeVisibilityMode).toBe('none');
    });

    it('toggleEdgeVisibility switches from "none" back to "all"', () => {
        useCanvasInteractionStore.getState().toggleEdgeVisibility();
        useCanvasInteractionStore.getState().toggleEdgeVisibility();
        expect(useCanvasInteractionStore.getState().edgeVisibilityMode).toBe('all');
    });

    it('setEdgeVisibilityMode sets to "none" directly', () => {
        useCanvasInteractionStore.getState().setEdgeVisibilityMode('none');
        expect(useCanvasInteractionStore.getState().edgeVisibilityMode).toBe('none');
    });

    it('setEdgeVisibilityMode sets to "all" directly', () => {
        useCanvasInteractionStore.getState().setEdgeVisibilityMode('none');
        useCanvasInteractionStore.getState().setEdgeVisibilityMode('all');
        expect(useCanvasInteractionStore.getState().edgeVisibilityMode).toBe('all');
    });
});

// ============================================================================
// addPendingChange
// ============================================================================

describe('addPendingChange', () => {
    it('adds a change to pendingChanges map', () => {
        const change = makePendingChange();
        useCanvasInteractionStore.getState().addPendingChange(change);
        expect(useCanvasInteractionStore.getState().pendingChanges.size).toBe(1);
        expect(useCanvasInteractionStore.getState().pendingChanges.get('edge-abc')).toEqual(change);
    });

    it('updates nodesWithPendingChanges to include source and target', () => {
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange());
        const nodes = useCanvasInteractionStore.getState().nodesWithPendingChanges;
        expect(nodes.has('char-1')).toBe(true);
        expect(nodes.has('scene-1')).toBe(true);
    });

    it('can add multiple changes for different edges', () => {
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange({ edgeId: 'e1' }));
        useCanvasInteractionStore.getState().addPendingChange(
            makePendingChange({ edgeId: 'e2', sourceId: 'char-2', targetId: 'scene-2' }),
        );
        expect(useCanvasInteractionStore.getState().pendingChanges.size).toBe(2);
        expect(useCanvasInteractionStore.getState().nodesWithPendingChanges.size).toBe(4);
    });

    it('overwrites an existing change for the same edgeId', () => {
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange({ changeType: 'add' }));
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange({ changeType: 'remove' }));
        const change = useCanvasInteractionStore.getState().pendingChanges.get('edge-abc');
        expect(change?.changeType).toBe('remove');
        expect(useCanvasInteractionStore.getState().pendingChanges.size).toBe(1);
    });

    it('adds a pending-remove change', () => {
        const change = makePendingChange({ changeType: 'remove' });
        useCanvasInteractionStore.getState().addPendingChange(change);
        expect(useCanvasInteractionStore.getState().pendingChanges.get('edge-abc')?.changeType).toBe('remove');
    });
});

// ============================================================================
// removePendingChange
// ============================================================================

describe('removePendingChange', () => {
    it('removes an existing change by edgeId', () => {
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange({ edgeId: 'e1', sourceId: 'a', targetId: 'b' }));
        useCanvasInteractionStore.getState().removePendingChange('e1');
        expect(useCanvasInteractionStore.getState().pendingChanges.size).toBe(0);
    });

    it('recomputes nodesWithPendingChanges after removal', () => {
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange({ edgeId: 'e1', sourceId: 'a', targetId: 'b' }));
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange({ edgeId: 'e2', sourceId: 'c', targetId: 'd' }));
        useCanvasInteractionStore.getState().removePendingChange('e1');
        const nodes = useCanvasInteractionStore.getState().nodesWithPendingChanges;
        expect(nodes.has('a')).toBe(false);
        expect(nodes.has('b')).toBe(false);
        expect(nodes.has('c')).toBe(true);
        expect(nodes.has('d')).toBe(true);
    });

    it('is a no-op for an unknown edgeId', () => {
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange());
        useCanvasInteractionStore.getState().removePendingChange('nonexistent');
        expect(useCanvasInteractionStore.getState().pendingChanges.size).toBe(1);
    });

    it('clears nodesWithPendingChanges when last change is removed', () => {
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange());
        useCanvasInteractionStore.getState().removePendingChange('edge-abc');
        expect(useCanvasInteractionStore.getState().nodesWithPendingChanges.size).toBe(0);
    });
});

// ============================================================================
// clearPendingChanges
// ============================================================================

describe('clearPendingChanges', () => {
    it('empties pendingChanges map', () => {
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange({ edgeId: 'e1' }));
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange({ edgeId: 'e2' }));
        useCanvasInteractionStore.getState().clearPendingChanges();
        expect(useCanvasInteractionStore.getState().pendingChanges.size).toBe(0);
    });

    it('empties nodesWithPendingChanges set', () => {
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange());
        useCanvasInteractionStore.getState().clearPendingChanges();
        expect(useCanvasInteractionStore.getState().nodesWithPendingChanges.size).toBe(0);
    });

    it('is safe to call when already empty', () => {
        expect(() => useCanvasInteractionStore.getState().clearPendingChanges()).not.toThrow();
    });
});

// ============================================================================
// getPendingChangesForNode
// ============================================================================

describe('getPendingChangesForNode', () => {
    it('returns changes where the node is the source', () => {
        useCanvasInteractionStore.getState().addPendingChange(
            makePendingChange({ edgeId: 'e1', sourceId: 'char-1', targetId: 'scene-1' }),
        );
        const results = useCanvasInteractionStore.getState().getPendingChangesForNode('char-1');
        expect(results).toHaveLength(1);
        expect(results[0].edgeId).toBe('e1');
    });

    it('returns changes where the node is the target', () => {
        useCanvasInteractionStore.getState().addPendingChange(
            makePendingChange({ edgeId: 'e1', sourceId: 'char-1', targetId: 'scene-1' }),
        );
        const results = useCanvasInteractionStore.getState().getPendingChangesForNode('scene-1');
        expect(results).toHaveLength(1);
    });

    it('returns multiple changes for a node involved in several edges', () => {
        useCanvasInteractionStore.getState().addPendingChange(
            makePendingChange({ edgeId: 'e1', sourceId: 'char-1', targetId: 'scene-1' }),
        );
        useCanvasInteractionStore.getState().addPendingChange(
            makePendingChange({ edgeId: 'e2', sourceId: 'char-1', targetId: 'scene-2' }),
        );
        const results = useCanvasInteractionStore.getState().getPendingChangesForNode('char-1');
        expect(results).toHaveLength(2);
    });

    it('returns empty array for a node with no changes', () => {
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange());
        const results = useCanvasInteractionStore.getState().getPendingChangesForNode('unrelated-node');
        expect(results).toHaveLength(0);
    });

    it('returns empty array when there are no pending changes at all', () => {
        const results = useCanvasInteractionStore.getState().getPendingChangesForNode('char-1');
        expect(results).toHaveLength(0);
    });
});

// ============================================================================
// hasPendingChanges
// ============================================================================

describe('hasPendingChanges', () => {
    it('returns false when pendingChanges is empty', () => {
        expect(useCanvasInteractionStore.getState().hasPendingChanges()).toBe(false);
    });

    it('returns true after a change is added', () => {
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange());
        expect(useCanvasInteractionStore.getState().hasPendingChanges()).toBe(true);
    });

    it('returns false after all changes are cleared', () => {
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange());
        useCanvasInteractionStore.getState().clearPendingChanges();
        expect(useCanvasInteractionStore.getState().hasPendingChanges()).toBe(false);
    });

    it('returns false after the only change is removed', () => {
        useCanvasInteractionStore.getState().addPendingChange(makePendingChange());
        useCanvasInteractionStore.getState().removePendingChange('edge-abc');
        expect(useCanvasInteractionStore.getState().hasPendingChanges()).toBe(false);
    });
});