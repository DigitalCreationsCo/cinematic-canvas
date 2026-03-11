// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { NodeFactory } from '../NodeFactory.js';
import type { CanvasNodeType } from '../NodeTypes.js';

describe('NodeFactory', () => {
  describe('createNode', () => {
    it('generates a valid node shape with correct ID and data payload', () => {
      const node = NodeFactory.createNode({
        type: 'character',
        entityId: 'char-123',
        contextId: 'proj-1',
        contextType: 'project',
        posCanvas: { x: 100, y: 200 },
        scope: 'project'
      });

      expect(node.id).toBe('char-123');
      expect(node.type).toBe('character');
      expect(node.position).toEqual({ x: 100, y: 200 });
      expect(node.data).toEqual({
        entityId: 'char-123',
        contextId: 'proj-1',
        contextType: 'project',
        nodeTypeFlag: undefined,
        scope: 'project',
        isLocked: false,
        pipelineSelected: true,
        collapsed: false,
        idxVersion: 1
      });
    });

    it('creates locked nodes if scope is world but context is project', () => {
      const node = NodeFactory.createNode({
        type: 'location',
        entityId: 'loc-1',
        contextId: 'proj-1',
        contextType: 'project',
        posCanvas: { x: 0, y: 0 },
        scope: 'world',
        isLocked: true,
      });

      expect(node.data.isLocked).toBe(true);
    });
  });

  describe('createEdge', () => {
    it('generates deterministic edge IDs', () => {
      const edge = NodeFactory.createEdge({sourceId: 'source-1', targetId: 'target-1', type: 'default'});
      expect(edge.id).toBe('source-1__default__target-1');
      expect(edge.source).toBe('source-1');
      expect(edge.target).toBe('target-1');
      expect(edge.type).toBe('default');
    });

    it('attaches optional handles correctly', () => {
      const edge = NodeFactory.createEdge({sourceId: 'src', targetId: 'tgt', type: 'default'});
      expect(edge.sourceHandle).toBe(undefined);
      expect(edge.targetHandle).toBe(undefined);
    });
  });
});
