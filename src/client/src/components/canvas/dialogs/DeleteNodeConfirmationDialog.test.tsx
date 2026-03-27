import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { DeleteNodeConfirmationDialog } from './DeleteNodeConfirmationDialog.js';
import { useNodeStore } from '#/store/useNodeStore.js';
import type { CanvasNode, CanvasEdge } from '#/domain/canvas/NodeTypes.js';

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

vi.mock('#/store/useProjectStore.js', () => ({
  useProjectStore: vi.fn(() => ({
    characters: new Map(),
    locations: new Map(),
    scenes: new Map(),
  })),
}));

describe('DeleteNodeConfirmationDialog', () => {
  beforeEach(() => {
    useNodeStore.getState().setNodes([]);
    useNodeStore.getState().setEdges([]);
    useNodeStore.getState().softDeletedNodes = [];
  });

  it('should Render null when node is null', () => {
    const { container } = render(
      <DeleteNodeConfirmationDialog
        open={true}
        onOpenChange={() => {}}
        node={null}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should Render dialog when open and node provided', () => {
    const node = createMockNode('scene-1');
    
    render(
      <DeleteNodeConfirmationDialog
        open={true}
        onOpenChange={() => {}}
        node={node}
      />
    );

    expect(screen.queryByText('Cancel')).toBeTruthy();
    expect(screen.queryByText('Remove from Canvas')).toBeTruthy();
  });

  it('should Show connected edges when node has edges', () => {
    const node1 = createMockNode('scene-1');
    const node2 = createMockNode('scene-2');
    const edge = createMockEdge('e1', 'scene-1', 'scene-2');

    useNodeStore.getState().setNodes([node1, node2]);
    useNodeStore.getState().setEdges([edge]);

    const { getByText } = render(
      <DeleteNodeConfirmationDialog
        open={true}
        onOpenChange={() => {}}
        node={node1}
      />
    );

    expect(getByText('1')).toBeTruthy();
  });

  it('should Call deleteNode and onOpenChange on confirm', () => {
    const node = createMockNode('scene-1');
    useNodeStore.getState().setNodes([node]);

    const onOpenChange = vi.fn();
    
    const { getByText } = render(
      <DeleteNodeConfirmationDialog
        open={true}
        onOpenChange={onOpenChange}
        node={node}
      />
    );

    const deleteButton = getByText('Remove from Canvas');
    fireEvent.click(deleteButton);

    expect(useNodeStore.getState().softDeletedNodes).toContain('scene-1');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('should Call onOpenChange with false on cancel', () => {
    const node = createMockNode('scene-1');
    useNodeStore.getState().setNodes([node]);

    const onOpenChange = vi.fn();
    
    const { getByText } = render(
      <DeleteNodeConfirmationDialog
        open={true}
        onOpenChange={onOpenChange}
        node={node}
      />
    );

    const cancelButton = getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('should Handle multiple connected edges', () => {
    const node1 = createMockNode('scene-1');
    const node2 = createMockNode('scene-2');
    const node3 = createMockNode('scene-3');
    const edge1 = createMockEdge('e1', 'scene-1', 'scene-2');
    const edge2 = createMockEdge('e2', 'scene-1', 'scene-3');
    const edge3 = createMockEdge('e3', 'scene-2', 'scene-1');

    useNodeStore.getState().setNodes([node1, node2, node3]);
    useNodeStore.getState().setEdges([edge1, edge2, edge3]);

    const { getByText } = render(
      <DeleteNodeConfirmationDialog
        open={true}
        onOpenChange={() => {}}
        node={node1}
      />
    );

    expect(getByText('3')).toBeTruthy();
  });

  it('should Show Delete "node name" in title', () => {
    const node = createMockNode('scene-1');
    useNodeStore.getState().setNodes([node]);

    const { getByText } = render(
      <DeleteNodeConfirmationDialog
        open={true}
        onOpenChange={() => {}}
        node={node}
      />
    );

    expect(getByText(/Delete "scene-1"\?/)).toBeTruthy();
  });
});
