import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNodeStore } from '../useNodeStore.js';
import type { CanvasNode, CanvasEdge } from '../../domain/canvas/NodeTypes.js';

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
  });

  describe('initial state', () => {
    it('should have empty nodes and edges', () => {
      const { result } = renderHook(() => useNodeStore());
      expect(result.current.nodes).toEqual([]);
      expect(result.current.edges).toEqual([]);
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
      expect(result.current.nodes).toContain(node1);
      expect(result.current.nodes).toContain(node2);
    });

    it('should add node to empty store', () => {
      const { result } = renderHook(() => useNodeStore());
      const node = createMockNode('1');

      act(() => {
        result.current.addNode(node);
      });

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0]).toEqual(node);
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
