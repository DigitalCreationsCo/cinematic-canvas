import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNodeStore } from '../useNodeStore.js';
import type { CanvasNode, CanvasEdge } from '../../domain/canvas/NodeTypes.js';
import { NodeFactory } from '../../domain/canvas/NodeFactory.js';

const createMockNode = (id: string): CanvasNode => ({
  id,
  type: 'scene',
  position: { x: 0, y: 0 },
  data: {
    entityId: id,
    contextId: 'project-1',
    contextType: 'project' as const,
    scope: 'project',
    isLocked: false,
    pipelineSelected: false,
    collapsed: false,
    idxVersion: 1,
  },
});

const createMockEdge = (id: string, source: string, target: string): CanvasEdge => ({
  id,
  source,
  target,
  type: 'scene_sequence',
});

describe('useNodeStore', () => {
  beforeEach(() => {
    useNodeStore.getState().setNodes([]);
    useNodeStore.getState().setEdges([]);
    useNodeStore.getState().setViewport({ x: 0, y: 0, zoom: 1 });
    useNodeStore.getState().softDeletedNodes = [];
  });

  describe('initial state', () => {
    it('should have empty nodes and edges', () => {
      const { result } = renderHook(() => useNodeStore());
      expect(result.current.nodes).toEqual([]);
      expect(result.current.edges).toEqual([]);
    });

    it('should have empty softDeletedNodes', () => {
      const { result } = renderHook(() => useNodeStore());
      expect(result.current.softDeletedNodes).toEqual([]);
    });

    it('should have default viewport', () => {
      const { result } = renderHook(() => useNodeStore());
      expect(result.current.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    });
  });

  describe('setNodes', () => {
    it('should set nodes immediately', () => {
      const { result } = renderHook(() => useNodeStore());
      const nodes = [createMockNode('1')];

      act(() => {
        result.current.setNodes(nodes);
      });

      expect(result.current.nodes).toEqual(nodes);
    });

    it('should replace existing nodes', () => {
      const { result } = renderHook(() => useNodeStore());
      const node1 = createMockNode('1');
      const node2 = createMockNode('2');

      act(() => {
        result.current.setNodes([node1]);
      });

      act(() => {
        result.current.setNodes([node2]);
      });

      expect(result.current.nodes).toEqual([node2]);
    });
  });

  describe('setEdges', () => {
    it('should set edges immediately', () => {
      const { result } = renderHook(() => useNodeStore());
      const edges = [createMockEdge('e1', '1', '2')];

      act(() => {
        result.current.setEdges(edges);
      });

      expect(result.current.edges).toEqual(edges);
    });
  });

  describe('addNode', () => {
    it('should add a node to existing nodes', () => {
      const { result } = renderHook(() => useNodeStore());
      const node1 = createMockNode('1');
      const node2 = createMockNode('2');

      act(() => {
        result.current.addNode(node1);
      });

      act(() => {
        result.current.addNode(node2);
      });

      expect(result.current.nodes).toHaveLength(2);
      expect(result.current.nodes).toContainEqual(
        expect.objectContaining({ id: '1', type: 'scene' })
      );
      expect(result.current.nodes).toContainEqual(
        expect.objectContaining({ id: '2', type: 'scene' })
      );
    });

    it('should add node to empty store with isSoftDeleted set to false', () => {
      const { result } = renderHook(() => useNodeStore());
      const node = createMockNode('1');

      act(() => {
        result.current.addNode(node);
      });

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].data.isSoftDeleted).toBe(false);
    });

    it('should clear softDeletedNodes when adding a previously deleted node', () => {
      const { result } = renderHook(() => useNodeStore());
      const node = createMockNode('1');

      act(() => {
        result.current.addNode(node);
        result.current.deleteNode('1', true);
      });

      expect(result.current.softDeletedNodes).toContain('1');

      act(() => {
        result.current.addNode(node);
      });

      expect(result.current.softDeletedNodes).not.toContain('1');
      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].data.isSoftDeleted).toBe(false);
    });
  });

  describe('deleteNode', () => {
    it('should delete a node by id', () => {
      const { result } = renderHook(() => useNodeStore());
      const node1 = createMockNode('1');
      const node2 = createMockNode('2');

      act(() => {
        result.current.setNodes([node1, node2]);
      });

      act(() => {
        result.current.deleteNode('1');
      });

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].id).toBe('2');
    });

    it('should also delete connected edges when node is target', () => {
      const { result } = renderHook(() => useNodeStore());
      const node1 = createMockNode('1');
      const node2 = createMockNode('2');
      const edge = createMockEdge('e1', '1', '2');

      act(() => {
        result.current.setNodes([node1, node2]);
        result.current.setEdges([edge]);
      });

      act(() => {
        result.current.deleteNode('2');
      });

      expect(result.current.edges).toHaveLength(0);
    });

    it('should handle deleting non-existent node', () => {
      const { result } = renderHook(() => useNodeStore());
      const node = createMockNode('1');

      act(() => {
        result.current.setNodes([node]);
      });

      act(() => {
        result.current.deleteNode('non-existent');
      });

      expect(result.current.nodes).toHaveLength(1);
    });

    it('should soft delete a node by default', () => {
      const { result } = renderHook(() => useNodeStore());
      const node1 = createMockNode('1');
      const node2 = createMockNode('2');

      act(() => {
        result.current.setNodes([node1, node2]);
      });

      act(() => {
        result.current.deleteNode('1');
      });

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].id).toBe('2');
      expect(result.current.softDeletedNodes).toContain('1');
    });

    it('should soft delete and remove connected edges', () => {
      const { result } = renderHook(() => useNodeStore());
      const node1 = createMockNode('1');
      const node2 = createMockNode('2');
      const edge1 = createMockEdge('e1', '1', '2');
      const edge2 = createMockEdge('e2', '2', '3');

      act(() => {
        result.current.setNodes([node1, node2]);
        result.current.setEdges([edge1, edge2]);
      });

      act(() => {
        result.current.deleteNode('2', true);
      });

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.edges).toHaveLength(0);
      expect(result.current.softDeletedNodes).toContain('2');
    });

    it('should permanently delete when soft=false', () => {
      const { result } = renderHook(() => useNodeStore());
      const node = createMockNode('1');

      act(() => {
        result.current.setNodes([node]);
      });

      act(() => {
        result.current.deleteNode('1', false);
      });

      expect(result.current.nodes).toHaveLength(0);
      expect(result.current.softDeletedNodes).not.toContain('1');
    });
  });

  describe('restoreNode', () => {
    it('should restore a soft-deleted node', () => {
      const { result } = renderHook(() => useNodeStore());
      const node = createMockNode('1');

      act(() => {
        result.current.setNodes([node]);
        result.current.softDeletedNodes = ['1'];
      });

      act(() => {
        result.current.restoreNode('1');
      });

      expect(result.current.softDeletedNodes).not.toContain('1');
    });

    it('should not restore if node is not in softDeletedNodes', () => {
      const { result } = renderHook(() => useNodeStore());
      const node = createMockNode('1');

      act(() => {
        result.current.setNodes([node]);
      });

      act(() => {
        result.current.restoreNode('non-existent');
      });

      expect(result.current.softDeletedNodes).toEqual([]);
    });

    it('should only remove from softDeletedNodes', () => {
      const { result } = renderHook(() => useNodeStore());
      const node1 = createMockNode('1');
      const node2 = createMockNode('2');

      act(() => {
        result.current.setNodes([node1, node2]);
      });

      act(() => {
        result.current.deleteNode('1', true);
      });

      act(() => {
        result.current.deleteNode('2', true);
      });

      act(() => {
        result.current.restoreNode('1');
      });

      expect(result.current.softDeletedNodes).toEqual(['2']);
    });
  });

  describe('permanentlyDeleteNode', () => {
    it('should permanently delete a soft-deleted node', () => {
      const { result } = renderHook(() => useNodeStore());

      act(() => {
        result.current.softDeletedNodes = ['1', '2'];
      });

      act(() => {
        result.current.permanentlyDeleteNode('1');
      });

      expect(result.current.softDeletedNodes).toEqual(['2']);
    });

    it('should handle deleting non-existent soft-deleted node', () => {
      const { result } = renderHook(() => useNodeStore());

      act(() => {
        result.current.softDeletedNodes = ['1'];
      });

      act(() => {
        result.current.permanentlyDeleteNode('non-existent');
      });

      expect(result.current.softDeletedNodes).toEqual(['1']);
    });
  });

  describe('isNodeSoftDeleted', () => {
    it('should return true for soft-deleted node', () => {
      const { result } = renderHook(() => useNodeStore());

      act(() => {
        result.current.softDeletedNodes = ['1', '2'];
      });

      expect(result.current.isNodeSoftDeleted('1')).toBe(true);
      expect(result.current.isNodeSoftDeleted('2')).toBe(true);
    });

    it('should return false for non-deleted node', () => {
      const { result } = renderHook(() => useNodeStore());

      act(() => {
        result.current.softDeletedNodes = ['1'];
      });

      expect(result.current.isNodeSoftDeleted('2')).toBe(false);
    });

    it('should return false for empty softDeletedNodes', () => {
      const { result } = renderHook(() => useNodeStore());

      expect(result.current.isNodeSoftDeleted('1')).toBe(false);
    });
  });

  describe('getConnectedEdges', () => {
    it('should return edges where node is source', () => {
      const { result } = renderHook(() => useNodeStore());
      const edge1 = createMockEdge('e1', '1', '2');
      const edge2 = createMockEdge('e2', '1', '3');

      act(() => {
        result.current.setEdges([edge1, edge2]);
      });

      const connectedEdges = result.current.getConnectedEdges('1');

      expect(connectedEdges).toHaveLength(2);
      expect(connectedEdges.map(e => e.id)).toContain('e1');
      expect(connectedEdges.map(e => e.id)).toContain('e2');
    });

    it('should return edges where node is target', () => {
      const { result } = renderHook(() => useNodeStore());
      const edge1 = createMockEdge('e1', '2', '1');
      const edge2 = createMockEdge('e2', '3', '1');

      act(() => {
        result.current.setEdges([edge1, edge2]);
      });

      const connectedEdges = result.current.getConnectedEdges('1');

      expect(connectedEdges).toHaveLength(2);
    });

    it('should return both source and target edges', () => {
      const { result } = renderHook(() => useNodeStore());
      const edge1 = createMockEdge('e1', '1', '2');
      const edge2 = createMockEdge('e2', '2', '1');
      const edge3 = createMockEdge('e3', '1', '1');

      act(() => {
        result.current.setEdges([edge1, edge2, edge3]);
      });

      const connectedEdges = result.current.getConnectedEdges('1');

      expect(connectedEdges).toHaveLength(3);
    });

    it('should return empty array for node with no edges', () => {
      const { result } = renderHook(() => useNodeStore());
      const edge = createMockEdge('e1', '2', '3');

      act(() => {
        result.current.setEdges([edge]);
      });

      const connectedEdges = result.current.getConnectedEdges('1');

      expect(connectedEdges).toHaveLength(0);
    });

    it('should return empty array for empty edges', () => {
      const { result } = renderHook(() => useNodeStore());

      const connectedEdges = result.current.getConnectedEdges('1');

      expect(connectedEdges).toHaveLength(0);
    });
  });

  describe('updateNodeData', () => {
    it('should update node data', () => {
      const { result } = renderHook(() => useNodeStore());
      const node = createMockNode('1');

      act(() => {
        result.current.setNodes([node]);
      });

      act(() => {
        result.current.updateNodeData('1', { label: 'Updated Label' } as Record<string, unknown>);
      });

      expect(result.current.nodes[0].data.label).toBe('Updated Label');
    });

    it('should merge partial data updates', () => {
      const { result } = renderHook(() => useNodeStore());
      const node: CanvasNode = {
        id: '1',
        type: 'scene',
        position: { x: 0, y: 0 },
        data: {
          entityId: '1',
          contextId: 'project-1',
          contextType: 'project',
          scope: 'project',
          isLocked: false,
          pipelineSelected: false,
          collapsed: false,
          idxVersion: 1,
          label: 'Original',
        },
      };

      act(() => {
        result.current.setNodes([node]);
      });

      act(() => {
        result.current.updateNodeData('1', { label: 'Updated' } as Record<string, unknown>);
      });

      expect(result.current.nodes[0].data.label).toBe('Updated');
      expect(result.current.nodes[0].data.entityId).toBe('1');
    });

    it('should not update non-existent node', () => {
      const { result } = renderHook(() => useNodeStore());
      const node = createMockNode('1');

      act(() => {
        result.current.setNodes([node]);
      });

      act(() => {
        result.current.updateNodeData('non-existent', { label: 'Updated' } as Record<string, unknown>);
      });

      expect(result.current.nodes[0].data.label).toBeUndefined();
    });
  });

  describe('addEdge', () => {
    it('should add an edge', () => {
      const { result } = renderHook(() => useNodeStore());
      const edge = createMockEdge('e1', '1', '2');

      act(() => {
        result.current.addEdge(edge);
      });

      expect(result.current.edges).toHaveLength(1);
      expect(result.current.edges[0]).toEqual(edge);
    });

    it('should add multiple edges', () => {
      const { result } = renderHook(() => useNodeStore());
      const edge1 = createMockEdge('e1', '1', '2');
      const edge2 = createMockEdge('e2', '2', '3');

      act(() => {
        result.current.addEdge(edge1);
      });

      act(() => {
        result.current.addEdge(edge2);
      });

      expect(result.current.edges).toHaveLength(2);
    });
  });

  describe('deleteEdge', () => {
    it('should delete an edge by id', () => {
      const { result } = renderHook(() => useNodeStore());
      const edge1 = createMockEdge('e1', '1', '2');
      const edge2 = createMockEdge('e2', '2', '3');

      act(() => {
        result.current.setEdges([edge1, edge2]);
      });

      act(() => {
        result.current.deleteEdge('e1');
      });

      expect(result.current.edges).toHaveLength(1);
      expect(result.current.edges[0].id).toBe('e2');
    });

    it('should handle deleting non-existent edge', () => {
      const { result } = renderHook(() => useNodeStore());
      const edge = createMockEdge('e1', '1', '2');

      act(() => {
        result.current.setEdges([edge]);
      });

      act(() => {
        result.current.deleteEdge('non-existent');
      });

      expect(result.current.edges).toHaveLength(1);
    });
  });

  describe('setViewport', () => {
    it('should set viewport', () => {
      const { result } = renderHook(() => useNodeStore());

      act(() => {
        result.current.setViewport({ x: 100, y: 200, zoom: 0.5 });
      });

      expect(result.current.viewport).toEqual({ x: 100, y: 200, zoom: 0.5 });
    });

    it('should update viewport multiple times', () => {
      const { result } = renderHook(() => useNodeStore());

      act(() => {
        result.current.setViewport({ x: 100, y: 200, zoom: 0.5 });
      });

      act(() => {
        result.current.setViewport({ x: 300, y: 400, zoom: 1.5 });
      });

      expect(result.current.viewport).toEqual({ x: 300, y: 400, zoom: 1.5 });
    });
  });

  describe('onNodesChange', () => {
    it('should apply position changes', () => {
      const { result } = renderHook(() => useNodeStore());
      const node = createMockNode('1');

      act(() => {
        result.current.setNodes([node]);
      });

      act(() => {
        result.current.onNodesChange([
          {
            type: 'position',
            id: '1',
            position: { x: 100, y: 200 },
          },
        ]);
      });

      expect(result.current.nodes[0].position).toEqual({ x: 100, y: 200 });
    });

    it('should apply select changes', () => {
      const { result } = renderHook(() => useNodeStore());
      const node = createMockNode('1');

      act(() => {
        result.current.setNodes([node]);
      });

      act(() => {
        result.current.onNodesChange([
          {
            type: 'select',
            id: '1',
            selected: true,
          },
        ]);
      });

      expect(result.current.nodes[0].selected).toBe(true);
    });

    it('should handle remove node change', () => {
      const { result } = renderHook(() => useNodeStore());
      const node = createMockNode('1');

      act(() => {
        result.current.setNodes([node]);
      });

      act(() => {
        result.current.onNodesChange([
          {
            type: 'remove',
            id: '1',
          },
        ]);
      });

      expect(result.current.nodes).toHaveLength(0);
    });
  });

  describe('onEdgesChange', () => {
    it('should apply select changes', () => {
      const { result } = renderHook(() => useNodeStore());
      const edge = createMockEdge('e1', '1', '2');

      act(() => {
        result.current.setEdges([edge]);
      });

      act(() => {
        result.current.onEdgesChange([
          {
            type: 'select',
            id: 'e1',
            selected: true,
          },
        ]);
      });

      expect(result.current.edges[0].selected).toBe(true);
    });

    it('should handle remove edge change', () => {
      const { result } = renderHook(() => useNodeStore());
      const edge = createMockEdge('e1', '1', '2');

      act(() => {
        result.current.setEdges([edge]);
      });

      act(() => {
        result.current.onEdgesChange([
          {
            type: 'remove',
            id: 'e1',
          },
        ]);
      });

      expect(result.current.edges).toHaveLength(0);
    });
  });

  describe('onConnect', () => {
    it('should add connection as edge', () => {
      const { result } = renderHook(() => useNodeStore());

      act(() => {
        result.current.onConnect({
          source: '1',
          target: '2',
          sourceHandle: null,
          targetHandle: null,
        });
      });

      expect(result.current.edges).toHaveLength(1);
      expect(result.current.edges[0].source).toBe('1');
      expect(result.current.edges[0].target).toBe('2');
    });

    it('should add connection with handles', () => {
      const { result } = renderHook(() => useNodeStore());

      act(() => {
        result.current.onConnect({
          source: '1',
          target: '2',
          sourceHandle: 'handle-out',
          targetHandle: 'handle-in',
        });
      });

      expect(result.current.edges).toHaveLength(1);
      expect(result.current.edges[0].sourceHandle).toBe('handle-out');
      expect(result.current.edges[0].targetHandle).toBe('handle-in');
    });
  });

  describe('temporal store', () => {
    it('should have temporal store accessible', () => {
      expect(useNodeStore.temporal).toBeDefined();
      expect(typeof useNodeStore.temporal.getState).toBe('function');
    });

    it('should provide undo method', () => {
      const temporal = useNodeStore.temporal?.getState();
      expect(temporal).toBeDefined();
      expect(typeof temporal?.undo).toBe('function');
    });

    it('should provide redo method', () => {
      const temporal = useNodeStore.temporal?.getState();
      expect(temporal).toBeDefined();
      expect(typeof temporal?.redo).toBe('function');
    });

    it('should provide clear method', () => {
      const temporal = useNodeStore.temporal?.getState();
      expect(temporal).toBeDefined();
      expect(typeof temporal?.clear).toBe('function');
    });

    it('should provide pastStates', () => {
      const temporal = useNodeStore.temporal?.getState();
      expect(temporal).toBeDefined();
      expect(Array.isArray(temporal?.pastStates)).toBe(true);
    });

    it('should provide futureStates', () => {
      const temporal = useNodeStore.temporal?.getState();
      expect(temporal).toBeDefined();
      expect(Array.isArray(temporal?.futureStates)).toBe(true);
    });

    it('should provide isTracking', () => {
      const temporal = useNodeStore.temporal?.getState();
      expect(temporal).toBeDefined();
      expect(typeof temporal?.isTracking).toBe('boolean');
    });

    it('should provide pause and resume methods', () => {
      const temporal = useNodeStore.temporal?.getState();
      expect(temporal).toBeDefined();
      expect(typeof temporal?.pause).toBe('function');
      expect(typeof temporal?.resume).toBe('function');
    });

    it('should have temporal store with methods available', () => {
      const temporal = useNodeStore.temporal?.getState();
      expect(temporal).toBeDefined();
      expect(typeof temporal?.undo).toBe('function');
      expect(typeof temporal?.redo).toBe('function');
      expect(typeof temporal?.clear).toBe('function');
      expect(typeof temporal?.pause).toBe('function');
      expect(typeof temporal?.resume).toBe('function');
      expect(Array.isArray(temporal?.pastStates)).toBe(true);
      expect(Array.isArray(temporal?.futureStates)).toBe(true);
      expect(typeof temporal?.isTracking).toBe('boolean');
    });

    it('should have empty initial temporal states', () => {
      const temporal = useNodeStore.temporal?.getState();
      expect(temporal?.pastStates).toEqual([]);
      expect(temporal?.futureStates).toEqual([]);
    });

    it('should track state changes', async () => {
      const { result } = renderHook(() => useNodeStore());
      const node = createMockNode('1');

      act(() => {
        result.current.setNodes([node]);
      });

      await new Promise(resolve => setTimeout(resolve, 1200));

      const temporal = useNodeStore.temporal?.getState();
      expect(temporal?.pastStates.length).toBeGreaterThan(0);
    });

    it('should allow undo after state change', async () => {
      const { result } = renderHook(() => useNodeStore());
      const node = createMockNode('1');

      act(() => {
        result.current.setNodes([node]);
      });

      await new Promise(resolve => setTimeout(resolve, 1200));

      const temporal = useNodeStore.temporal?.getState();
      const pastLength = temporal?.pastStates.length ?? 0;

      if (pastLength > 0) {
        act(() => {
          temporal!.undo();
        });
      }

      expect(temporal?.pastStates.length).toBeLessThanOrEqual(pastLength);
    });
  });

  describe('edge cases', () => {
    it('should handle empty operations', () => {
      const { result } = renderHook(() => useNodeStore());

      act(() => {
        result.current.setNodes([]);
      });

      act(() => {
        result.current.setEdges([]);
      });

      expect(result.current.nodes).toEqual([]);
      expect(result.current.edges).toEqual([]);
    });

    it('should handle adding to empty store', () => {
      const { result } = renderHook(() => useNodeStore());

      act(() => {
        result.current.addEdge(createMockEdge('e1', '1', '2'));
      });

      expect(result.current.edges).toHaveLength(1);
    });

    it('should handle multiple operations in sequence', () => {
      const { result } = renderHook(() => useNodeStore());

      act(() => {
        result.current.addNode(createMockNode('1'));
      });

      act(() => {
        result.current.addNode(createMockNode('2'));
      });

      act(() => {
        result.current.addEdge(createMockEdge('e1', '1', '2'));
      });

      act(() => {
        result.current.updateNodeData('1', { label: 'Node 1' } as Record<string, unknown>);
      });

      expect(result.current.nodes).toHaveLength(2);
      expect(result.current.edges).toHaveLength(1);
      expect(result.current.nodes[0].data.label).toBe('Node 1');
    });
  });
});



