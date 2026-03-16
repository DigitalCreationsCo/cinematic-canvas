// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { NodeFactory } from '../NodeFactory.js';
import type { CanvasNodeType } from '../NodeTypes.js';
import { EDGE_STYLES, PENDING_EDGE_STYLE, HANDLE_IDS } from '../NodeTypes';

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
      const edge = NodeFactory.createEdge({ sourceId: 'source-1', targetId: 'target-1', type: 'scene_sequence' });
      expect(edge.id).toBe('source-1__scene_sequence__target-1');
      expect(edge.source).toBe('source-1');
      expect(edge.target).toBe('target-1');
      expect(edge.type).toBe('scene_sequence');
    });

    it('attaches optional handles correctly', () => {
      const edge = NodeFactory.createEdge({ sourceId: 'src', targetId: 'tgt', type: 'scene_sequence' });
      expect(edge.sourceHandle).toBe(undefined);
      expect(edge.targetHandle).toBe(undefined);
    });
  });
});



// ============================================================================
// HELPERS
// ============================================================================

const baseNodeParams = {
  type: 'scene' as CanvasNodeType,
  entityId: 'entity-abc',
  contextId: 'project-123',
  contextType: 'project' as const,
  posCanvas: { x: 100, y: 200 },
  scope: 'project' as const,
};

// ============================================================================
// createNode
// ============================================================================

describe('NodeFactory.createNode', () => {
  it('sets node.id equal to entityId (O(1) lookup contract)', () => {
    const node = NodeFactory.createNode(baseNodeParams);
    expect(node.id).toBe(baseNodeParams.entityId);
  });

  it('sets node.type from params', () => {
    const node = NodeFactory.createNode(baseNodeParams);
    expect(node.type).toBe('scene');
  });

  it('sets node.position from posCanvas', () => {
    const node = NodeFactory.createNode(baseNodeParams);
    expect(node.position).toEqual({ x: 100, y: 200 });
  });

  it('includes entityId in data', () => {
    const node = NodeFactory.createNode(baseNodeParams);
    expect(node.data.entityId).toBe('entity-abc');
  });

  it('includes contextId in data', () => {
    const node = NodeFactory.createNode(baseNodeParams);
    expect(node.data.contextId).toBe('project-123');
  });

  it('includes contextType in data', () => {
    const node = NodeFactory.createNode(baseNodeParams);
    expect(node.data.contextType).toBe('project');
  });

  it('defaults isLocked to false', () => {
    const node = NodeFactory.createNode(baseNodeParams);
    expect(node.data.isLocked).toBe(false);
  });

  it('accepts explicit isLocked: true', () => {
    const node = NodeFactory.createNode({ ...baseNodeParams, isLocked: true });
    expect(node.data.isLocked).toBe(true);
  });

  it('defaults pipelineSelected to true', () => {
    const node = NodeFactory.createNode(baseNodeParams);
    expect(node.data.pipelineSelected).toBe(true);
  });

  it('accepts explicit pipelineSelected: false', () => {
    const node = NodeFactory.createNode({ ...baseNodeParams, pipelineSelected: false });
    expect(node.data.pipelineSelected).toBe(false);
  });

  it('defaults collapsed to false', () => {
    const node = NodeFactory.createNode(baseNodeParams);
    expect(node.data.collapsed).toBe(false);
  });

  it('defaults idxVersion to 1', () => {
    const node = NodeFactory.createNode(baseNodeParams);
    expect(node.data.idxVersion).toBe(1);
  });

  it('accepts explicit idxVersion', () => {
    const node = NodeFactory.createNode({ ...baseNodeParams, idxVersion: 7 });
    expect(node.data.idxVersion).toBe(7);
  });

  it('defaults pendingChangeCount to 0', () => {
    const node = NodeFactory.createNode(baseNodeParams);
    expect(node.data.pendingChangeCount).toBe(0);
  });

  it('accepts nodeTypeFlag for image nodes', () => {
    const node = NodeFactory.createNode({ ...baseNodeParams, type: 'image', nodeTypeFlag: 'style_reference' });
    expect(node.data.nodeTypeFlag).toBe('style_reference');
  });

  it('nodeTypeFlag is undefined when not provided', () => {
    const node = NodeFactory.createNode(baseNodeParams);
    expect(node.data.nodeTypeFlag).toBeUndefined();
  });

  it('accepts width and height', () => {
    const node = NodeFactory.createNode({ ...baseNodeParams, width: 320, height: 240 });
    expect(node.width).toBe(320);
    expect(node.height).toBe(240);
  });

  it('width/height are undefined when not provided', () => {
    const node = NodeFactory.createNode(baseNodeParams);
    expect(node.width).toBeUndefined();
    expect(node.height).toBeUndefined();
  });

  it('accepts world scope', () => {
    const node = NodeFactory.createNode({ ...baseNodeParams, scope: 'world', contextType: 'world' });
    expect(node.data.scope).toBe('world');
    expect(node.data.contextType).toBe('world');
  });

  it('works for all node types', () => {
    const types: CanvasNodeType[] = ['scene', 'character', 'location', 'image', 'composite', 'audio', 'metadata', 'render'];
    types.forEach((type) => {
      const node = NodeFactory.createNode({ ...baseNodeParams, type });
      expect(node.type).toBe(type);
    });
  });
});

