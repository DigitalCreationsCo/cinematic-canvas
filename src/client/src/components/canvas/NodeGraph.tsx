// src/client/src/components/canvas/NodeGraph.tsx
import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    Panel,
    useReactFlow,
    type EdgeChange,
    type Node,
} from '@xyflow/react';
import { useDroppable } from '@dnd-kit/core';
import { useShallow } from 'zustand/shallow';
import { Trash2 } from 'lucide-react';

import { useNodeStore } from '#/store/useNodeStore.js';
import { useCanvasUIStore } from '#/store/useCanvasUIStore.js';
import { useCanvasConnections } from '#/hooks/useCanvasConnections.js';
import { useEdgeVisibility } from '#/hooks/useEdgeVisibility.js';
import { nodeTypes } from './nodes/index.js';
import { EllipsoidMatrix } from '#/components/canvas/EllipsoidMatrix.js';
import { DeleteNodeConfirmationDialog } from './dialogs/DeleteNodeConfirmationDialog.js';
import { NodeContextMenu } from './context-menu/NodeContextMenu.js';
import { PendingChangesBar } from './PendingChangesBar.js';
import type { CanvasNode } from '#/domain/canvas/NodeTypes.js';
import { GRID_SIZE } from '#/domain/canvas/CoordinateSystem.js';
import { useCanvasInteractionStore } from '#/store/useCanvasInteractionStore.js';

