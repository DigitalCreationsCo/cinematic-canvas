import { createMockEdge, createMockNode } from "#client/mocks/mock-node.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";

vi.mock("#client/store/useNodeStore.js", () => {
  let currentNodes: any[] = [];
  let currentEdges: any[] = [];
  let currentSoftDeleted: string[] = []; // Track soft deletes

  const mockHook = vi.fn(() => ({
    nodes: currentNodes,
    edges: currentEdges,
    softDeletedNodes: currentSoftDeleted,
    deleteNode: vi.fn((id: string) => {
      currentSoftDeleted = [...currentSoftDeleted, id]; // Implement logic
    }),
    permanentlyDeleteNode: vi.fn(),
    restoreNode: vi.fn(),
  }));

  return {
    useNodeStore: Object.assign(mockHook, {
      getState: vi.fn(() => ({
        setNodes: (nodes: any[]) => {
          currentNodes = nodes;
        },
        setEdges: (edges: any[]) => {
          currentEdges = edges;
        },
        get softDeletedNodes() {
          return currentSoftDeleted;
        }, // Use getter for live value
        set softDeletedNodes(val: string[]) {
          currentSoftDeleted = val;
        },
      })),
      subscribe: vi.fn(() => () => {}),
      setState: vi.fn(),
    }),
  };
});

vi.mock("#client/store/useProjectStore.js", () => ({
  useProjectStore: Object.assign(
    vi.fn(() => ({
      characters: new Map(),
      locations: new Map(),
      scenes: new Map(),
      deleteCharacter: vi.fn(),
      deleteLocation: vi.fn(),
      deleteScene: vi.fn(),
    })),
    {
      getState: vi.fn(() => ({
        characters: new Map(),
        locations: new Map(),
        scenes: new Map(),
      })),
      subscribe: vi.fn(() => () => {}),
      setState: vi.fn(),
    },
  ),
}));

import { DeleteNodeConfirmationDialog } from "#client/components/canvas/dialogs/DeleteNodeConfirmationDialog.js";
import { useNodeStore } from "#client/store/useNodeStore.js";

describe("DeleteNodeConfirmationDialog", () => {
  beforeEach(() => {
    useNodeStore.getState().setNodes([]);
    useNodeStore.getState().setEdges([]);
    useNodeStore.getState().softDeletedNodes = [];
  });

  it("should Render null when node is null", () => {
    const { container } = render(
      <DeleteNodeConfirmationDialog open={true} onOpenChange={() => {}} node={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("should Render dialog when open and node provided", () => {
    const node = createMockNode({ id: "scene-1" });

    render(
      <DeleteNodeConfirmationDialog open={true} onOpenChange={() => {}} node={node} />,
    );

    expect(screen.queryByText("Cancel")).toBeTruthy();
    expect(screen.queryByText("Remove from Canvas")).toBeTruthy();
  });

  it("should Show connected edges when node has edges", () => {
    const node1 = createMockNode({ id: "scene-1" });
    const node2 = createMockNode({ id: "scene-2" });
    const edge = createMockEdge("e1", "scene-1", "scene-2");

    useNodeStore.getState().setNodes([node1, node2]);
    useNodeStore.getState().setEdges([edge]);

    const { getByText } = render(
      <DeleteNodeConfirmationDialog open={true} onOpenChange={() => {}} node={node1} />,
    );

    expect(getByText("1")).toBeTruthy();
  });

  it("should Call deleteNode and onOpenChange on confirm", () => {
    const node = createMockNode({ id: "scene-1" });
    useNodeStore.getState().setNodes([node]);

    const onOpenChange = vi.fn();

    const { getByText } = render(
      <DeleteNodeConfirmationDialog
        open={true}
        onOpenChange={onOpenChange}
        node={node}
      />,
    );

    const deleteButton = getByText("Remove from Canvas");
    fireEvent.click(deleteButton);

    expect(useNodeStore.getState().softDeletedNodes).toContain("scene-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("should Call onOpenChange with false on cancel", () => {
    const node = createMockNode({ id: "scene-1" });
    useNodeStore.getState().setNodes([node]);

    const onOpenChange = vi.fn();

    const { getByText } = render(
      <DeleteNodeConfirmationDialog
        open={true}
        onOpenChange={onOpenChange}
        node={node}
      />,
    );

    const cancelButton = getByText("Cancel");
    fireEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("should Handle multiple connected edges", () => {
    const node1 = createMockNode({ id: "scene-1" });
    const node2 = createMockNode({ id: "scene-2" });
    const node3 = createMockNode({ id: "scene-3" });
    const edge1 = createMockEdge("e1", "scene-1", "scene-2");
    const edge2 = createMockEdge("e2", "scene-1", "scene-3");
    const edge3 = createMockEdge("e3", "scene-2", "scene-1");

    useNodeStore.getState().setNodes([node1, node2, node3]);
    useNodeStore.getState().setEdges([edge1, edge2, edge3]);

    render(
      <DeleteNodeConfirmationDialog open={true} onOpenChange={() => {}} node={node1} />,
    );

    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(/Connections that will be removed/i)).toBeTruthy();
  });

  it('should Show Delete "node name" in title', () => {
    const node = createMockNode({
      type: "scene",
      data: { entityId: "scene-1", name: "scene-1" },
    });
    useNodeStore.getState().setNodes([node]);

    const { getByText } = render(
      <DeleteNodeConfirmationDialog open={true} onOpenChange={() => {}} node={node} />,
    );

    expect(getByText(/Delete scene\?/)).toBeTruthy();
  });
});