// ============================================================================
// createEdge
// ============================================================================

describe('NodeFactory.createEdge', () => {
  const baseEdgeParams = {
    sourceId: 'scene-1',
    targetId: 'scene-2',
    type: 'scene_sequence' as const,
  };

  it('generates a deterministic id', () => {
    const edge = NodeFactory.createEdge(baseEdgeParams);
    expect(edge.id).toBe('scene-1__scene_sequence__scene-2');
  });

  it('sets source and target', () => {
    const edge = NodeFactory.createEdge(baseEdgeParams);
    expect(edge.source).toBe('scene-1');
    expect(edge.target).toBe('scene-2');
  });

  it('sets edge type', () => {
    const edge = NodeFactory.createEdge(baseEdgeParams);
    expect(edge.type).toBe('scene_sequence');
  });

  it('defaults animated to true', () => {
    const edge = NodeFactory.createEdge(baseEdgeParams);
    expect(edge.animated).toBe(true);
  });

  it('accepts explicit animated: true', () => {
    const edge = NodeFactory.createEdge({ ...baseEdgeParams, animated: true });
    expect(edge.animated).toBe(true);
  });

  it('uses EDGE_STYLES for a non-pending edge', () => {
    const edge = NodeFactory.createEdge(baseEdgeParams);
    expect(edge.style).toEqual(EDGE_STYLES.scene_sequence);
  });

  it('uses PENDING_EDGE_STYLE when pending: true', () => {
    const edge = NodeFactory.createEdge({ ...baseEdgeParams, pending: true });
    expect(edge.style).toEqual(PENDING_EDGE_STYLE);
  });

  it('sets data.pending = true when pending', () => {
    const edge = NodeFactory.createEdge({ ...baseEdgeParams, pending: true });
    expect(edge.data?.pending).toBe(true);
    expect(edge.data?.pendingType).toBe('add');
  });

  it('data is empty object for non-pending edge', () => {
    const edge = NodeFactory.createEdge(baseEdgeParams);
    expect(edge.data).toEqual({});
  });

  it('accepts sourceHandle and targetHandle', () => {
    const edge = NodeFactory.createEdge({
      ...baseEdgeParams,
      sourceHandle: HANDLE_IDS.scene.frameOutput,
      targetHandle: HANDLE_IDS.scene.frameInput,
    });
    expect(edge.sourceHandle).toBe(HANDLE_IDS.scene.frameOutput);
    expect(edge.targetHandle).toBe(HANDLE_IDS.scene.frameInput);
  });

  it('sourceHandle/targetHandle are undefined when not provided', () => {
    const edge = NodeFactory.createEdge(baseEdgeParams);
    expect(edge.sourceHandle).toBeUndefined();
    expect(edge.targetHandle).toBeUndefined();
  });

  it('works for all edge types and uses correct style', () => {
    const types = [
      'character_in_scene', 'location_in_scene', 'style_applied',
      'audio_sync', 'composite_input', 'composite_output', 'lore_context',
    ] as const;
    types.forEach((type) => {
      const edge = NodeFactory.createEdge({ sourceId: 'a', targetId: 'b', type });
      expect(edge.style).toEqual(EDGE_STYLES[type]);
    });
  });
});

