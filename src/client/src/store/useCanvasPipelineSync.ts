// src/client/src/store/useCanvasPipelineSync.ts
//
// Bridges the SSE pipeline event stores → ReactFlow canvas (useNodeStore).
//
// WHY THIS EXISTS:
//   usePipelineEvents.ts handles the SSE transport layer and writes to
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
//   - Layout loading: Loads persisted layouts from HybridNodeStorage BEFORE
//     spawning entities to ensure positions are preserved.

import { useEffect, useRef } from "react";
import { useProjectStore } from "#/store/useProjectStore.js";
import { usePipelineStore } from "#/store/usePipelineStore.js";
import { useCanvasUIStore } from "#/store/useCanvasUIStore.js";
import { useNodeStore } from "#/store/useNodeStore.js";
import { NodeFactory } from "../domain/canvas/NodeFactory.js";
import { getHybridNodeStorage } from "../services/hybridNodeStorage.js";
import { supabase } from "../lib/supabase.js";
import type { CanvasNodeType } from "../../../shared/types/index.js";

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
  // BUG FIX: Hoist layoutMap out of initializeCanvas so asynchronous
  // project store initializations (e.g., from DB fetches) can access the
  // restored layout positions when their subscriptions fire later.
  const layoutMapRef = useRef<Map<string, {
    position: { x: number; y: number };
    width?: number | null;
    height?: number | null;
    idxVersion: number;
    nodeType: string;
    jsonUiMetadata: Record<string, unknown> | null;
  }>>(new Map());

  useEffect(() => {
    if (!projectId) return;

    const spawnedIds = new Set<string>(
      useNodeStore.getState().nodes.map((n) => n.id),
    );

    /**
     * Fetches persisted layouts from hybrid storage and populates layoutMapRef.
     */
    async function loadPersistedLayouts(): Promise<void> {
      if (!projectId) return;
      
      try {
        const storage = getHybridNodeStorage(supabase);
        // BUG-1 fix: Sync from server when cloud is enabled.
        const layouts = await storage.fetch(projectId, { syncFromServer: true });

        // BUG-2 fix: Retry any locally-stored changes that failed to sync.
        storage.forceSyncUnsynced().catch(err => {
          console.warn('[useCanvasPipelineSync] forceSyncUnsynced failed:', err);
        });
        
        for (const layout of layouts) {
          layoutMapRef.current.set(layout.idEntity, {
            position: { x: layout.valPosX, y: layout.valPosY },
            width: layout.valWidth,
            height: layout.valHeight,
            idxVersion: layout.idxVersion,
            nodeType: layout.nodeType,
            jsonUiMetadata: layout.jsonUiMetadata,
          });
        }
        
        console.debug('[useCanvasPipelineSync] Loaded persisted layouts', {
          count: layouts.length
        });
      } catch (err) {
        console.error('[useCanvasPipelineSync] Failed to load persisted layouts', err);
      }
    }

    function ensureRootNode(): void {
      if (spawnedIds.has(projectId!)) return;
      
      const existingNodes = useNodeStore.getState().nodes;
      const rootExists = existingNodes.some(
        (n) => n.type === "metadata" && n.data.entityId === projectId!
      );
      if (rootExists) {
        spawnedIds.add(projectId!);
        return;
      }

      console.debug('[useCanvasPipelineSync] Creating root metadata node', { projectId });
      spawnedIds.add(projectId!);
      
      // Apply stored root node position if available.
      const rootLayout = layoutMapRef.current.get(projectId!);
      const posCanvas = rootLayout?.position ?? { x: 0, y: 0 };

      useNodeStore.getState().addNode(
        NodeFactory.createNode({
          type: "metadata",
          entityId: projectId!,
          contextId: projectId!,
          contextType: "project",
          posCanvas,
          scope: "project",
          ...(rootLayout ? { idxVersion: rootLayout.idxVersion } : {}),
        })
      );
      
      if (rootLayout?.jsonUiMetadata) {
        useNodeStore.getState().updateNodeData(projectId!, { ...rootLayout.jsonUiMetadata });
      }
    }

    function spawnEntity(
      entityId: string,
      type: CanvasNodeType,
    ): void {
      if (spawnedIds.has(entityId)) return;
      console.debug('[useCanvasPipelineSync] Spawning entity', { entityId, type });

      spawnedIds.add(entityId);

      // Check if we have a persisted layout for this entity.
      const stored = layoutMapRef.current.get(entityId);
      let posCanvas: { x: number; y: number };

      if (stored) {
          posCanvas = stored.position;
      } else {
          // Calculate position based on the actual index of this entity in its collection
          const { scenes, characters, locations } = useProjectStore.getState();
          let indexOfType = 0;

          switch (type) {
            case "scene":
              indexOfType = Array.from(scenes.values()).findIndex((s: any) => s.id === entityId);
              break;
            case "character":
              indexOfType = Array.from(characters.values()).findIndex((c: any) => c.id === entityId);
              break;
            case "location":
              indexOfType = Array.from(locations.values()).findIndex((l: any) => l.id === entityId);
              break;
            default:
              indexOfType = 0;
          }

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
          ...(stored ? { idxVersion: stored.idxVersion } : {}),
        }),
      );
      
      if (stored?.jsonUiMetadata) {
        useNodeStore.getState().updateNodeData(entityId, { ...stored.jsonUiMetadata });
      }

      if (type === "scene") {
        ensureRootNode();
        const edgeId = NodeFactory.getEdgeId(projectId!, entityId, "scene_sequence");
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

    async function initializeCanvas(): Promise<void> {
      const { scenes, characters, locations } = useProjectStore.getState();
      
      // Load persisted layouts into layoutMapRef for position lookup during spawning.
      await loadPersistedLayouts();
      
      if (scenes.size > 0 || characters.size > 0 || locations.size > 0) {
        console.debug('[useCanvasPipelineSync] Entities found, spawning nodes...', {
          scenes: scenes.size,
          characters: characters.size,
          locations: locations.size,
          storedLayouts: layoutMapRef.current.size,
        });
        ensureRootNode();

        // Spawn entities (spawnEntity now uses layoutMapRef directly for positions & metadata).
        Array.from(scenes.values()).forEach((scene: any) => {
          spawnEntity(String(scene.id), "scene");
        });

        Array.from(characters.values()).forEach((char: any) => {
          spawnEntity(String(char.id), "character");
        });

        Array.from(locations.values()).forEach((loc: any) => {
          spawnEntity(String(loc.id), "location");
        });

        // After all entities are spawned, apply stored width/height if present
        const store = useNodeStore.getState();
        for (const [entityId, layout] of layoutMapRef.current) {
          // Skip root node (already handled by ensureRootNode) and entities not yet spawned
          if (entityId === projectId || !spawnedIds.has(entityId)) continue;

          const dataUpdate: Record<string, unknown> = {
            idxVersion: layout.idxVersion,
          };
          if (layout.jsonUiMetadata) {
            Object.assign(dataUpdate, layout.jsonUiMetadata);
          }
          store.updateNodeData(entityId, dataUpdate);

          // Apply stored width/height if present
          if (layout.width != null || layout.height != null) {
            const node = store.nodes.find(n => n.id === entityId);
            if (node) {
              const updatedNodes = store.nodes.map(n => {
                if (n.id === entityId) {
                  return {
                    ...n,
                    ...(layout.width != null ? { width: layout.width } : {}),
                    ...(layout.height != null ? { height: layout.height } : {}),
                  };
                }
                return n;
              });
              store.setNodes(updatedNodes);
            }
          }
        }

        console.debug('[useCanvasPipelineSync] Canvas initialized with layout recall', {
          totalNodes: store.nodes.length,
          restoredFromStorage: layoutMapRef.current.size,
        });
      }
    }

    initializeCanvas().catch(err => {
      console.error('[useCanvasPipelineSync] Failed to initialize canvas', err);
    });

    const unsubScenes = useProjectStore.subscribe((state, prev) => {
      if (state.scenes === prev.scenes) return;
      console.debug('[useCanvasPipelineSync] Scenes changed', {
        prevSize: prev.scenes.size,
        newSize: state.scenes.size,
      });
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
          console.debug('[useCanvasPipelineSync] New scene detected', { id, name: scene.name });
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
      console.debug('[useCanvasPipelineSync] Characters changed', {
        prevSize: prev.characters.size,
        newSize: state.characters.size,
      });

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
          console.debug('[useCanvasPipelineSync] New character detected', { id, name: state.characters.get(id)?.name });
          spawnEntity(id, "character");
        }
      });
    });

    const unsubLocations = useProjectStore.subscribe((state, prev) => {
      if (state.locations === prev.locations) return;
      console.debug('[useCanvasPipelineSync] Locations changed', {
        prevSize: prev.locations.size,
        newSize: state.locations.size,
      });

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
          console.debug('[useCanvasPipelineSync] New location detected', { id, name: state.locations.get(id)?.name });
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

    const handleRemoteLayoutUpdate = (event: CustomEvent) => {
      const { contextId, nodes } = event.detail;
      
      if (contextId !== projectId) return;
      
      const store = useNodeStore.getState();
      
      nodes.forEach((layoutNode: any) => {
        const existingNode = store.nodes.find(n => n.id === layoutNode.idEntity);
        if (existingNode) {
          store.updateNodePosition(existingNode.id, { 
            x: layoutNode.valPosX, 
            y: layoutNode.valPosY 
          });
          
          if (layoutNode.idxVersion) {
            store.updateNodeData(existingNode.id, { 
              idxVersion: layoutNode.idxVersion 
            });
          }
        }
      });
    };

    window.addEventListener('canvas:layout-updated', handleRemoteLayoutUpdate as EventListener);

    return () => {
      unsubScenes();
      unsubCharacters();
      unsubLocations();
      unsubInterrupt();
      window.removeEventListener('canvas:layout-updated', handleRemoteLayoutUpdate as EventListener);
    };
  }, [projectId]);
}
