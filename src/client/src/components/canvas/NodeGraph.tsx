import React, { useCallback, useState, useEffect } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    Panel,
    useReactFlow,
} from '@xyflow/react';
import { useDroppable } from '@dnd-kit/core';
import { useShallow } from 'zustand/shallow';
import { Trash2 } from 'lucide-react';

import { SceneNode } from './nodes/SceneNode.js';
import { useNodeStore } from '#/store/useNodeStore.js';
import { useCanvasUIStore } from '#/store/useCanvasUIStore.js';
import { nodeTypes } from './nodes/index.js';
import { EllipsoidMatrix } from '#/components/canvas/EllipsoidMatrix.js';
import { DeleteNodeConfirmationDialog } from './dialogs/DeleteNodeConfirmationDialog.js';
import { NodeContextMenu } from './context-menu/NodeContextMenu.js';
import type { CanvasNode } from '#/domain/canvas/NodeTypes.js';


interface NodeGraphProps {
    /** Active project ID — passed through for context; not used for data fetching here. */
    projectId: string;
    /**
     * Ref forwarded from PipelinePage. Merged with dnd-kit's setNodeRef so
     * that handleDragEnd in PipelinePage can getBoundingClientRect() on the
     * canvas wrapper for accurate screenToWorld coordinate transformation.
     */
    wrapperRef: React.RefObject<HTMLDivElement | null>;
    children?: React.ReactNode;
}