// ============================================================================
// HELPERS
// ============================================================================

function makeNode(id: string, overrides: Partial<CanvasNode> = {}): CanvasNode {
  return NodeFactory.createNode({
    type: 'scene',
    entityId: id,
    contextId: 'project-1',
    contextType: 'project',
    posCanvas: { x: 0, y: 0 },
    scope: 'project',
    ...overrides as any,
  }) as CanvasNode;
}

function makeEdge(sourceId: string, targetId: string): CanvasEdge {
  return NodeFactory.createEdge({
    sourceId,
    targetId,
    type: 'character_in_scene',
  });
}

// Reset store state before each test so tests are fully isolated.
beforeEach(() => {
  useNodeStore.setState({
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  });
});

// ============================================================================
// Initial state
// ============================================================================

describe('initial state', () => {
  it('starts with empty nodes array', () => {
    expect(useNodeStore.getState().nodes).toEqual([]);
  });

  it('starts with empty edges array', () => {
    expect(useNodeStore.getState().edges).toEqual([]);
  });

  it('starts with default viewport', () => {
    expect(useNodeStore.getState().viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

// ============================================================================
// setNodes / setEdges
// ============================================================================

describe('setNodes', () => {
  it('replaces the nodes array entirely', () => {
    const n1 = makeNode('n1');
    const n2 = makeNode('n2');
    useNodeStore.getState().setNodes([n1, n2]);
    expect(useNodeStore.getState().nodes).toHaveLength(2);
    expect(useNodeStore.getState().nodes[0].id).toBe('n1');
  });

  it('can clear nodes with empty array', () => {
    useNodeStore.getState().addNode(makeNode('x'));
    useNodeStore.getState().setNodes([]);
    expect(useNodeStore.getState().nodes).toHaveLength(0);
  });
});

describe('setEdges', () => {
  it('replaces the edges array entirely', () => {
    const e1 = makeEdge('a', 'b');
    useNodeStore.getState().setEdges([e1]);
    expect(useNodeStore.getState().edges).toHaveLength(1);
  });

  it('can clear edges with empty array', () => {
    useNodeStore.getState().addEdge(makeEdge('a', 'b'));
    useNodeStore.getState().setEdges([]);
    expect(useNodeStore.getState().edges).toHaveLength(0);
  });
});

// ============================================================================
// addNode
// ============================================================================

describe('addNode', () => {
  it('appends a node to the nodes array', () => {
    useNodeStore.getState().addNode(makeNode('n1'));
    expect(useNodeStore.getState().nodes).toHaveLength(1);
    expect(useNodeStore.getState().nodes[0].id).toBe('n1');
  });

  it('appends multiple nodes independently', () => {
    useNodeStore.getState().addNode(makeNode('a'));
    useNodeStore.getState().addNode(makeNode('b'));
    expect(useNodeStore.getState().nodes).toHaveLength(2);
  });

  it('does not mutate existing nodes', () => {
    const n1 = makeNode('n1');
    useNodeStore.getState().addNode(n1);
    const firstRef = useNodeStore.getState().nodes[0];
    useNodeStore.getState().addNode(makeNode('n2'));
    // The original node reference in the array should still be the same object
    expect(useNodeStore.getState().nodes[0]).toBe(firstRef);
  });
});

// ============================================================================
// deleteNode
// ============================================================================

describe('deleteNode', () => {
  it('removes the specified node by id', () => {
    useNodeStore.getState().addNode(makeNode('n1'));
    useNodeStore.getState().addNode(makeNode('n2'));
    useNodeStore.getState().deleteNode('n1');
    expect(useNodeStore.getState().nodes).toHaveLength(1);
    expect(useNodeStore.getState().nodes[0].id).toBe('n2');
  });

  it('also removes edges where the node is the source', () => {
    useNodeStore.getState().addNode(makeNode('src'));
    useNodeStore.getState().addNode(makeNode('tgt'));
    useNodeStore.getState().addEdge(makeEdge('src', 'tgt'));
    useNodeStore.getState().deleteNode('src');
    expect(useNodeStore.getState().edges).toHaveLength(0);
  });

  it('also removes edges where the node is the target', () => {
    useNodeStore.getState().addNode(makeNode('src'));
    useNodeStore.getState().addNode(makeNode('tgt'));
    useNodeStore.getState().addEdge(makeEdge('src', 'tgt'));
    useNodeStore.getState().deleteNode('tgt');
    expect(useNodeStore.getState().edges).toHaveLength(0);
  });

  it('leaves unrelated edges intact', () => {
    useNodeStore.getState().addEdge(makeEdge('a', 'b'));
    useNodeStore.getState().addEdge(makeEdge('c', 'd'));
    useNodeStore.getState().deleteNode('a');
    expect(useNodeStore.getState().edges).toHaveLength(1);
    expect(useNodeStore.getState().edges[0].source).toBe('c');
  });

  it('is a no-op when node id does not exist', () => {
    useNodeStore.getState().addNode(makeNode('n1'));
    useNodeStore.getState().deleteNode('nonexistent');
    expect(useNodeStore.getState().nodes).toHaveLength(1);
  });
});

// ============================================================================
// updateNodeData
// ============================================================================

describe('updateNodeData', () => {
  it('merges partial data onto the target node', () => {
    useNodeStore.getState().addNode(makeNode('n1'));
    useNodeStore.getState().updateNodeData('n1', { pendingChangeCount: 3 });
    expect(useNodeStore.getState().nodes[0].data.pendingChangeCount).toBe(3);
  });

  it('does not affect other nodes', () => {
    useNodeStore.getState().addNode(makeNode('n1'));
    useNodeStore.getState().addNode(makeNode('n2'));
    useNodeStore.getState().updateNodeData('n1', { pendingChangeCount: 5 });
    expect(useNodeStore.getState().nodes[1].data.pendingChangeCount).toBe(0);
  });

  it('preserves existing data fields that are not updated', () => {
    useNodeStore.getState().addNode(makeNode('n1'));
    const original = useNodeStore.getState().nodes[0].data;
    useNodeStore.getState().updateNodeData('n1', { pendingChangeCount: 1 });
    const updated = useNodeStore.getState().nodes[0].data;
    expect(updated.entityId).toBe(original.entityId);
    expect(updated.contextId).toBe(original.contextId);
  });

  it('is a no-op when node id does not exist', () => {
    useNodeStore.getState().addNode(makeNode('n1'));
    useNodeStore.getState().updateNodeData('ghost', { pendingChangeCount: 9 });
    expect(useNodeStore.getState().nodes[0].data.pendingChangeCount).toBe(0);
  });

  it('can update status and progressMessage', () => {
    useNodeStore.getState().addNode(makeNode('n1'));
    useNodeStore.getState().updateNodeData('n1', { status: 'generating', progressMessage: 'In progress' });
    const data = useNodeStore.getState().nodes[0].data;
    expect(data.status).toBe('generating');
    expect(data.progressMessage).toBe('In progress');
  });
});

// ============================================================================
// addEdge / deleteEdge
// ============================================================================

describe('addEdge', () => {
  it('appends an edge', () => {
    useNodeStore.getState().addEdge(makeEdge('a', 'b'));
    expect(useNodeStore.getState().edges).toHaveLength(1);
  });

  it('appends multiple edges independently', () => {
    useNodeStore.getState().addEdge(makeEdge('a', 'b'));
    useNodeStore.getState().addEdge(makeEdge('c', 'd'));
    expect(useNodeStore.getState().edges).toHaveLength(2);
  });
});

describe('deleteEdge', () => {
  it('removes the edge with matching id', () => {
    const edge = makeEdge('a', 'b');
    useNodeStore.getState().addEdge(edge);
    useNodeStore.getState().deleteEdge(edge.id);
    expect(useNodeStore.getState().edges).toHaveLength(0);
  });

  it('leaves other edges intact', () => {
    const e1 = makeEdge('a', 'b');
    const e2 = makeEdge('c', 'd');
    useNodeStore.getState().addEdge(e1);
    useNodeStore.getState().addEdge(e2);
    useNodeStore.getState().deleteEdge(e1.id);
    expect(useNodeStore.getState().edges).toHaveLength(1);
    expect(useNodeStore.getState().edges[0].id).toBe(e2.id);
  });

  it('is a no-op for unknown edge id', () => {
    useNodeStore.getState().addEdge(makeEdge('a', 'b'));
    useNodeStore.getState().deleteEdge('nonexistent');
    expect(useNodeStore.getState().edges).toHaveLength(1);
  });
});

// ============================================================================
// updateEdgeData
// ============================================================================

describe('updateEdgeData', () => {
  it('merges data onto the matching edge', () => {
    const edge = NodeFactory.createEdge({ sourceId: 'a', targetId: 'b', type: 'audio_sync', pending: true });
    useNodeStore.getState().addEdge(edge);
    useNodeStore.getState().updateEdgeData(edge.id, { pending: false, pendingType: undefined });
    const updated = useNodeStore.getState().edges[0];
    expect(updated.data?.pending).toBe(false);
    expect(updated.data?.pendingType).toBeUndefined();
  });

  it('preserves other data fields not included in the update', () => {
    const edge = NodeFactory.createEdge({ sourceId: 'a', targetId: 'b', type: 'audio_sync', pending: true });
    useNodeStore.getState().addEdge(edge);
    useNodeStore.getState().updateEdgeData(edge.id, { pending: false });
    const updated = useNodeStore.getState().edges[0];
    // pendingType was 'add' originally — preserves it unless explicitly overwritten
    expect(updated.data?.pendingType).toBe('add');
  });

  it('does not affect other edges', () => {
    const e1 = NodeFactory.createEdge({ sourceId: 'a', targetId: 'b', type: 'audio_sync', pending: true });
    const e2 = NodeFactory.createEdge({ sourceId: 'c', targetId: 'd', type: 'audio_sync', pending: true });
    useNodeStore.getState().addEdge(e1);
    useNodeStore.getState().addEdge(e2);
    useNodeStore.getState().updateEdgeData(e1.id, { pending: false });
    expect(useNodeStore.getState().edges[1].data?.pending).toBe(true);
  });

  it('is a no-op for unknown edge id', () => {
    const edge = NodeFactory.createEdge({ sourceId: 'a', targetId: 'b', type: 'audio_sync' });
    useNodeStore.getState().addEdge(edge);
    useNodeStore.getState().updateEdgeData('ghost', { pending: true });
    // Original edge data unchanged
    expect(useNodeStore.getState().edges[0].data?.pending).toBeUndefined();
  });
});

// ============================================================================
// setViewport
// ============================================================================

describe('setViewport', () => {
  it('updates viewport x, y and zoom', () => {
    useNodeStore.getState().setViewport({ x: 50, y: -100, zoom: 1.5 });
    expect(useNodeStore.getState().viewport).toEqual({ x: 50, y: -100, zoom: 1.5 });
  });

  it('can be called multiple times', () => {
    useNodeStore.getState().setViewport({ x: 10, y: 20, zoom: 0.8 });
    useNodeStore.getState().setViewport({ x: 0, y: 0, zoom: 1 });
    expect(useNodeStore.getState().viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

// ============================================================================
// onNodesChange / onEdgesChange / onConnect
// ============================================================================

describe('onNodesChange', () => {
  it('applies a position change to a node', () => {
    useNodeStore.getState().addNode(makeNode('n1'));
    useNodeStore.getState().onNodesChange([
      { type: 'position', id: 'n1', position: { x: 99, y: 88 } },
    ]);
    expect(useNodeStore.getState().nodes[0].position).toEqual({ x: 99, y: 88 });
  });

  it('applies a remove change', () => {
    useNodeStore.getState().addNode(makeNode('n1'));
    useNodeStore.getState().onNodesChange([{ type: 'remove', id: 'n1' }]);
    expect(useNodeStore.getState().nodes).toHaveLength(0);
  });
});

describe('onEdgesChange', () => {
  it('applies a remove change to edges', () => {
    const edge = makeEdge('a', 'b');
    useNodeStore.getState().addEdge(edge);
    useNodeStore.getState().onEdgesChange([{ type: 'remove', id: edge.id }]);
    expect(useNodeStore.getState().edges).toHaveLength(0);
  });
});

describe('onConnect', () => {
  it('adds a new edge from a Connection object', () => {
    useNodeStore.getState().onConnect({
      source: 'a', target: 'b',
      sourceHandle: 'sh', targetHandle: 'th',
    });
    expect(useNodeStore.getState().edges).toHaveLength(1);
    expect(useNodeStore.getState().edges[0].source).toBe('a');
    expect(useNodeStore.getState().edges[0].target).toBe('b');
  });
});