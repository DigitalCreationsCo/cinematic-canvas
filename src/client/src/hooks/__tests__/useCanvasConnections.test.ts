// src/__tests__/useCanvasConnections.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCanvasConnections } from '../useCanvasConnections.js';
import { useNodeStore } from '../../store/useNodeStore.js';
import { useCanvasInteractionStore } from '../../store/useCanvasInteractionStore.js';
import { NodeFactory } from '../../domain/canvas/NodeFactory.js';
import { HANDLE_IDS } from '../../domain/canvas/NodeTypes.js';
import type { CanvasNode } from '../../domain/canvas/NodeTypes.js';

// ============================================================================
// HELPERS
// ============================================================================

function makeNode(id: string, type: CanvasNode['type']): CanvasNode {
    return NodeFactory.createNode({
        type,
        entityId: id,
        contextId: 'project-1',
        contextType: 'project',
        posCanvas: { x: 0, y: 0 },
        scope: 'project',
    }) as CanvasNode;
}

function makeNodes(...pairs: Array<[string, CanvasNode['type']]>): CanvasNode[] {
    return pairs.map(([id, type]) => makeNode(id, type));
}

// Reset all stores before each test.
beforeEach(() => {
    useNodeStore.setState({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    useCanvasInteractionStore.setState({
        edgeVisibilityMode: 'all',
        pendingChanges: new Map(),
        nodesWithPendingChanges: new Set(),
    });
});

// ============================================================================
// isValidConnection
// ============================================================================

describe('isValidConnection', () => {
    it('validates a legal character → scene connection', () => {
        const nodes = makeNodes(['char-1', 'character'], ['scene-1', 'scene']);
        const { result } = renderHook(() => useCanvasConnections(nodes));
        const valid = result.current.isValidConnection({
            source: 'char-1', target: 'scene-1',
            sourceHandle: HANDLE_IDS.character.source,
            targetHandle: HANDLE_IDS.scene.target,
        });
        expect(valid).toBe(true);
    });

    it('rejects an invalid connection (character → character)', () => {
        const nodes = makeNodes(['char-1', 'character'], ['char-2', 'character']);
        const { result } = renderHook(() => useCanvasConnections(nodes));
        const valid = result.current.isValidConnection({
            source: 'char-1', target: 'char-2', sourceHandle: null, targetHandle: null,
        });
        expect(valid).toBe(false);
    });

    it('rejects a self-loop', () => {
        const nodes = makeNodes(['scene-1', 'scene']);
        const { result } = renderHook(() => useCanvasConnections(nodes));
        const valid = result.current.isValidConnection({
            source: 'scene-1', target: 'scene-1',
            sourceHandle: HANDLE_IDS.scene.source,
            targetHandle: HANDLE_IDS.scene.target,
        });
        expect(valid).toBe(false);
    });
});

// ============================================================================
// onConnect — basic edge creation
// ============================================================================

describe('onConnect — basic edge creation', () => {
    it('creates a pending edge in useNodeStore for character → scene', () => {
        const nodes = makeNodes(['char-1', 'character'], ['scene-1', 'scene']);
        nodes.forEach((n) => useNodeStore.getState().addNode(n));
        const { result } = renderHook(() => useCanvasConnections(nodes));

        act(() => result.current.onConnect({
            source: 'char-1', target: 'scene-1',
            sourceHandle: HANDLE_IDS.character.source,
            targetHandle: HANDLE_IDS.scene.target,
        }));

        const edges = useNodeStore.getState().edges;
        expect(edges).toHaveLength(1);
        expect(edges[0].type).toBe('character_in_scene');
        expect(edges[0].data?.pending).toBe(true);
        expect(edges[0].data?.pendingType).toBe('add');
    });

    it('creates a pending edge for location → scene', () => {
        const nodes = makeNodes(['loc-1', 'location'], ['scene-1', 'scene']);
        nodes.forEach((n) => useNodeStore.getState().addNode(n));
        const { result } = renderHook(() => useCanvasConnections(nodes));

        act(() => result.current.onConnect({
            source: 'loc-1', target: 'scene-1',
            sourceHandle: HANDLE_IDS.location.source,
            targetHandle: HANDLE_IDS.scene.target,
        }));

        expect(useNodeStore.getState().edges[0].type).toBe('location_in_scene');
    });

    it('creates a pending edge for audio → scene', () => {
        const nodes = makeNodes(['audio-1', 'audio'], ['scene-1', 'scene']);
        nodes.forEach((n) => useNodeStore.getState().addNode(n));
        const { result } = renderHook(() => useCanvasConnections(nodes));

        act(() => result.current.onConnect({
            source: 'audio-1', target: 'scene-1',
            sourceHandle: HANDLE_IDS.audio.source,
            targetHandle: HANDLE_IDS.scene.target,
        }));

        expect(useNodeStore.getState().edges[0].type).toBe('audio_sync');
    });

    it('creates a pending edge for image → scene', () => {
        const nodes = makeNodes(['img-1', 'image'], ['scene-1', 'scene']);
        nodes.forEach((n) => useNodeStore.getState().addNode(n));
        const { result } = renderHook(() => useCanvasConnections(nodes));

        act(() => result.current.onConnect({
            source: 'img-1', target: 'scene-1',
            sourceHandle: HANDLE_IDS.image.source,
            targetHandle: HANDLE_IDS.scene.target,
        }));

        expect(useNodeStore.getState().edges[0].type).toBe('style_applied');
    });

    it('registers the pending change in useCanvasInteractionStore', () => {
        const nodes = makeNodes(['char-1', 'character'], ['scene-1', 'scene']);
        nodes.forEach((n) => useNodeStore.getState().addNode(n));
        const { result } = renderHook(() => useCanvasConnections(nodes));

        act(() => result.current.onConnect({
            source: 'char-1', target: 'scene-1',
            sourceHandle: HANDLE_IDS.character.source,
            targetHandle: HANDLE_IDS.scene.target,
        }));

        expect(useCanvasInteractionStore.getState().hasPendingChanges()).toBe(true);
        expect(useCanvasInteractionStore.getState().nodesWithPendingChanges.has('char-1')).toBe(true);
        expect(useCanvasInteractionStore.getState().nodesWithPendingChanges.has('scene-1')).toBe(true);
    });

    it('bumps pendingChangeCount on both nodes', () => {
        const nodes = makeNodes(['char-1', 'character'], ['scene-1', 'scene']);
        nodes.forEach((n) => useNodeStore.getState().addNode(n));
        const { result } = renderHook(() => useCanvasConnections(nodes));

        act(() => result.current.onConnect({
            source: 'char-1', target: 'scene-1',
            sourceHandle: HANDLE_IDS.character.source,
            targetHandle: HANDLE_IDS.scene.target,
        }));

        const storeNodes = useNodeStore.getState().nodes;
        const char = storeNodes.find((n) => n.id === 'char-1');
        const scene = storeNodes.find((n) => n.id === 'scene-1');
        expect(char!.data.pendingChangeCount).toBe(1);
        expect(scene!.data.pendingChangeCount).toBe(1);
    });

    it('is a no-op when source is null', () => {
        const nodes = makeNodes(['scene-1', 'scene']);
        const { result } = renderHook(() => useCanvasConnections(nodes));
        act(() => result.current.onConnect({ source: '', target: 'scene-1', sourceHandle: null, targetHandle: null }));
        expect(useNodeStore.getState().edges).toHaveLength(0);
    });

    it('is a no-op when target is null', () => {
        const nodes = makeNodes(['char-1', 'character']);
        const { result } = renderHook(() => useCanvasConnections(nodes));
        act(() => result.current.onConnect({ source: 'char-1', target: '', sourceHandle: null, targetHandle: null }));
        expect(useNodeStore.getState().edges).toHaveLength(0);
    });

    it('is a no-op when source node type cannot be resolved', () => {
        const nodes: CanvasNode[] = []; // empty — no types to resolve
        const { result } = renderHook(() => useCanvasConnections(nodes));
        act(() => result.current.onConnect({
            source: 'ghost', target: 'scene-1', sourceHandle: null, targetHandle: null,
        }));
        expect(useNodeStore.getState().edges).toHaveLength(0);
    });

    it('is a no-op when no matching rule exists', () => {
        const nodes = makeNodes(['render-1', 'render'], ['metadata-1', 'metadata']);
        nodes.forEach((n) => useNodeStore.getState().addNode(n));
        const { result } = renderHook(() => useCanvasConnections(nodes));
        act(() => result.current.onConnect({
            source: 'render-1', target: 'metadata-1', sourceHandle: null, targetHandle: null,
        }));
        expect(useNodeStore.getState().edges).toHaveLength(0);
    });
});

// ============================================================================
// onConnect — scene_sequence one-to-one enforcement
// ============================================================================

describe('onConnect — scene_sequence one-to-one enforcement', () => {
    it('replaces an existing start_frame edge when a new one is connected', () => {
        const nodes = makeNodes(['scene-1', 'scene'], ['scene-2', 'scene'], ['scene-3', 'scene']);
        nodes.forEach((n) => useNodeStore.getState().addNode(n));
        const { result } = renderHook(() => useCanvasConnections(nodes));

        // Connect scene-1 → scene-2 first
        act(() => result.current.onConnect({
            source: 'scene-1', target: 'scene-2',
            sourceHandle: HANDLE_IDS.scene.source,
            targetHandle: HANDLE_IDS.scene.target,
        }));
        expect(useNodeStore.getState().edges).toHaveLength(1);

        // Connect scene-3 → scene-2 — should displace the old edge
        act(() => result.current.onConnect({
            source: 'scene-3', target: 'scene-2',
            sourceHandle: HANDLE_IDS.scene.source,
            targetHandle: HANDLE_IDS.scene.target,
        }));

        // Still only ONE start_frame incoming to scene-2
        const edges = useNodeStore.getState().edges;
        const startFrameEdges = edges.filter(
            (e) => e.target === 'scene-2' && e.targetHandle === HANDLE_IDS.scene.target,
        );
        expect(startFrameEdges).toHaveLength(1);
        expect(startFrameEdges[0].source).toBe('scene-3');
    });

    it('registers a pending-remove for the displaced edge', () => {
        const nodes = makeNodes(['scene-1', 'scene'], ['scene-2', 'scene'], ['scene-3', 'scene']);
        nodes.forEach((n) => useNodeStore.getState().addNode(n));
        const { result } = renderHook(() => useCanvasConnections(nodes));

        act(() => result.current.onConnect({
            source: 'scene-1', target: 'scene-2',
            sourceHandle: HANDLE_IDS.scene.source,
            targetHandle: HANDLE_IDS.scene.target,
        }));

        const firstEdgeId = useNodeStore.getState().edges[0].id;

        act(() => result.current.onConnect({
            source: 'scene-3', target: 'scene-2',
            sourceHandle: HANDLE_IDS.scene.source,
            targetHandle: HANDLE_IDS.scene.target,
        }));

        // The displaced edge should be registered as a pending-remove
        const changes = Array.from(useCanvasInteractionStore.getState().pendingChanges.values());
        const removeChange = changes.find((c) => c.edgeId === firstEdgeId && c.changeType === 'remove');
        expect(removeChange).toBeDefined();
    });
});

// ============================================================================
// markEdgePendingRemove
// ============================================================================

describe('markEdgePendingRemove', () => {
    it('marks a live edge as pending-remove', () => {
        // Create a live (non-pending) edge directly
        const liveEdge = NodeFactory.createEdge({
            sourceId: 'char-1', targetId: 'scene-1', type: 'character_in_scene',
        });
        useNodeStore.getState().addEdge(liveEdge);

        const nodes = makeNodes(['char-1', 'character'], ['scene-1', 'scene']);
        nodes.forEach((n) => useNodeStore.getState().addNode(n));
        const { result } = renderHook(() => useCanvasConnections(nodes));

        act(() => result.current.markEdgePendingRemove(liveEdge.id));

        const edge = useNodeStore.getState().edges.find((e) => e.id === liveEdge.id);
        expect(edge?.data?.pending).toBe(true);
        expect(edge?.data?.pendingType).toBe('remove');
    });

    it('registers the removal in useCanvasInteractionStore', () => {
        const liveEdge = NodeFactory.createEdge({
            sourceId: 'char-1', targetId: 'scene-1', type: 'character_in_scene',
        });
        useNodeStore.getState().addEdge(liveEdge);
        const nodes = makeNodes(['char-1', 'character'], ['scene-1', 'scene']);
        nodes.forEach((n) => useNodeStore.getState().addNode(n));
        const { result } = renderHook(() => useCanvasConnections(nodes));

        act(() => result.current.markEdgePendingRemove(liveEdge.id));

        expect(useCanvasInteractionStore.getState().pendingChanges.has(liveEdge.id)).toBe(true);
        expect(
            useCanvasInteractionStore.getState().pendingChanges.get(liveEdge.id)?.changeType,
        ).toBe('remove');
    });

    it('bumps pendingChangeCount on both nodes for a live edge removal', () => {
        const liveEdge = NodeFactory.createEdge({
            sourceId: 'char-1', targetId: 'scene-1', type: 'character_in_scene',
        });
        useNodeStore.getState().addEdge(liveEdge);
        const nodes = makeNodes(['char-1', 'character'], ['scene-1', 'scene']);
        nodes.forEach((n) => useNodeStore.getState().addNode(n));
        const { result } = renderHook(() => useCanvasConnections(nodes));

        act(() => result.current.markEdgePendingRemove(liveEdge.id));

        const storeNodes = useNodeStore.getState().nodes;
        expect(storeNodes.find((n) => n.id === 'char-1')!.data.pendingChangeCount).toBe(1);
        expect(storeNodes.find((n) => n.id === 'scene-1')!.data.pendingChangeCount).toBe(1);
    });

    it('outright deletes a pending-add edge instead of marking it pending-remove', () => {
        // Create a pending-add edge
        const pendingEdge = NodeFactory.createEdge({
            sourceId: 'char-1', targetId: 'scene-1', type: 'character_in_scene', pending: true,
        });
        useNodeStore.getState().addEdge(pendingEdge);
        // Register it as pending-add
        useCanvasInteractionStore.getState().addPendingChange({
            edgeId: pendingEdge.id, changeType: 'add',
            sourceId: 'char-1', targetId: 'scene-1',
            edgeType: 'character_in_scene', timestamp: Date.now(),
        });
        const nodes = makeNodes(['char-1', 'character'], ['scene-1', 'scene']);
        nodes.forEach((n) => useNodeStore.getState().addNode(n));
        // Give the nodes a count of 1 already
        useNodeStore.getState().updateNodeData('char-1', { pendingChangeCount: 1 });
        useNodeStore.getState().updateNodeData('scene-1', { pendingChangeCount: 1 });

        const { result } = renderHook(() => useCanvasConnections(nodes));

        act(() => result.current.markEdgePendingRemove(pendingEdge.id));

        // Edge should be completely removed
        expect(useNodeStore.getState().edges).toHaveLength(0);
        // Interaction store should no longer have this change
        expect(useCanvasInteractionStore.getState().pendingChanges.has(pendingEdge.id)).toBe(false);
        // Counts decremented
        const storeNodes = useNodeStore.getState().nodes;
        expect(storeNodes.find((n) => n.id === 'char-1')!.data.pendingChangeCount).toBe(0);
        expect(storeNodes.find((n) => n.id === 'scene-1')!.data.pendingChangeCount).toBe(0);
    });

    it('is a no-op for an unknown edge id', () => {
        const nodes = makeNodes(['char-1', 'character']);
        nodes.forEach((n) => useNodeStore.getState().addNode(n));
        const { result } = renderHook(() => useCanvasConnections(nodes));
        act(() => result.current.markEdgePendingRemove('ghost-edge'));
        // No side effects
        expect(useCanvasInteractionStore.getState().pendingChanges.size).toBe(0);
    });
});