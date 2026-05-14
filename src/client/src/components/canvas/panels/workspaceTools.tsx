import { useEffect, useRef, useState, useCallback } from "react";
import type { ComponentType } from "react";
import type { CanvasNode } from "#client/domain/canvas/NodeTypes.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { ScreenShareIcon } from "lucide-react";
import { SceneInfiniteIcon } from "#shared/icons/scene-infinite.js";
import { useUIMenuStore, selectWorkspaceToolsSidebarOpen } from "#client/store/useUIMenuStore.js";
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
  // {
  //   id: "reverse-engineer",
  //   name: "Reverse Engineer",
  //   description: "Borrow the cinematic styles from a video into your project.",
  //   icon: ScreenShareIcon,
  // },
  {
    id: "create-scenes",
    name: "Create Scenes",
    description: "Ask the assistant to generate a sequence of scenes.",
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

// ============================================================================
// STANDARDIZED WORKSPACE TOOL MANAGER
// ============================================================================
//
// A generalized component that handles the lifecycle of tools that create
// ephemeral canvas nodes and ensures idempotency.
//
// Mount <WorkspaceToolManager /> inside the canvas component tree.

export interface WorkspaceToolManagerProps {
  toolId: string;
  nodeType: string;
  nodeId: string | null;
  hasUnsavedData: boolean;
  setNodeId: (id: string | null) => void;
  reset: () => void;
  createNode: (entityId: string, projectId: string, onSuccess: () => void) => any;
}

export function WorkspaceToolManager({
  toolId,
  nodeType,
  nodeId,
  hasUnsavedData,
  setNodeId,
  reset,
  createNode,
}: WorkspaceToolManagerProps) {
  // ── Tool state ─────────────────────────────────────────────────────────
  const activeTools = useUIMenuStore((s) => s.activeTools);
  const isSidebarOpen = useUIMenuStore(selectWorkspaceToolsSidebarOpen);
  const isActive = activeTools.includes(toolId) && isSidebarOpen;

  // ── Canvas / project state ─────────────────────────────────────────────
  const addNode = useNodeStore((s) => s.addNode);
  const deleteNode = useNodeStore((s) => s.deleteNode);
  const nodes = useNodeStore((s) => s.nodes);
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);

  // No close-confirmation needed as data is cached

  // ── Transition detection ───────────────────────────────────────────────
  const prevActiveRef = useRef(false);
  const nodeIdRef = useRef(nodeId);

  useEffect(() => {
    nodeIdRef.current = nodeId;
  }, [nodeId]);

  const onSuccess = useCallback(() => {
    reset();
    const currentId = nodeIdRef.current;
    if (currentId) {
      deleteNode(currentId, false);
    }
    useUIMenuStore.getState().toggleActiveTool(toolId);
  }, [reset, toolId, deleteNode]);

  useEffect(() => {
    const prevActive = prevActiveRef.current;
    prevActiveRef.current = isActive;

    // ── TOOL ACTIVATED → create the node (idempotent) ─────────────────
    if (isActive && !prevActive) {
      // Idempotency
      const existingNode = nodes.find((n) => (n as any).type === nodeType);
      if (existingNode) {
        setNodeId(existingNode.id);
        return;
      }

      if (!selectedProjectId) return;

      const entityId = generateId();
      const node = createNode(entityId, selectedProjectId, onSuccess);

      addNode(node as any);
      setNodeId(entityId);
      return;
    }

    // ── TOOL DEACTIVATED → remove the node ───
    if (!isActive && prevActive) {
      if (!nodeId) return;

      deleteNode(nodeId, false);
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
    nodeId,
    nodeType,
    createNode,
    onSuccess,
  ]);

  useEffect(() => {
    if (!nodeId || !isActive) return;

    // Keep the node fixed at right: 8px, top: 80px
    const rightMargin = 8;
    const topMargin = 80;
    const width = 344; // w-86 is 21.5rem = 344px

    const updatePosition = (viewport: { x: number; y: number; zoom: number }) => {
      // Find the dynamic container inside ToolsSidebar.tsx
      const container = document.getElementById("workspace-tool-container");

      let screenX = 0;
      let screenY = 0;

      if (container) {
        const rect = container.getBoundingClientRect();
        // The UI card is w-[344px] and anchored at right-3 (12px) inside the container.
        // We set screenX to match the left edge of the UI card so Handles perfectly align.
        screenX = rect.right - 12 - 344;
        screenY = rect.top;
      } else {
        // Fallback if sidebar is missing
        const width = 344;
        const rightMargin = 8;
        const topMargin = 80;
        screenX = window.innerWidth - width - rightMargin;
        screenY = topMargin;
      }

      const x = (screenX - viewport.x) / viewport.zoom;
      const y = (screenY - viewport.y) / viewport.zoom;

      const inverseScale = 1 / viewport.zoom;

      useNodeStore.getState().updateNodePosition(nodeId, { x, y });
      useNodeStore.getState().updateNodeData(nodeId, { inverseScale });
    };

    // Set initial position immediately
    updatePosition(useNodeStore.getState().viewport);

    // Subscribe to viewport changes so it stays fixed during pan/zoom
    const unsub = useNodeStore.subscribe(
      (state) => state.viewport,
      (viewport) => updatePosition(viewport)
    );

    return unsub;
  }, [nodeId, isActive]);

  return null;
}

// ============================================================================
// SPECIFIC TOOL INSTANCES
// ============================================================================

export function SceneCreatorToolManager() {
  const nodeId = useSceneCreatorStore((s) => s.nodeId);
  const hasUnsavedData = useSceneCreatorStore((s) => s.hasUnsavedData);
  const setNodeId = useSceneCreatorStore((s) => s.setNodeId);
  const reset = useSceneCreatorStore((s) => s.reset);

  const createNode = useCallback((entityId: string, projectId: string, onSuccess: () => void) => {
    const cached = loadCachedSceneCreatorFields();

    const handleSuccess = () => {
      useSceneCreatorStore.getState().clearCache();
      onSuccess();
    };

    const config = createSceneCreatorConfig({ onSuccess: handleSuccess });

    return {
      id: entityId,
      type: "scene-creator" as const,
      // React Flow requires a position object, but we override it via className
      position: { x: 0, y: 0 },
      // Important: Ensure it is absolutely positioned and doesn't participate in collisions
      draggable: false,
      selectable: false,
      deletable: false, // Prevents deletion via Backspace
      // When fixed, the FormNode visually portals into the sidebar container.
      // We set width to w-[344px] so it can overflow out the left side of the 280px sidebar.
      // It retains its background and borders so it looks like a solid floating panel over the sidebar border.
      className: "!w-[344px] z-50 shadow-2xl",
      data: {
        entityId,
        contextId: projectId,
        isWorkspaceTool: true,
        contextType: "project" as const,
        scope: "project" as const,
        isLocked: false,
        pipelineSelected: false,
        collapsed: false,
        idxVersion: 1,
        formConfig: {
          ...config,
          initialValues: cached ?? config.initialValues,
          isFixed: true,
        },
      },
    };
  }, []);

  return (
    <WorkspaceToolManager
      toolId={TOOL_ID}
      nodeType="scene-creator"
      nodeId={nodeId}
      hasUnsavedData={hasUnsavedData}
      setNodeId={setNodeId}
      reset={reset}
      createNode={createNode}
    />
  );
}
