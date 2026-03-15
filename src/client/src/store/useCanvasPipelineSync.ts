// src/client/src/hooks/useCanvasPipelineSync.ts
//
// Bridges the SSE pipeline event stores → ReactFlow canvas (useNodeStore).
//
// WHY THIS EXISTS:
//   use-pipeline-events.ts handles the SSE transport layer and writes to
//   useProjectStore / usePipelineStore / useCanvasUIStore. It knows nothing
//   about the canvas. This hook is the single place that translates those
//   store mutations into canvas node/edge operations.
//
// DESIGN:
//   - Pure store subscriptions (no React renders triggered here).
//   - Uses reference equality checks to skip processing when Maps haven't changed.
//   - All node creation delegates to NodeFactory — never inline.
//   - spawnedIds Set provides O(1) idempotency across all subscribe callbacks.
//   - Status sync keeps node.data in step with ProjectStore so SceneNode
//     renders the correct status without needing to reach into ProjectStore
//     directly.

import { useEffect } from "react";
import { useProjectStore } from "#/store/useProjectStore.js";
import { usePipelineStore } from "#/store/usePipelineStore.js";
import { useCanvasUIStore } from "#/store/useCanvasUIStore.js";
import { useNodeStore } from "#/store/useNodeStore.js";
import { NodeFactory } from "../domain/canvas/NodeFactory.js";
import type { CanvasNodeType } from "../domain/canvas/NodeTypes.js";

const TYPE_ROW: Partial<Record<CanvasNodeType | "metadata", number>> = {
  metadata: -1,
  scene: 0,
  character: 1,
  location: 2,
};
const COL_WIDTH = 420;
const ROW_HEIGHT = 350;
const LEFT_PAD = 80;
const TOP_PAD = 120;

function gridPosition(
  type: string,
  countOfType: number,
): { x: number; y: number } {
  const row = TYPE_ROW[type as CanvasNodeType] ?? 2;
  const col = countOfType % 5;
  return {
    x: col * COL_WIDTH + LEFT_PAD,
    y: row * ROW_HEIGHT + TOP_PAD,
  };
}

/**
 * Canvas ↔ store bridge.
 * Subscribes to store mutations produced by usePipelineEvents and reflects
 * them as node/edge operations on the ReactFlow canvas. Passing an empty
 * string for demo mode is a no-op inside the hook (guarded on projectId).
 * @param projectId 
 */
