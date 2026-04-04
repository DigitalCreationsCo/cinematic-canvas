// src/client/src/components/canvas/NodeGraph.tsx
//
// PERFORMANCE OPTIMIZATION SUMMARY:
// ================================
// This component implements several performance optimizations for handling 1000s of nodes:
//
// 1. MEMOIZED NODE RENDERING: renderNodes uses selective memoization to preserve
//    object identity for unchanged nodes, allowing React Flow to skip re-renders.
//
// 2. STABLE SELECTORS: All store selectors use useShallow for shallow comparison,
//    preventing re-renders when unrelated state changes.
//
// 3. CONTROLLED FLOW: Uses React Flow's controlled flow with onNodesChange/onEdgesChange
//    for efficient batch updates.
//
// 4. HOOK DEPS OPTIMIZATION: Callbacks are carefully memoized with minimal deps.
//
// 5. EDGE VISIBILITY CACHING: useEdgeVisibility memoizes edge transformations.
//
// ================================
// MEMOIZATION MARKERS:
// - PERF-MEMO: useMemo for expensive computations
// - PERF-CALLBACK: useCallback for stable function references
// - PERF-SELECTOR: Optimized store selectors
// ============================================================================

import React, { useCallback, useState, useEffect, useMemo, useRef, memo } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useReactFlow,
    type EdgeChange,
    type Node,
} from '@xyflow/react';
import { useDroppable } from '@dnd-kit/core';
import { useShallow } from 'zustand/shallow';

import { useNodeStore } from '#client/store/useNodeStore.js';
import { useCanvasUIStore, selectNodeGraphRightOffset } from '#client/store/useCanvasUIStore.js';
import { useCanvasConnections } from '#client/hooks/useCanvasConnections.js';
import { useEdgeVisibility } from '#client/hooks/useEdgeVisibility.js';
import { nodeTypes } from './nodes/index.js';
import { EllipsoidMatrix } from '#client/components/canvas/EllipsoidMatrix.js';
import { DeleteNodeConfirmationDialog } from './dialogs/DeleteNodeConfirmationDialog.js';
import { NodeContextMenu } from './context-menu/NodeContextMenu.js';
import { CanvasContextMenu } from './context-menu/CanvasContextMenu.js';
import { PendingChangesBar } from './PendingChangesBar.js';
import type { CanvasNode } from '#client/domain/canvas/NodeTypes.js';
import { GRID_SIZE } from '#client/domain/canvas/CoordinateSystem.js';
import { useCanvasInteractionStore } from '#client/store/useCanvasInteractionStore.js';
import { MessagesSidebar } from '#client/components/canvas/panels/MessagesSidebar.js';

// Component to handle initial viewport positioning
function ViewportInitializer({ contextId }: { contextId: string }) {
    const { setViewport } = useReactFlow();
    const nodes = useNodeStore((s) => s.nodes);
    const hasInitialized = useRef(false);
    const lastContextId = useRef(contextId);

    // Reset initialization state when project changes
    useEffect(() => {
        if (lastContextId.current !== contextId) {
            hasInitialized.current = false;
            lastContextId.current = contextId;
        }
    }, [contextId]);

    useEffect(() => {
        if (hasInitialized.current || nodes.length === 0) return;

        // Try to find the metadata node
        const metadataNode = nodes.find(n => n.type === 'metadata');
        if (metadataNode) {
            hasInitialized.current = true;
            // Set zoom so node takes ~10% of width (assumes ~1920px screen, 344px node width -> zoom ~0.6)
            // Position node in top-left with padding
            const targetZoom = 0.4;
            const paddingX = 80;
            const paddingY = 80;

            setViewport({
                x: -metadataNode.position.x * targetZoom + paddingX,
                y: -metadataNode.position.y * targetZoom + paddingY,
                zoom: targetZoom
            });
        }
    }, [nodes, setViewport]);

    return null;
}