// Component to handle initial viewport positioning
function ViewportInitializer({ projectId }: { projectId: string }) {
    const { setViewport } = useReactFlow();
    const nodes = useNodeStore((s) => s.nodes);
    const hasInitialized = useRef(false);
    const lastProjectId = useRef(projectId);

    // Reset initialization state when project changes
    useEffect(() => {
        if (lastProjectId.current !== projectId) {
            hasInitialized.current = false;
            lastProjectId.current = projectId;
        }
    }, [projectId]);

    useEffect(() => {
        if (hasInitialized.current || nodes.length === 0) return;

        // Try to find the metadata node
        const metadataNode = nodes.find(n => n.type === 'metadata');
        if (metadataNode) {
            hasInitialized.current = true;
            // Set zoom so node takes ~10% of width (assumes ~1920px screen, 344px node width -> zoom ~0.6)
            // Position node in top-left with padding
            const targetZoom = 0.6;
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


interface NodeGraphProps {
    /** Active project ID — passed through for context and pending-changes save. */
    projectId: string;
    /**
     * Ref forwarded from ProjectBuilderCanvas. Merged with dnd-kit's setNodeRef so that
     * handleDragEnd in ProjectBuilderCanvas can getBoundingClientRect() on the canvas
     * wrapper for accurate screenToWorld coordinate transformation.
     */
    wrapperRef: React.RefObject<HTMLDivElement | null>;
    /** Handler for native file drop events (image files onto canvas). */
    onFileDrop?: (event: DragEvent) => void;
    children?: React.ReactNode;
}

export function NodeGraph({ projectId, wrapperRef, onFileDrop, children }: NodeGraphProps) {
    // ── dnd-kit drop zone ──────────────────────────────────────────────────────
    const { setNodeRef: setDropRef } = useDroppable({
        id: 'pipeline-canvas-drop-zone',
    });

    // Merge dnd-kit and external refs onto the same DOM element.
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

    // ── Typed connection handlers ──────────────────────────────────────────────
    // onConnect    → validates against CONNECTION_RULES, creates pending edge
    // isValidConnection → live drag-time guard (dims incompatible handles)
    // markEdgePendingRemove → called when user deletes an edge
    const { onConnect, isValidConnection, markEdgePendingRemove } =
        useCanvasConnections(nodes);

    // ── Edge visibility ────────────────────────────────────────────────────────
    // Derives `hidden` on every edge based on:
    //   • selected node   → show only that node's connected edges
    //   • no selection    → apply global toggle (all | none)
    const visibleEdges = useEdgeVisibility(edges);

    // ── Store: selection ──────────────────────────────────────────────────────
    const selectNode = useCanvasUIStore((s) => s.selectNode);
    const setLastTouchedNode = useCanvasUIStore((s) => s.setLastTouchedNode);
    const selectedNodeId = useCanvasUIStore((s) => s.selectedNodeId);
    const lastTouchedNodeId = useCanvasUIStore((s) => s.lastTouchedNodeId);
    const isDark = useCanvasUIStore((s) => s.isDark);
    const snapToGrid = useCanvasUIStore((s) => s.snapToGrid);

    // ── Delete dialog state ────────────────────────────────────────────────────
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [pendingDeleteNode, setPendingDeleteNode] = useState<CanvasNode | null>(null);

    const selectedNode = selectedNodeId
        ? nodes.find((n) => n.id === selectedNodeId) ?? null
        : null;
    const isSelectedNodeSoftDeleted = selectedNodeId
        ? softDeletedNodes.includes(selectedNodeId)
        : false;

    // ── Event handlers ─────────────────────────────────────────────────────────

    const handleNodeClick = useCallback(
        (_: React.MouseEvent, node: any) => {
            selectNode(node.id);
            setLastTouchedNode(node.id);
        },
        [selectNode, setLastTouchedNode],
    );

    const handlePaneClick = useCallback(() => { selectNode(null); }, [selectNode]);

    const handleNodeContextMenu = useCallback(
        (event: React.MouseEvent, node: CanvasNode) => {
            event.preventDefault();
            selectNode(node.id);
        },
        [selectNode],
    );

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
            setPendingDeleteNode(node);
            const hasConnectedEdges = edges.some(
                (e) => e.source === node.id || e.target === node.id,
            );
            if (hasConnectedEdges) {
                setShowDeleteDialog(true);
            } else {
                deleteNode(node.id, true);
                selectNode(null);
            }
        },
        [edges, deleteNode, selectNode],
    );

    const handleConfirmDelete = useCallback(() => {
        if (pendingDeleteNode) {
            deleteNode(pendingDeleteNode.id, true);
            setPendingDeleteNode(null);
            setShowDeleteDialog(false);
            selectNode(null);
        }
    }, [pendingDeleteNode, deleteNode, selectNode]);

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

            if (e.key === 'Delete' || e.key === 'Backspace') {
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

    const viewport = useNodeStore.getState().viewport;
    const canDeleteSelectedNode = selectedNode?.type !== 'metadata';
    const showNodeOverlay =
        selectedNode &&
        !isSelectedNodeSoftDeleted &&
        viewport.zoom >= 0.3 &&
        canDeleteSelectedNode;

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

    return (
        <div
            ref={setRef}
            className="w-full h-full bg-background relative"
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
                onMove={handleMove}
                snapToGrid={snapToGrid}
                snapGrid={[GRID_SIZE, GRID_SIZE]}
                nodeTypes={wrappedNodeTypes}
                minZoom={0.2}
                colorMode={isDark ? 'dark' : 'light'}
            >
                <ViewportInitializer projectId={projectId} />
                <EllipsoidMatrix />

                {children}

                {/* Delete overlay — shown when a non-metadata node is selected */}
                {showNodeOverlay && (
                    <Panel position="top-right" className="m-4">
                        <button
                            onClick={() => selectedNode && handleDeleteRequest(selectedNode)}
                            className="bg-destructive text-white p-2 rounded-full shadow-lg hover:bg-destructive/90 hover:scale-110 transition-all"
                            title="Delete node"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </Panel>
                )}

                {/* Pending changes bar — appears when there are unsaved connection changes */}
                <PendingChangesBar projectId={projectId} />

                <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 z-50">
                    <Controls
                        showInteractive={false}
                        orientation="horizontal"
                        className="bg-card border-border !static !m-0"
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
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
                node={pendingDeleteNode}
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
        (props: any) => (
            <NodeContextMenu
                node={props as unknown as CanvasNode}
                onDelete={handleDeleteRequest}
                onRestore={() => { }}
                isSoftDeleted={false}
            >
                {React.createElement((nodeTypes as any)[type], props)}
            </NodeContextMenu>
        );

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