export function NodeGraph({ projectId, wrapperRef, children }: NodeGraphProps) {
    // ── dnd-kit drop zone ──────────────────────────────────────────────────────
    // The canvas itself is a drop target. PipelinePage.handleDragEnd checks
    // event.over.id === 'pipeline-canvas-drop-zone' before spawning a node, so
    // scene/composite droppables don't accidentally trigger asset creation.
    const { setNodeRef: setDropRef } = useDroppable({
        id: 'pipeline-canvas-drop-zone',
    });

    // Merge dnd-kit's ref with the external wrapperRef in a single callback ref.
    // Both must point at the same DOM element:
    //   - setDropRef  → registers this element as a valid dnd-kit drop target
    //   - wrapperRef  → used by PipelinePage for getBoundingClientRect() → screenToWorld
    const setRef = useCallback(
        (el: HTMLDivElement | null) => {
            setDropRef(el);
            (wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        },
        [setDropRef, wrapperRef],
    );

    // ── Store: canvas structure ────────────────────────────────────────────────
    // useShallow prevents NodeGraph from re-rendering when unrelated slices
    // change — e.g. selectedNodeId in useCanvasUIStore or sidebar open state.
    const { nodes, edges, onNodesChange, onEdgesChange, onConnect, deleteNode, softDeletedNodes } =
        useNodeStore(
            useShallow((s) => ({
                nodes: s.nodes,
                edges: s.edges,
                onNodesChange: s.onNodesChange,
                onEdgesChange: s.onEdgesChange,
                onConnect: s.onConnect,
                deleteNode: s.deleteNode,
                softDeletedNodes: s.softDeletedNodes,
            }))
        );

    // ── Store: selection (useCanvasUIStore — single source of truth) ───────────
    // selectNode is stable (Zustand actions don't change between renders).
    const selectNode = useCanvasUIStore((s) => s.selectNode);
    const selectedNodeId = useCanvasUIStore((s) => s.selectedNodeId);
    const isDark = useCanvasUIStore((s) => s.isDark);

    // ── Delete dialog state ─────────────────────────────────────────────────
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [pendingDeleteNode, setPendingDeleteNode] = useState<CanvasNode | null>(null);

    // Get selected node
    const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) ?? null : null;
    const isSelectedNodeSoftDeleted = selectedNodeId ? softDeletedNodes.includes(selectedNodeId) : false;

    // ── Event handlers ─────────────────────────────────────────────────────────
    const handleNodeClick = useCallback(
        (_: React.MouseEvent, node: any) => {
            selectNode(node.id);
            // selectNode also sets rightSidebarOpen: true per useCanvasUIStore definition
        },
        [selectNode],
    );

    const handlePaneClick = useCallback(() => {
        selectNode(null);
    }, [selectNode]);

    // Handle context menu
    const handleNodeContextMenu = useCallback(
        (event: React.MouseEvent, node: CanvasNode) => {
            event.preventDefault();
            selectNode(node.id);
        },
        [selectNode],
    );

    // Handle delete request
    const handleDeleteRequest = useCallback((node: CanvasNode) => {
        setPendingDeleteNode(node);
        const hasConnectedEdges = edges.some(e => e.source === node.id || e.target === node.id);
        if (hasConnectedEdges) {
            setShowDeleteDialog(true);
        } else {
            deleteNode(node.id, true);
            selectNode(null);
        }
    }, [edges, deleteNode, selectNode]);

    // Handle restore - used from TopAssetPanel
    const handleRestore = useCallback((nodeId: string) => {
        useNodeStore.getState().restoreNode(nodeId);
    }, []);

    // Handle confirm delete
    const handleConfirmDelete = useCallback(() => {
        if (pendingDeleteNode) {
            deleteNode(pendingDeleteNode.id, true);
            setPendingDeleteNode(null);
            setShowDeleteDialog(false);
            selectNode(null);
        }
    }, [pendingDeleteNode, deleteNode, selectNode]);

    // Keyboard handler for Delete/Backspace
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!selectedNodeId || !selectedNode) return;
            
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                handleDeleteRequest(selectedNode);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedNodeId, selectedNode, handleDeleteRequest]);

    // Write viewport to store via getState() — not a reactive setter — so pan/
    // zoom ticks don't trigger a React re-render on PipelinePage or NodeGraph.
    const handleMove = useCallback(
        (_: any, viewport: { x: number; y: number; zoom: number; }) => {
            useNodeStore.getState().setViewport(viewport);
        },
        [],
    );

    // Determine if overlay should be shown (based on zoom level)
    const viewport = useNodeStore.getState().viewport;
    const showNodeOverlay = selectedNode && !isSelectedNodeSoftDeleted && viewport.zoom >= 0.3;

    return (
        <div
            ref={setRef}
            className="w-full h-full bg-background relative"
            style={{
                background: 'radial-gradient(circle at 2px 2px, var(--border) 1px, transparent 0)',
                backgroundSize: '24px 24px',
            }}
        >
            <ReactFlow
                nodes={nodes.map(node => {
                    const isSelected = node.id === selectedNodeId;
                    const isSoftDeleted = softDeletedNodes.includes(node.id);
                    
                    if (isSelected || isSoftDeleted) {
                        return {
                            ...node,
                            selected: isSelected,
                            data: {
                                ...node.data,
                                isSoftDeleted,
                            },
                        };
                    }
                    return { ...node, selected: isSelected };
                })}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={handleNodeClick}
                onNodeContextMenu={handleNodeContextMenu}
                onPaneClick={handlePaneClick}
                onMove={handleMove}
                nodeTypes={{
                    ...nodeTypes,
                    scene: (props: any) => (
                        <NodeContextMenu
                            node={props as unknown as CanvasNode}
                            onDelete={handleDeleteRequest}
                            onRestore={() => {}}
                            isSoftDeleted={false}
                        >
                            {React.createElement(nodeTypes.scene, props)}
                        </NodeContextMenu>
                    ),
                    character: (props: any) => (
                        <NodeContextMenu
                            node={props as unknown as CanvasNode}
                            onDelete={handleDeleteRequest}
                            onRestore={() => {}}
                            isSoftDeleted={false}
                        >
                            {React.createElement(nodeTypes.character, props)}
                        </NodeContextMenu>
                    ),
                    location: (props: any) => (
                        <NodeContextMenu
                            node={props as unknown as CanvasNode}
                            onDelete={handleDeleteRequest}
                            onRestore={() => {}}
                            isSoftDeleted={false}
                        >
                            {React.createElement(nodeTypes.location, props)}
                        </NodeContextMenu>
                    ),
                    image: (props: any) => (
                        <NodeContextMenu
                            node={props as unknown as CanvasNode}
                            onDelete={handleDeleteRequest}
                            onRestore={() => {}}
                            isSoftDeleted={false}
                        >
                            {React.createElement(nodeTypes.image, props)}
                        </NodeContextMenu>
                    ),
                    composite: (props: any) => (
                        <NodeContextMenu
                            node={props as unknown as CanvasNode}
                            onDelete={handleDeleteRequest}
                            onRestore={() => {}}
                            isSoftDeleted={false}
                        >
                            {React.createElement(nodeTypes.composite, props)}
                        </NodeContextMenu>
                    ),
                    audio: (props: any) => (
                        <NodeContextMenu
                            node={props as unknown as CanvasNode}
                            onDelete={handleDeleteRequest}
                            onRestore={() => {}}
                            isSoftDeleted={false}
                        >
                            {React.createElement(nodeTypes.audio, props)}
                        </NodeContextMenu>
                    ),
                    metadata: (props: any) => (
                        <NodeContextMenu
                            node={props as unknown as CanvasNode}
                            onDelete={handleDeleteRequest}
                            onRestore={() => {}}
                            isSoftDeleted={false}
                        >
                            {React.createElement(nodeTypes.metadata, props)}
                        </NodeContextMenu>
                    ),
                    render: (props: any) => (
                        <NodeContextMenu
                            node={props as unknown as CanvasNode}
                            onDelete={handleDeleteRequest}
                            onRestore={() => {}}
                            isSoftDeleted={false}
                        >
                            {React.createElement(nodeTypes.render, props)}
                        </NodeContextMenu>
                    ),
                }}
                fitView
                minZoom={0.2}
                colorMode={isDark ? "dark" : "light"}
            >
                <EllipsoidMatrix />

                {children}

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
                            if (n.type === 'batchComposite') return 'var(--muted-foreground)';
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