// ============================================================================
// promoteEdge
// ============================================================================

describe('NodeFactory.promoteEdge', () => {
  it('clears pending flag', () => {
    const pendingEdge = NodeFactory.createEdge({
      sourceId: 's', targetId: 't', type: 'character_in_scene', pending: true,
    });
    const promoted = NodeFactory.promoteEdge(pendingEdge);
    expect(promoted.data?.pending).toBe(false);
  });

  it('clears pendingType', () => {
    const pendingEdge = NodeFactory.createEdge({
      sourceId: 's', targetId: 't', type: 'character_in_scene', pending: true,
    });
    const promoted = NodeFactory.promoteEdge(pendingEdge);
    expect(promoted.data?.pendingType).toBeUndefined();
  });

  it('sets style to the type-appropriate EDGE_STYLE', () => {
    const pendingEdge = NodeFactory.createEdge({
      sourceId: 's', targetId: 't', type: 'character_in_scene', pending: true,
    });
    const promoted = NodeFactory.promoteEdge(pendingEdge);
    expect(promoted.style).toEqual(EDGE_STYLES.character_in_scene);
  });

  it('preserves all other edge fields', () => {
    const pendingEdge = NodeFactory.createEdge({
      sourceId: 'src', targetId: 'tgt', type: 'location_in_scene', pending: true,
    });
    const promoted = NodeFactory.promoteEdge(pendingEdge);
    expect(promoted.id).toBe(pendingEdge.id);
    expect(promoted.source).toBe('src');
    expect(promoted.target).toBe('tgt');
    expect(promoted.type).toBe('location_in_scene');
  });

  it('handles promotion of a non-pending edge gracefully', () => {
    const liveEdge = NodeFactory.createEdge({
      sourceId: 's', targetId: 't', type: 'audio_sync',
    });
    const promoted = NodeFactory.promoteEdge(liveEdge);
    expect(promoted.style).toEqual(EDGE_STYLES.audio_sync);
    expect(promoted.data?.pending).toBe(false);
  });

  it('uses scene_sequence style fallback when type is undefined', () => {
    const edge = NodeFactory.createEdge({
      sourceId: 's', targetId: 't', type: 'scene_sequence',
    });
    // Manually strip type to test fallback
    const edgeNoType = { ...edge, type: undefined as any };
    const promoted = NodeFactory.promoteEdge(edgeNoType);
    expect(promoted.style).toEqual(EDGE_STYLES.scene_sequence);
  });
});

// ============================================================================
// getEdgeId
// ============================================================================

describe('NodeFactory.getEdgeId', () => {
  it('produces the deterministic format sourceId__type__targetId', () => {
    expect(NodeFactory.getEdgeId('A', 'B', 'audio_sync')).toBe('A__audio_sync__B');
  });

  it('is consistent with the id produced by createEdge', () => {
    const edge = NodeFactory.createEdge({ sourceId: 'X', targetId: 'Y', type: 'lore_context' });
    expect(edge.id).toBe(NodeFactory.getEdgeId('X', 'Y', 'lore_context'));
  });

  it('handles all edge types', () => {
    const types = [
      'scene_sequence', 'character_in_scene', 'location_in_scene',
      'style_applied', 'audio_sync', 'composite_input', 'composite_output', 'lore_context',
    ] as const;
    types.forEach((type) => {
      const id = NodeFactory.getEdgeId('src', 'tgt', type);
      expect(id).toBe(`src__${type}__tgt`);
    });
  });
});