export function useCanvasPipelineSync(projectId: string | undefined): void {
  useEffect(() => {
    if (!projectId) return;

    const spawnedIds = new Set<string>(
      useNodeStore.getState().nodes.map((n) => n.id),
    );

    function ensureRootNode(): void {
      if (spawnedIds.has(projectId!)) return;
      spawnedIds.add(projectId!);
      useNodeStore.getState().addNode(
        NodeFactory.createNode({
          type: "metadata",
          entityId: projectId!,
          contextId: projectId!,
          contextType: "project",
          posCanvas: { x: 0, y: 0 },
          scope: "project",
        }),
      );
    }

    function spawnEntity(
      entityId: string,
      type: CanvasNodeType,
      posCanvas?: { x: number; y: number },
    ): void {
      if (spawnedIds.has(entityId)) return;

      spawnedIds.add(entityId);

      // If position not provided, calculate it based on the actual index of this entity in its collection
      if (!posCanvas) {
        // Calculate position based on the actual index of this entity in its collection
        const { scenes, characters, locations } = useProjectStore.getState();
        let indexOfType = 0;

        switch (type) {
          case "scene":
            indexOfType = Array.from(scenes.values()).findIndex(
              (s) => s.id === entityId,
            );
            break;
          case "character":
            indexOfType = Array.from(characters.values()).findIndex(
              (c) => c.id === entityId,
            );
            break;
          case "location":
            indexOfType = Array.from(locations.values()).findIndex(
              (l) => l.id === entityId,
            );
            break;
          default:
            indexOfType = 0;
        }

        // If entity not found (shouldn't happen in normal flow), use 0 as fallback
        if (indexOfType === -1) indexOfType = 0;

        posCanvas = gridPosition(type, indexOfType);
      }

      useNodeStore.getState().addNode(
        NodeFactory.createNode({
          type,
          entityId,
          contextId: projectId!,
          contextType: "project",
          posCanvas,
          scope: "project",
        }),
      );

      if (type === "scene") {
        ensureRootNode();
        const edgeId = `${projectId}__scene_sequence__${entityId}`;
        const alreadyHasEdge = useNodeStore
          .getState()
          .edges.some((e) => e.id === edgeId);
        if (!alreadyHasEdge) {
          useNodeStore.getState().addEdge(
            NodeFactory.createEdge({
              sourceId: projectId!,
              targetId: entityId,
              type: "scene_sequence",
              animated: true,
            }),
          );
        }
      }
    }

    function syncSceneStatus(
      sceneId: string,
      scene: Record<string, unknown>,
    ): void {
      const node = useNodeStore.getState().nodes.find((n) => n.id === sceneId);
      if (!node) return;

      const current = node.data as any;
      const nextStatus = scene.status;
      const nextMessage = scene.progressMessage ?? "";

      if (
        current.status === nextStatus &&
        current.progressMessage === nextMessage
      )
        return;

      useNodeStore.getState().updateNodeData(sceneId, {
        status: nextStatus,
        progressMessage: nextMessage,
      } as any);
    }

    {
      const { scenes, characters, locations } = useProjectStore.getState();
      if (scenes.size > 0 || characters.size > 0 || locations.size > 0) {
        ensureRootNode();

        // Update positions for all existing nodes
        const nodes = useNodeStore.getState().nodes;
        nodes.forEach((node) => {
          let newPos = { x: 0, y: 0 };
          switch (node.type) {
            case "scene":
              const sceneIndex = Array.from(scenes.values()).findIndex(
                (s) => s.id === node.data.entityId,
              );
              newPos = gridPosition("scene", sceneIndex);
              break;
            case "character":
              const charIndex = Array.from(characters.values()).findIndex(
                (c) => c.id === node.data.entityId,
              );
              newPos = gridPosition("character", charIndex);
              break;
            case "location":
              const locIndex = Array.from(locations.values()).findIndex(
                (l) => l.id === node.data.entityId,
              );
              newPos = gridPosition("location", locIndex);
              break;
            default:
              break;
          }

          // Update node position if changed
          if (node.position.x !== newPos.x || node.position.y !== newPos.y) {
            const updatedNode = {
              ...node,
              position: newPos,
            };
            useNodeStore.getState().addNode(updatedNode);
            useNodeStore.getState().deleteNode(node.id);
          }
        });

        // Initial population with correct positioning
        scenes.forEach((scene, id) => {
          const sceneIndex = Array.from(scenes.values()).findIndex(
            (s) => s.id === id,
          );
          spawnEntity(id, "scene", gridPosition("scene", sceneIndex));
        });
        characters.forEach((character, id) => {
          const charIndex = Array.from(characters.values()).findIndex(
            (c) => c.id === id,
          );
          spawnEntity(id, "character", gridPosition("character", charIndex));
        });
        locations.forEach((location, id) => {
          const locIndex = Array.from(locations.values()).findIndex(
            (l) => l.id === id,
          );
          spawnEntity(id, "location", gridPosition("location", locIndex));
        });
      }
    }

    const unsubScenes = useProjectStore.subscribe((state, prev) => {
      if (state.scenes === prev.scenes) return;
      ensureRootNode();

      // Process removed scenes
      prev.scenes.forEach((_, prevId) => {
        if (!state.scenes.has(prevId)) {
          useNodeStore.getState().deleteNode(prevId);
          spawnedIds.delete(prevId);
        }
      });

      // Process added/updated scenes
      state.scenes.forEach((scene, id) => {
        if (!prev.scenes.has(id)) {
          // New scene
          spawnEntity(id, "scene");
        } else {
          // Existing scene - update status if changed
          const prevScene = prev.scenes.get(id)!;
          if (
            prevScene.status !== scene.status ||
            prevScene.progressMessage !== scene.progressMessage
          ) {
            syncSceneStatus(id, scene as any);
          }
        }
      });
    });

    const unsubCharacters = useProjectStore.subscribe((state, prev) => {
      if (state.characters === prev.characters) return;

      // Process removed characters
      prev.characters.forEach((_, prevId) => {
        if (!state.characters.has(prevId)) {
          useNodeStore.getState().deleteNode(prevId);
          spawnedIds.delete(prevId);
        }
      });

      // Process added characters
      state.characters.forEach((_, id) => {
        if (!prev.characters.has(id)) {
          // New character
          spawnEntity(id, "character");
        }
      });
    });

    const unsubLocations = useProjectStore.subscribe((state, prev) => {
      if (state.locations === prev.locations) return;

      // Process removed locations
      prev.locations.forEach((_, prevId) => {
        if (!state.locations.has(prevId)) {
          useNodeStore.getState().deleteNode(prevId);
          spawnedIds.delete(prevId);
        }
      });

      // Process added locations
      state.locations.forEach((_, id) => {
        if (!prev.locations.has(id)) {
          // New location
          spawnEntity(id, "location");
        }
      });
    });

    const unsubInterrupt = usePipelineStore.subscribe((state, prev) => {
      if (state.interrupt === prev.interrupt || !state.interrupt) return;
      const sceneId = (state.interrupt as any).originalParams?.sceneId as
        | string
        | undefined;
      if (sceneId) {
        useCanvasUIStore.getState().selectNode(sceneId);
      }
    });

    return () => {
      unsubScenes();
      unsubCharacters();
      unsubLocations();
      unsubInterrupt();
    };
  }, [projectId]);
}
