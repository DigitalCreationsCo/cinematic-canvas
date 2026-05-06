import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#client/components/ui/alert-dialog.js";
import { useNodeStore } from "#client/store/useNodeStore.js";
import { useProjectStore } from "#client/store/useProjectStore.js";
import { useState } from "react";
import type { CanvasEdge } from "#client/domain/canvas/NodeTypes.js";
import type { CanvasNode } from "#client/domain/canvas/NodeTypes.js";

interface ConnectedEdgeInfo {
  edge: CanvasEdge;
  connectedNodeId: string;
  connectedNodeName: string;
  connectedNodeType: string | undefined;
}

function getConnectedEdgeInfo(
  edges: CanvasEdge[],
  nodeId: string,
  nodes: CanvasNode[],
  characters: Map<string, { name: string }>,
  locations: Map<string, { name: string }>,
  scenes: Map<string, { name: string }>,
): ConnectedEdgeInfo[] {
  return edges
    .filter((e) => e.source === nodeId || e.target === nodeId)
    .map((edge) => {
      const connectedNodeId = edge.source === nodeId ? edge.target : edge.source;
      const connectedNode = nodes.find((n) => n.id === connectedNodeId);

      let connectedNodeName = "Unknown";
      if (connectedNode) {
        const entityId = connectedNode.data.entityId;
        const char = characters.get(entityId);
        const loc = locations.get(entityId);
        const scene = scenes.get(entityId);

        if (char) connectedNodeName = char.name;
        else if (loc) connectedNodeName = loc.name;
        else if (scene) connectedNodeName = scene.name;
        else connectedNodeName = entityId;
      }

      return {
        edge,
        connectedNodeId,
        connectedNodeName,
        connectedNodeType: connectedNode?.type,
      };
    });
}

interface DeleteNodeConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: CanvasNode | null;
}

export function DeleteNodeConfirmationDialog({
  open,
  onOpenChange,
  node,
}: DeleteNodeConfirmationDialogProps) {
  const {
    edges,
    deleteNode,
    permanentlyDeleteNode,
    restoreNode,
    nodes,
    softDeletedNodes,
  } = useNodeStore();
  const { characters, locations, scenes, deleteCharacter, deleteLocation, deleteScene } =
    useProjectStore();
  const [isDeleting, setIsDeleting] = useState(false);

  if (!node) return null;

  const isAlreadyDeleted = softDeletedNodes.includes(node.id);

  const onRestorePreviouslyDeletedNode = () => {
    restoreNode(node.id);
    onOpenChange(false);
  };

  const connectedEdges = isAlreadyDeleted
    ? []
    : getConnectedEdgeInfo(edges, node.id, nodes, characters, locations, scenes);

  const nodeEntityId = node.data.entityId;
  const nodeName =
    characters.get(nodeEntityId)?.name ??
    locations.get(nodeEntityId)?.name ??
    scenes.get(nodeEntityId)?.name ??
    node.type;

  const handleSoftDelete = () => {
    deleteNode(node.id, true);
    onOpenChange(false);
  };

  const handlePermanentDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDeleting(true);
    try {
      await permanentlyDeleteNode(node.id);

      const nodeEntityId = node.data.entityId;
      if (node.type === "character") {
        deleteCharacter(nodeEntityId);
      } else if (node.type === "location") {
        deleteLocation(nodeEntityId);
      } else if (node.type === "scene") {
        deleteScene(nodeEntityId);
      }
    } catch (error) {
      console.error("Failed to permanently delete entity:", error);
    } finally {
      setIsDeleting(false);
      onOpenChange(false);
    }
  };

  const formatEdgeDescription = (info: ConnectedEdgeInfo): string => {
    const { connectedNodeName, connectedNodeType, edge } = info;

    if (edge.type === "scene_sequence") {
      if (edge.source === node.id) {
        return `${connectedNodeName} (Next Scene)`;
      } else {
        return `${connectedNodeName} (Previous Scene)`;
      }
    }

    switch (connectedNodeType) {
      case "character":
        return `${connectedNodeName} (Character)`;
      case "location":
        return `${connectedNodeName} (Location)`;
      case "scene":
        return `${connectedNodeName} (Scene)`;
      case "style":
        return `${connectedNodeName} (Style)`;
      case "audio":
        return `${connectedNodeName} (Audio)`;
      case "composite":
        if (edge.source === node.id) {
          return `${connectedNodeName} (Output)`;
        } else {
          return `${connectedNodeName} (Input)`;
        }
      default:
        return connectedNodeName;
    }
  };

  const canPermanentDelete =
    node.type === "scene" || node.type === "character" || node.type === "location";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {isAlreadyDeleted ? (
            <>
              <AlertDialogTitle>Restore "{nodeName}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This node was previously removed from the canvas. Would you like to
                restore it?
              </AlertDialogDescription>
            </>
          ) : (
            <>
              <AlertDialogTitle>Delete {nodeName}?</AlertDialogTitle>
              <AlertDialogDescription>
                {connectedEdges.length > 0 ? (
                  <>
                    This node has <strong>{connectedEdges.length}</strong> connection
                    {connectedEdges.length === 1 ? "" : "s"}. Deleting will also remove
                    all connected edges.
                    <br />
                    <br />
                    <strong>Connections that will be removed:</strong>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                      {connectedEdges.map((info) => (
                        <li key={info.edge.id}>{formatEdgeDescription(info)}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    Are you sure you want to remove this node from the canvas? The node
                    will be available in the asset panel and can be added back.
                  </>
                )}
              </AlertDialogDescription>
            </>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0">
          <AlertDialogCancel className="mt-0">Cancel</AlertDialogCancel>
          <div className="flex gap-2 w-full sm:w-auto">
            {isAlreadyDeleted ? (
              <AlertDialogAction
                onClick={onRestorePreviouslyDeletedNode}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                Restore to Canvas
              </AlertDialogAction>
            ) : (
              <>
                {canPermanentDelete && (
                  <AlertDialogAction
                    onClick={handlePermanentDelete}
                    disabled={isDeleting}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    {isDeleting ? "Deleting..." : "Delete Forever"}
                  </AlertDialogAction>
                )}
                <AlertDialogAction
                  onClick={handleSoftDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Remove from Canvas
                </AlertDialogAction>
              </>
            )}
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
