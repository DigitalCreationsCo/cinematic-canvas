// src/client/src/components/canvas/nodes/NodeShell.tsx
//
// Functional base component that every canvas node type is built with.
//
// WHAT IT PROVIDES:
//   1. Outer wrapper div with selection ring, glass card style, and click-to-select.
//   2. A single target Handle (left side) — if targetHandle config is provided.
//   3. A single source Handle (right side) — if sourceHandle config is provided.
//   4. NodePendingBadge rendering in the header area — driven by pendingChangeCount.
//   5. NodeShellHeader sub-component for the header row (icon + label + badge slot).
//
// DESIGN CONTRACT:
//   • Each node type renders one NodeShell. Handles are declared here, not in the
//     node component's JSX. Node components provide only the handle configuration.
//   • The `cn` utility from shadcn is used for className merging.
//   • Never duplicates handles — one target (left) and one source (right) per node.
//     CompositeNode is the only exception; it passes `additionalTargetHandles` for
//     the named in1/in2/in3 inputs.

import React, { useCallback, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "#client/lib/utils.js";
import { useCanvasUIStore } from "#client/store/useCanvasUIStore.js";
import { useNodeStore } from "#client/store/useNodeStore.js";
import { NodePendingBadge } from "#client/components/canvas/nodes/NodePendingBadge.js";
import type { CanvasNodeData } from "#client/domain/canvas/NodeTypes.js";
import { Trash2 } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

export interface NodeHandleConfig {
  /** Handle ID — must match a value in HANDLE_IDS. */
  id: string;
  /** Tailwind background color className, e.g. '!bg-amber-500'. Defaults to muted. */
  colorClass?: string;
  /** Tooltip shown on hover. */
  title?: string;
  /** Override inline styles (e.g. for composite named inputs with custom top%). */
  style?: React.CSSProperties;
  /** Make the handle a pill/rect shape instead of a circle (for entity catch-all handles). */
  pill?: boolean;
}

export interface NodeShellProps {
  id: string;
  type?: string;
  data: CanvasNodeData;
  selected: boolean;
  isConnectable?: boolean;
  children: React.ReactNode;

  /** Target handle rendered on the LEFT side. Omit to render no target handle. */
  targetHandle?: NodeHandleConfig;
  /** Source handle rendered on the RIGHT side. Omit to render no source handle. */
  sourceHandle?: NodeHandleConfig;
  /**
   * Additional named target handles for nodes that need more than one input
   * (currently only CompositeNode). Each entry needs an explicit `style.top`.
   */
  additionalTargetHandles?: NodeHandleConfig[];

  /** Extra Tailwind classNamees on the outer wrapper. */
  className?: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function NodeShell({
  id,
  type,
  data,
  selected,
  isConnectable = true,
  children,
  targetHandle,
  sourceHandle,
  additionalTargetHandles,
  className,
}: NodeShellProps) {
  const selectNode = useCanvasUIStore((s) => s.selectNode);
  const openDeleteDialog = useCanvasUIStore((s) => s.openDeleteDialog);
  const edges = useNodeStore((s) => s.edges);
  const deleteNode = useNodeStore((s) => s.deleteNode);
  const pendingCount = data.pendingChangeCount ?? 0;
  const [isHovered, setIsHovered] = useState(false);

  const canDelete = type !== "metadata";
  // Use the hook version to subscribe to viewport changes for automatic re-render
  const viewport = useNodeStore((s) => s.viewport);
  const isZoomedIn = viewport.zoom >= 0.3;

  const showNodeButtonsOverlay =
    isZoomedIn && (selected || isHovered) && !data.isSoftDeleted && canDelete;

  const handleDeleteRequest = useCallback(() => {
    if (!canDelete) return;

    const hasConnectedEdges = edges.some((e) => e.source === id || e.target === id);
    if (hasConnectedEdges) {
      openDeleteDialog(id);
    } else {
      deleteNode(id, true);
      selectNode(null);
    }
  }, [id, edges, deleteNode, selectNode, openDeleteDialog, canDelete]);

  return (
    <div
      data-testid="node-shell"
      className={cn(
        // Base card style — all nodes share this visual language.
        "card-cinematic-glass rounded-none overflow-visible transition-all duration-50",
        // Selection ring.
        selected ? "node-selected" : "node",
        !isZoomedIn &&
          selected &&
          "ring-2 ring-primary ring-offset-2 ring-offset-background",
        // Soft-delete dimming.
        data.isSoftDeleted && "opacity-40 grayscale pointer-events-none",
        className,
      )}
      onClick={() => selectNode(data.entityId)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Primary target handle (left side) ────────────────────────────── */}
      {targetHandle && (
        <Handle
          id={targetHandle.id}
          data-testid="target-handle"
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          style={{ top: "100px", ...targetHandle?.style }}
          title={targetHandle.title}
          className={cn(
            // Scrubber style: pill shape that extends outside container
            "!absolute !-left-1.5 !w-3 !h-6 !rounded-none !border-2 !border-border",
            "!bg-background/10 !backdrop-blur-sm",
            "transition-all duration-50",
            "hover:!scale-110 hover:!bg-primary/80 hover:!border-primary hover:!shadow-lg hover:!shadow-primary/25",
            "focus:!outline-none focus:!ring-2 focus:!ring-primary focus:!ring-offset-1",
            targetHandle.colorClass ?? "!bg-muted",
          )}
        />
      )}

      {/* ── Additional named target handles (CompositeNode only) ─────────── */}
      {additionalTargetHandles?.map((h) => (
        <Handle
          key={h.id}
          data-testid="additional-target-handle"
          id={h.id}
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          style={h.style}
          title={h.title}
          className={cn(
            // Scrubber style: pill shape that extends outside container
            "!absolute !-left-1.5 !w-3 !h-6 !rounded-none !border-2 !border-border",
            "!bg-background/10 !backdrop-blur-sm",
            "transition-all duration-50",
            "hover:!scale-110 hover:!bg-primary/80 hover:!border-primary hover:!shadow-lg hover:!shadow-primary/25",
            "focus:!outline-none focus:!ring-2 focus:!ring-primary focus:!ring-offset-1",
            h.colorClass ?? "!bg-fuchsia-500/50 !border-fuchsia-400",
          )}
        />
      ))}

      {/* ── Node content ──────────────────────────────────────────────────── */}
      {children}

      {/* ── Source handle (right side) ─────────────────────────────────────── */}
      {sourceHandle && (
        <Handle
          id={sourceHandle.id}
          data-testid="source-handle"
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          style={{ top: "100px", ...sourceHandle?.style }}
          title={sourceHandle.title}
          className={cn(
            // Scrubber style: pill shape that extends outside container
            "!absolute !-right-1.5 !w-3 !h-6 !rounded-none !border-2 !border-border",
            "!bg-background/10 !backdrop-blur-sm",
            "transition-all duration-50",
            "hover:!scale-110 hover:!bg-primary/80 hover:!border-primary hover:!shadow-lg hover:!shadow-primary/25",
            "focus:!outline-none focus:!ring-2 focus:!ring-primary focus:!ring-offset-1",
            sourceHandle.colorClass ?? "!bg-muted",
          )}
        />
      )}

      {showNodeButtonsOverlay && (
        <div className="absolute bottom-5 right-5 z-[100]">
          <button
            className="h-7 w-7 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg hover:scale-110 transition-all pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteRequest();
            }}
            title="Delete node"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// NODE SHELL HEADER — shared header row used by every node type
// ============================================================================

export interface NodeShellHeaderProps {
  icon?: React.ReactNode;
  label: string;
  pendingCount?: number;
  /** Slot for custom badges (e.g. FrameContinuityIndicator, WORLD badge). */
  extras?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function NodeShellHeader({
  icon,
  label,
  pendingCount = 0,
  extras,
  className,
  children,
}: NodeShellHeaderProps) {
  const viewport = useNodeStore((s) => s.viewport);
  const isZoomedIn = viewport.zoom >= 0.3;

  return (
    <div
      className={cn(
        "text-[1.3rem] flex flex-col gap-1 border-b-2 border-border p-5 px-2",
      )}
    >
      <div className={cn("flex items-center justify-between", className)}>
        {/* Left: icon + label */}
        <div className="flex items-center gap-2 px-2 overflow-hidden min-w-0">
          {icon && <span className="shrink-0 flex items-center">{icon}</span>}
          <span className="font-mono tracking-wide truncate" title={label}>
            {label}
          </span>
        </div>

        {/* Right: extras + pending badge */}
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {extras}
          <NodePendingBadge count={pendingCount} />
        </div>
      </div>
      {children}
    </div>
  );
}
