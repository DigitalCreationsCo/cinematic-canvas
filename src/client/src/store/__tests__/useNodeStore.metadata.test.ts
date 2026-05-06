import { describe, it, expect } from "vitest";
import { act } from "@testing-library/react";
import type { CanvasNode, CanvasEdge } from "#client/domain/canvas/NodeTypes.js";
import { NodeFactory } from "#client/domain/canvas/NodeFactory.js";
import { useNodeStore } from "#client/store/useNodeStore.js";

const makeNode = (id: string, type: CanvasNode["type"] = "scene"): CanvasNode => {
  return NodeFactory.createNode({
    type,
    entityId: id,
    contextId: "project-1",
    contextType: "project",
    posCanvas: { x: 0, y: 0 },
    scope: "project",
  }) as CanvasNode;
};

const makeEdge = (sourceId: string, targetId: string): CanvasEdge => {
  return NodeFactory.createEdge({
    sourceId,
    targetId,
    type: "character_in_scene",
  });
};

describe("useNodeStore - metadata node deletion protection", () => {
  describe("deleteNode protection for metadata nodes", () => {
    it("should NOT delete a metadata node", () => {
      const metadataNode = makeNode("metadata-1", "metadata");

      act(() => {
        useNodeStore.getState().setNodes([metadataNode]);
      });

      act(() => {
        useNodeStore.getState().deleteNode("metadata-1");
      });

      expect(useNodeStore.getState().nodes).toHaveLength(1);
      expect(useNodeStore.getState().nodes[0].id).toBe("metadata-1");
    });

    it("should NOT soft delete a metadata node", () => {
      const metadataNode = makeNode("metadata-1", "metadata");

      act(() => {
        useNodeStore.getState().setNodes([metadataNode]);
      });

      act(() => {
        useNodeStore.getState().deleteNode("metadata-1", true);
      });

      expect(useNodeStore.getState().nodes).toHaveLength(1);
      expect(useNodeStore.getState().softDeletedNodes).not.toContain("metadata-1");
    });

    it("should not add metadata node to softDeletedNodes when delete is attempted", () => {
      const metadataNode = makeNode("metadata-1", "metadata");

      act(() => {
        useNodeStore.getState().setNodes([metadataNode]);
      });

      act(() => {
        useNodeStore.getState().deleteNode("metadata-1", true);
      });

      expect(useNodeStore.getState().nodes).toHaveLength(1);
      expect(useNodeStore.getState().softDeletedNodes).not.toContain("metadata-1");
    });

    it("should still delete regular nodes when metadata nodes exist", () => {
      const metadataNode = makeNode("metadata-1", "metadata");
      const sceneNode = makeNode("scene-1", "scene");

      act(() => {
        useNodeStore.getState().setNodes([metadataNode, sceneNode]);
      });

      act(() => {
        useNodeStore.getState().deleteNode("scene-1");
      });

      expect(useNodeStore.getState().nodes).toHaveLength(1);
      expect(useNodeStore.getState().nodes[0].id).toBe("metadata-1");
    });

    it("should delete regular nodes even when metadata node deletion is attempted", () => {
      const metadataNode = makeNode("metadata-1", "metadata");
      const sceneNode = makeNode("scene-1", "scene");
      const edge = makeEdge("metadata-1", "scene-1");

      act(() => {
        useNodeStore.getState().setNodes([metadataNode, sceneNode]);
        useNodeStore.getState().setEdges([edge]);
      });

      act(() => {
        useNodeStore.getState().deleteNode("metadata-1");
      });

      act(() => {
        useNodeStore.getState().deleteNode("scene-1");
      });

      expect(useNodeStore.getState().nodes).toHaveLength(1);
      expect(useNodeStore.getState().nodes[0].id).toBe("metadata-1");
      expect(useNodeStore.getState().edges).toHaveLength(0);
    });

    it("should handle deleting non-existent node that looks like metadata", () => {
      const sceneNode = makeNode("scene-1", "scene");

      act(() => {
        useNodeStore.getState().setNodes([sceneNode]);
      });

      act(() => {
        useNodeStore.getState().deleteNode("metadata-fake");
      });

      expect(useNodeStore.getState().nodes).toHaveLength(1);
    });
  });
});