interface CanvasContextMenuHandlerProps {
    isOpen: boolean;
    screenPosition: { x: number; y: number };
    onPositionUpdate: (pos: { x: number; y: number }) => void;
}

function CanvasContextMenuHandler({ isOpen, screenPosition, onPositionUpdate }: CanvasContextMenuHandlerProps) {
    const { screenToFlowPosition } = useReactFlow();
    const prevPosition = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (isOpen && (screenPosition.x !== prevPosition.current.x || screenPosition.y !== prevPosition.current.y)) {
            const canvasPos = screenToFlowPosition({ x: screenPosition.x, y: screenPosition.y });
            onPositionUpdate(canvasPos);
            prevPosition.current = screenPosition;
        }
    }, [isOpen, screenPosition, screenToFlowPosition, onPositionUpdate]);

    return null;
}


export interface NodeGraphProps {
    projectId?: string;
    worldId?: string;
    onNodeClick?: (nodeId: string) => void;
    onPaneClick?: () => void;
    onFileDrop?: (event: DragEvent) => void;
    onNodeDragStop?: (event: React.MouseEvent, node: CanvasNode, nodes: CanvasNode[]) => void;
    wrapperRef?: React.RefObject<HTMLDivElement | null>;
}

export function NodeGraph({ projectId, worldId, wrapperRef, onFileDrop, onNodeDragStop }: NodeGraphProps) {

    const contextId = projectId || worldId;

    // ── dnd-kit drop zone ──────────────────────────────────────────────────────
    // PERF-CALLBACK: useCallback for stable reference
    const { setNodeRef: setDropRef } = useDroppable({
        id: 'pipeline-canvas-drop-zone',
    });

    // Merge dnd-kit and external refs onto the same DOM element.
    // PERF-CALLBACK: Stable callback reference
    const setRef = useCallback(
        (el: HTMLDivElement | null) => {
            setDropRef(el);
            (wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        },
        [setDropRef, wrapperRef],
    );

    // ── Store: canvas structure ────────────────────────────────────────────────
    // `onConnect` is intentionally excluded here — the typed useCanvasConnections
    // hook replaces it. Including it would cause two competing connect handlers.
    // PERF-SELECTOR: useShallow prevents re-renders on unrelated state changes
    const { nodes, edges, onNodesChange, onEdgesChange, deleteNode, softDeletedNodes } =
        useNodeStore(
            useShallow((s) => ({
                nodes: s.nodes,
                edges: s.edges,
                onNodesChange: s.onNodesChange,
                onEdgesChange: s.onEdgesChange,
                deleteNode: s.deleteNode,
                softDeletedNodes: s.softDeletedNodes,
            })),
        );

    // ── Typed connection handlers ──────────────────────────────────────────
    // onConnect    → validates against CONNECTION_RULES, creates pending edge
    // isValidConnection → live drag-time guard (dims incompatible handles)
    // markEdgePendingRemove → called when user deletes an edge
    // PERF-MEMO: nodes dependency is stable through useShallow selector
    const { onConnect, isValidConnection, markEdgePendingRemove } =
        useCanvasConnections(nodes);

    // ── Edge visibility ────────────────────────────────────────────────────────
    // Derives `hidden` on every edge based on:
    //   • selected node   → show only that node's connected edges
    //   • no selection    → apply global toggle (all | none)
    // PERF-MEMO: Already memoized in useEdgeVisibility hook
    const visibleEdges = useEdgeVisibility(edges);

    // ── Store: selection ──────────────────────────────────────────────────────
    // PERF-SELECTOR: Individual selectors for granular re-renders
    const selectNode = useCanvasUIStore((s) => s.selectNode);
    const setLastTouchedNode = useCanvasUIStore((s) => s.setLastTouchedNode);
    const selectedNodeId = useCanvasUIStore((s) => s.selectedNodeId);
    const lastTouchedNodeId = useCanvasUIStore((s) => s.lastTouchedNodeId);
    const isDark = useCanvasUIStore((s) => s.isDark);
    const snapToGrid = useCanvasUIStore((s) => s.snapToGrid);
    const deleteDialogOpen = useCanvasUIStore((s) => s.deleteDialogOpen);
    const pendingDeleteNodeId = useCanvasUIStore((s) => s.pendingDeleteNodeId);
    const messagesSidebarOpen = useCanvasUIStore((s) => s.messagesSidebarOpen);
    const openDeleteDialog = useCanvasUIStore(s => s.openDeleteDialog);
    const closeDeleteDialog = useCanvasUIStore(s => s.closeDeleteDialog);
    const nodeGraphRightOffset = useCanvasUIStore(selectNodeGraphRightOffset);

    // PERF-MEMO: Selected node lookup - only recompute when nodes or selectedNodeId changes
    const selectedNode = useMemo(() =>
        selectedNodeId
            ? nodes.find((n) => n.id === selectedNodeId) ?? null
            : null,
        [nodes, selectedNodeId]
    );

    const isSelectedNodeSoftDeleted = selectedNodeId
        ? softDeletedNodes.includes(selectedNodeId)
        : false;

    // PERF-MEMO: Pending delete node lookup
    const pendingDeleteNode = useMemo(() =>
        pendingDeleteNodeId
            ? nodes.find((n) => n.id === pendingDeleteNodeId) ?? null
            : null,
        [nodes, pendingDeleteNodeId]
    );

    // ── Event handlers ─────────────────────────────────────────────────────────

    const handleNodeClick = useCallback(
        (_: React.MouseEvent, node: any) => {
            selectNode(node.id);
            setLastTouchedNode(node.id);
            closeMenuRef.current();
        },
        [selectNode, setLastTouchedNode],
    );

    const handlePaneClick = useCallback(() => {
        selectNode(null);
        closeMenuRef.current();
    }, [selectNode]);

    const handleNodeContextMenu = useCallback(
        (event: any, node: CanvasNode) => {
            event.preventDefault();
            event.stopPropagation();
            selectNode(node.id);
        },
        [selectNode],
    );

    // ── Canvas context menu (right-click on empty space) ───────────────────────
    const closeMenuRef = React.useRef<() => void>(() => { });
    const [canvasContextMenu, setCanvasContextMenu] = useState<{
        open: boolean;
        position: { x: number; y: number };
        canvasPosition: { x: number; y: number };
    }>({ open: false, position: { x: 0, y: 0 }, canvasPosition: { x: 0, y: 0 } });

    const handlePaneContextMenu = useCallback(
        (event: MouseEvent | React.MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            const mouseEvent = event as React.MouseEvent;
            setCanvasContextMenu((prev) => ({
                ...prev,
                open: true,
                position: { x: mouseEvent.clientX, y: mouseEvent.clientY },
            }));
        },
        [],
    );

    const updateCanvasPosition = useCallback((canvasPos: { x: number; y: number }) => {
        setCanvasContextMenu((prev) => ({
            ...prev,
            canvasPosition: canvasPos,
        }));
    }, []);

    const closeCanvasContextMenu = useCallback(() => {
        setCanvasContextMenu((prev) => ({ ...prev, open: false }));
    }, []);

    // Keep ref in sync for use in handlePaneClick
    React.useEffect(() => {
        closeMenuRef.current = closeCanvasContextMenu;
    }, [closeCanvasContextMenu]);

    // ── Edge change handler ────────────────────────────────────────────────────
    // Intercepts `type: 'remove'` changes before they reach the store.
    // Removes are routed through markEdgePendingRemove so that:
    //   • Live edges become red-dashed pending-remove (kept visible until Save)
    //   • Pending-add edges are deleted outright (as if never drawn)
    // All other change types (select, position) flow through to the store normally.
    const handleEdgesChange = useCallback(
        (changes: EdgeChange[]) => {
            const removes = changes.filter(
                (c): c is EdgeChange & { type: 'remove'; id: string } => c.type === 'remove',
            );
            const others = changes.filter((c) => c.type !== 'remove');

            removes.forEach((c) => markEdgePendingRemove(c.id));

            if (others.length > 0) onEdgesChange(others);
        },
        [onEdgesChange, markEdgePendingRemove],
    );

    // ── Node delete ───────────────────────────────────────────────────────────
    const handleDeleteRequest = useCallback(
        (node: CanvasNode) => {
            const hasConnectedEdges = edges.some(
                (e) => e.source === node.id || e.target === node.id,
            );
            const canPermanentDelete = node.type === 'scene' || node.type === 'character' || node.type === 'location';
            if (hasConnectedEdges || canPermanentDelete) {
                openDeleteDialog(node.id);
            } else {
                deleteNode(node.id, true);
                selectNode(null);
            }
        },
        [edges, openDeleteDialog, deleteNode, selectNode]
    );

    const handleConfirmDelete = useCallback(() => {
        if (pendingDeleteNode) {
            deleteNode(pendingDeleteNode.id, true);
            closeDeleteDialog();
            selectNode(null);
        }
    }, [pendingDeleteNode, deleteNode, selectNode, closeDeleteDialog]);

    // ── Keyboard delete ────────────────────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!selectedNodeId || !selectedNode) return;
            const target = e.target as HTMLElement;
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            ) return;

            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode.type !== 'metadata') {
                e.preventDefault();
                handleDeleteRequest(selectedNode);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedNodeId, selectedNode, handleDeleteRequest]);

    // Write viewport to store outside of React render (no re-render on pan/zoom).
    const handleMove = useCallback(
        (_: any, viewport: { x: number; y: number; zoom: number }) => {
            useNodeStore.getState().setViewport(viewport);
        },
        [],
    );

    const wrappedNodeTypes = useMemo(
        () => buildWrappedNodeTypes(handleDeleteRequest),
        [handleDeleteRequest]
    );

    const handleNativeDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (onFileDrop) {
            onFileDrop(e.nativeEvent);
        }
    }, [onFileDrop]);

    const renderNodes = useMemo(() => {
        return nodes.map((node) => {
            const isSelected = node.id === selectedNodeId;
            const isLastTouched = node.id === lastTouchedNodeId;
            const isActive = isSelected || node.dragging;
            const isSoftDeleted = softDeletedNodes.includes(node.id);
            const zIndex = isActive ? 1000 : isLastTouched ? 999 : (node.zIndex ?? 0);

            // Return a new object ONLY if properties have actually changed,
            // preserving object identity so React Flow can skip re-renders.
            if (
                node.selected !== isSelected ||
                node.zIndex !== zIndex ||
                (node.data as any).isSoftDeleted !== isSoftDeleted
            ) {
                return {
                    ...node,
                    selected: isSelected,
                    zIndex,
                    data: { ...node.data, isSoftDeleted },
                };
            }
            return node;
        });
    }, [nodes, selectedNodeId, lastTouchedNodeId, softDeletedNodes]);

    if (!contextId) {
        return <div>Loading...</div>;
    }

    return (
        <div
            ref={setRef}
            className="absolute inset-0 bg-background"
            style={{
                background: 'radial-gradient(circle at 2px 2px, var(--border) 1px, transparent 0)',
                backgroundSize: '30px 30px',
            }}
            onDrop={handleNativeDrop}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            <ReactFlow
                nodes={renderNodes}
                // ── Edges: visibility-filtered ──────────────────────────────────────
                // `visibleEdges` adds `hidden: boolean` to each edge based on the
                // selected node and the global edge-visibility toggle.
                edges={visibleEdges}
                onNodesChange={onNodesChange}
                // ── Edge changes: removes intercepted for pending-remove flow ────────
                onEdgesChange={handleEdgesChange}
                onEdgeClick={(_, edge) => {
                    useNodeStore.getState().onEdgesChange([{ type: 'select', id: edge.id, selected: true }]);
                }}
                // ── Connect: typed validation and pending edge creation ──────────────
                onConnect={onConnect}
                onConnectStart={(_, { nodeId }) => {
                    if (nodeId) useCanvasInteractionStore.getState().setInitiatorNodeId(nodeId);
                }}
                onConnectEnd={() => {
                    // Small delay or cleanup to ensure onConnect processes first
                    setTimeout(() => useCanvasInteractionStore.getState().setInitiatorNodeId(null), 100);
                }}
                // ── Live drag validation: dims incompatible handles ──────────────────
                isValidConnection={isValidConnection as any}
                onNodeClick={handleNodeClick}
                onNodeContextMenu={handleNodeContextMenu}
                onPaneClick={handlePaneClick}
                onPaneContextMenu={handlePaneContextMenu}
                onMove={handleMove}
                onNodeDragStop={onNodeDragStop}
                snapToGrid={snapToGrid}
                snapGrid={[GRID_SIZE, GRID_SIZE]}
                nodeTypes={wrappedNodeTypes}
                minZoom={0.12}
                colorMode={isDark ? 'dark' : 'light'}
                connectionLineStyle={{ stroke: '#fbbf24', strokeWidth: 2, strokeDasharray: '2 6', strokeLinecap: 'round' }}
            >
                <ViewportInitializer contextId={contextId} />
                <CanvasContextMenuHandler
                    isOpen={canvasContextMenu.open}
                    screenPosition={canvasContextMenu.position}
                    onPositionUpdate={updateCanvasPosition}
                />
                <EllipsoidMatrix />

                {/* Pending changes bar — appears when there are unsaved connection changes */}
                <PendingChangesBar projectId={contextId!} />

                <div
                    className="absolute flex flex-col items-end gap-2 z-50"
                    style={{ bottom: 16, left: 280 }}
                >
                    <Controls
                        showInteractive={false}
                        orientation="horizontal"
                        className="bg-card border-border !static !m-0 !mr-auto"
                    />
                    <MiniMap
                        zoomable
                        pannable
                        nodeColor={(n) => {
                            if (n.type === 'composite') return 'var(--muted-foreground)';
                            const d = n.data as any;
                            if (d.status === 'complete') return 'var(--primary)';
                            if (d.status === 'generating') return 'var(--secondary)';
                            if (d.status === 'error') return 'var(--destructive)';
                            return 'var(--muted-foreground)';
                        }}
                        className="overflow-hidden !static !m-0"
                        maskColor="var(--border-glass)"
                    />
                </div>
            </ReactFlow>

            <DeleteNodeConfirmationDialog
                open={deleteDialogOpen}
                onOpenChange={(open) => !open && closeDeleteDialog()}
                node={pendingDeleteNode}
            />

            <CanvasContextMenu
                contextType={projectId ? 'project' : 'world'}
                projectId={projectId}
                worldId={worldId}
                position={canvasContextMenu.position}
                canvasPosition={canvasContextMenu.canvasPosition}
                open={canvasContextMenu.open}
                onClose={closeCanvasContextMenu}
            />
        </div>
    );
}

// ── Wrapped node types ────────────────────────────────────────────────────────
// Moved out of the JSX to avoid a fresh object on every render, but keeps
// handleDeleteRequest in scope via the factory function.

function buildWrappedNodeTypes(
    handleDeleteRequest: (node: CanvasNode) => void,
) {
    const wrap = (type: keyof typeof import('./nodes/index.js').nodeTypes) =>
        (props: any) => {
            const node = props as unknown as CanvasNode;
            return (
                <NodeContextMenu
                    node={node}
                    onDelete={handleDeleteRequest}
                    onRestore={() => { }}
                    isSoftDeleted={false}
                >
                    {React.createElement((nodeTypes as any)[type], props)}
                </NodeContextMenu>
            );
        };

    return {
        ...nodeTypes,
        scene: wrap('scene'),
        character: wrap('character'),
        location: wrap('location'),
        image: wrap('image'),
        composite: wrap('composite'),
        audio: wrap('audio'),
        metadata: wrap('metadata'),
        render: wrap('render'),
    };
}