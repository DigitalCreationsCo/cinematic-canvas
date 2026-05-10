import { useEffect, useRef, useState, useCallback } from "react";
import type { ComponentType } from "react";
import type { CanvasNode } from "#client/domain/canvas/NodeTypes.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { ScreenShareIcon } from "lucide-react";
import { SceneInfiniteIcon } from "#shared/icons/scene-infinite.js";
import { useUIMenuStore } from "#client/store/useUIMenuStore.js";
import { useNodeStore } from "#client/store/useNodeStore.js";
import { useProjectStore } from "#client/store/useProjectStore.js";
import {
  useSceneCreatorStore,
  loadCachedSceneCreatorFields,
} from "#client/store/useSceneCreatorStore.js";
import { createSceneCreatorConfig } from "#client/components/canvas/nodes/SceneCreatorFields.js";
import { generateId } from "#shared/utils/id.js";
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

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export interface WorkspaceToolDefinition {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

export const WORKSPACE_TOOLS: WorkspaceToolDefinition[] = [
  {
    id: "reverse-engineer",
    name: "Reverse Engineer",
    description: "Borrow the cinematic styles from a video into your project.",
    icon: ScreenShareIcon,
  },
  {
    id: "create-scenes",
    name: "Create Scenes",
    description: "Ask the assistant to generate scenes.",
    icon: SceneInfiniteIcon,
  },
];

// ============================================================================
// SCENE CREATOR NODE LIFECYCLE
// ============================================================================
//
// This hook manages the lifecycle of the SceneCreatorNode on the canvas:
//
//   Tool ACTIVE   →  SceneCreatorNode is created on the canvas (idempotent)
//   Tool INACTIVE →  SceneCreatorNode is removed (with confirmation if dirty)
//
// It also caches form data in sessionStorage (same pattern as NewEntityModal)
// so that in-flight form state survives accidental closes or refreshes.
//
// ── Usage ───────────────────────────────────────────────────────────────────
// Mount <SceneCreatorToolManager /> somewhere inside the canvas component tree
// (e.g. in NodeGraph.tsx). It renders nothing — it's a pure side-effect host.

const TOOL_ID = "create-scenes";

export function SceneCreatorToolManager() {
  // ── Tool state ─────────────────────────────────────────────────────────
  const activeTools = useUIMenuStore((s) => s.activeTools);
  const isActive = activeTools.includes(TOOL_ID);

  // ── Canvas / project state ─────────────────────────────────────────────
  const addNode = useNodeStore((s) => s.addNode);
  const deleteNode = useNodeStore((s) => s.deleteNode);
  const nodes = useNodeStore((s) => s.nodes);
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);

  // ── Scene creator store ────────────────────────────────────────────────
  const sceneNodeId = useSceneCreatorStore((s) => s.nodeId);
  const hasUnsavedData = useSceneCreatorStore((s) => s.hasUnsavedData);
  const setNodeId = useSceneCreatorStore((s) => s.setNodeId);
  const reset = useSceneCreatorStore((s) => s.reset);

  // ── Close-confirmation AlertDialog state ──────────────────────────────
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // ── Transition detection ───────────────────────────────────────────────
  // Always start from "inactive" so the effect correctly detects activation
  // even when the tool is already active at first render (e.g., if the
  // component mounts after the tool was toggled on).
  const prevActiveRef = useRef(false);

  useEffect(() => {
    const prevActive = prevActiveRef.current;
    prevActiveRef.current = isActive;

    // ── TOOL ACTIVATED → create the node (idempotent) ─────────────────
    if (isActive && !prevActive) {
      // Idempotency: if a scene-creator node already exists (e.g. from a
      // previous activation that wasn't cleaned up), just track its ID.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const existingNode = nodes.find((n) => (n as any).type === "scene-creator");
      if (existingNode) {
        setNodeId(existingNode.id);
        return;
      }

      if (!selectedProjectId) return;

      // Restore cached form fields (if any) so the user picks up where
      // they left off — same sessionStorage pattern as NewEntityModal.
      const cached = loadCachedSceneCreatorFields();

      const entityId = generateId();
      const config = createSceneCreatorConfig({
        onSuccess: () => {
          // After successful scene generation:
          // 1. Delete the ephemeral SceneCreator node from the canvas
          // 2. Clear the sessionStorage cache
          // 3. Reset the scene-creator store
          // 4. Deactivate the tool
          const nodeId = useSceneCreatorStore.getState().nodeId;
          useSceneCreatorStore.getState().clearCache();
          useSceneCreatorStore.getState().reset();
          if (nodeId) {
            useNodeStore.getState().deleteNode(nodeId, false);
          }
          useUIMenuStore.getState().toggleActiveTool(TOOL_ID);
        },
      });

      const sceneCreatorNode = {
        id: entityId,
        type: "scene-creator" as const,
        position: {
          x: 300 + Math.random() * 200,
          y: 200 + Math.random() * 200,
        },
        data: {
          entityId,
          contextId: selectedProjectId,
          contextType: "project" as const,
          scope: "project" as const,
          isLocked: false,
          pipelineSelected: false,
          collapsed: false,
          idxVersion: 1,
          formConfig: {
            ...config,
            initialValues: cached ?? config.initialValues,
          },
        },
      };

      addNode(sceneCreatorNode as any);
      setNodeId(entityId);
      return;
    }

    // ── TOOL DEACTIVATED → remove the node (with confirm if dirty) ───
    if (!isActive && prevActive) {
      if (!sceneNodeId) return;

      // If the user has entered any data, show the AlertDialog
      // confirmation before discarding — same pattern as NewEntityModal.
      if (hasUnsavedData) {
        setShowCloseConfirm(true);
        return;
      }

      // Hard-delete (no soft-delete / trash) because this node is
      // ephemeral — it only exists while the tool is active.
      deleteNode(sceneNodeId, false);
      reset();
    }
  }, [
    isActive,
    nodes,
    selectedProjectId,
    addNode,
    deleteNode,
    setNodeId,
    reset,
    sceneNodeId,
    hasUnsavedData,
  ]);

  // ── Confirm discard handlers ───────────────────────────────────────────
  const confirmDiscard = useCallback(() => {
    setShowCloseConfirm(false);
    if (sceneNodeId) {
      deleteNode(sceneNodeId, false);
    }
    reset();
  }, [sceneNodeId, deleteNode, reset]);

  const cancelDiscard = useCallback(() => {
    setShowCloseConfirm(false);
    // Re-activate the tool so the user can continue editing.
    useUIMenuStore.getState().toggleActiveTool(TOOL_ID);
  }, []);

  return (
    <AlertDialog onOpenChange={setShowCloseConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure? You will lose your form data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelDiscard}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDiscard}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
