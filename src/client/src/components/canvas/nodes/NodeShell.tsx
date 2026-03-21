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
//   • The `cn` utility from shadcn is used for class merging.
//   • Never duplicates handles — one target (left) and one source (right) per node.
//     CompositeNode is the only exception; it passes `additionalTargetHandles` for
//     the named in1/in2/in3 inputs.

import React from 'react';
import { Handle, Position, type IsValidConnection } from '@xyflow/react';
import { cn } from '#/lib/utils.js';
import { useCanvasUIStore } from '#/store/useCanvasUIStore.js';
import { NodePendingBadge } from './NodePendingBadge.js';
import type { CanvasNodeData } from '#/domain/canvas/NodeTypes.js';
import { useCanvasInteractionStore } from '#/store/useCanvasInteractionStore.js';

// ============================================================================
// TYPES
// ============================================================================

export interface NodeHandleConfig {
    /** Handle ID — must match a value in HANDLE_IDS. */
    id: string;
    /** Tailwind background color class, e.g. '!bg-amber-500'. Defaults to muted. */
    colorClass?: string;
    /** Tooltip shown on hover. */
    title?: string;
    /** Override inline styles (e.g. for composite named inputs with custom top%). */
    style?: React.CSSProperties;
    /** Make the handle a pill/rect shape instead of a circle (for entity catch-all handles). */
    pill?: boolean;
}

export interface NodeShellProps {
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

    /** Extra Tailwind classes on the outer wrapper. */
    className?: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function NodeShell({
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
    const pendingCount = data.pendingChangeCount ?? 0;

    return (
        <div
            className={cn(
                // Base card style — all nodes share this visual language.
                'card-cinematic-glass overflow-visible transition-all duration-50',
                // Selection ring.
                selected
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background node-selected'
                    : 'node',
                // Soft-delete dimming.
                data.isSoftDeleted && 'opacity-40 grayscale pointer-events-none',
                className,
            )}
            onClick={() => selectNode(data.entityId)}
        >
            {/* ── Primary target handle (left side) ────────────────────────────── */}
            {targetHandle && (
                <Handle
                    id={targetHandle.id}
                    type="target"
                    position={Position.Left}
                    isConnectable={isConnectable}
                    style={targetHandle.style}
                    title={targetHandle.title}
                    className={cn(
                        // Scrubber style: pill shape that extends outside container
                        '!absolute !-left-1.5 !w-3 !h-6 !rounded-[4px] !border-2 !border-border',
                        '!bg-background/90 !backdrop-blur-sm',
                        'transition-all duration-50',
                        'hover:!scale-110 hover:!bg-primary/80 hover:!border-primary hover:!shadow-lg hover:!shadow-primary/25',
                        'focus:!outline-none focus:!ring-2 focus:!ring-primary focus:!ring-offset-1',
                        targetHandle.colorClass ?? '!bg-muted',
                    )}
                />
            )}

            {/* ── Additional named target handles (CompositeNode only) ─────────── */}
            {additionalTargetHandles?.map((h) => (
                <Handle
                    key={h.id}
                    id={h.id}
                    type="target"
                    position={Position.Left}
                    isConnectable={isConnectable}
                    style={h.style}
                    title={h.title}
                    className={cn(
                        // Scrubber style: pill shape that extends outside container
                        '!absolute !-left-1.5 !w-3 !h-6 !rounded-[4px] !border-2 !border-border',
                        '!bg-background/90 !backdrop-blur-sm',
                        'transition-all duration-50',
                        'hover:!scale-110 hover:!bg-primary/80 hover:!border-primary hover:!shadow-lg hover:!shadow-primary/25',
                        'focus:!outline-none focus:!ring-2 focus:!ring-primary focus:!ring-offset-1',
                        h.colorClass ?? '!bg-fuchsia-500/50 !border-fuchsia-400',
                    )}
                />
            ))}

            {/* ── Node content ──────────────────────────────────────────────────── */}
            {children}

            {/* ── Source handle (right side) ─────────────────────────────────────── */}
            {sourceHandle && (
                <Handle
                    id={sourceHandle.id}
                    type="source"
                    position={Position.Right}
                    isConnectable={isConnectable}
                    style={sourceHandle.style}
                    title={sourceHandle.title}
                    className={cn(
                        // Scrubber style: pill shape that extends outside container
                        '!absolute !-right-1.5 !w-3 !h-6 !rounded-[4px] !border-2 !border-border',
                        '!bg-background/90 !backdrop-blur-sm',
                        'transition-all duration-50',
                        'hover:!scale-110 hover:!bg-primary/80 hover:!border-primary hover:!shadow-lg hover:!shadow-primary/25',
                        'focus:!outline-none focus:!ring-2 focus:!ring-primary focus:!ring-offset-1',
                        sourceHandle.colorClass ?? '!bg-muted',
                    )}
                />
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
    return (
        <div className="flex flex-col gap-1 h-16 border-b-2 border-border p-2">
            <div
                className={cn(
                    'flex items-center justify-between ',
                    className,
                )}
            >
                {/* Left: icon + label */}
                <div className="flex items-center gap-2 px-1 overflow-hidden min-w-0">
                    {icon && (
                        <span className="shrink-0 flex items-center">{icon}</span>
                    )}
                    <span className="text-sm font-sans truncate" title={label}>
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