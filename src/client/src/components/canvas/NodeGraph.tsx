import React, { useCallback } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    Panel,
} from '@xyflow/react';
import { useDroppable } from '@dnd-kit/core';
import { useShallow } from 'zustand/shallow';

import { SceneNode } from './nodes/SceneNode.js';
// import { BatchCompositeNode } from './canvas/nodes/BatchCompositeNode';
// import { GlobalNotifications, PerformanceMetrics } from './GlobalNotifications';
import { useNodeStore } from '#/store/useNodeStore.js';
import { useCanvasUIStore } from '#/store/useCanvasUIStore.js';
import { nodeTypes } from './nodes/index.js';


interface NodeGraphProps {
    /** Active project ID — passed through for context; not used for data fetching here. */
    projectId: string;
    /**
     * Ref forwarded from PipelinePage. Merged with dnd-kit's setNodeRef so
     * that handleDragEnd in PipelinePage can getBoundingClientRect() on the
     * canvas wrapper for accurate screenToWorld coordinate transformation.
     */
    wrapperRef: React.RefObject<HTMLDivElement | null>;
}

export function NodeGraph({ projectId, wrapperRef }: NodeGraphProps) {
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
        [ setDropRef, wrapperRef ],
    );

    // ── Store: canvas structure ────────────────────────────────────────────────
    // useShallow prevents NodeGraph from re-rendering when unrelated slices
    // change — e.g. selectedNodeId in useCanvasUIStore or sidebar open state.
    const { nodes, edges, onNodesChange, onEdgesChange, onConnect } =
        useNodeStore(
            useShallow((s) => ({
                nodes: s.nodes,
                edges: s.edges,
                onNodesChange: s.onNodesChange,
                onEdgesChange: s.onEdgesChange,
                onConnect: s.onConnect,
            }))
        );

    // ── Store: selection (useCanvasUIStore — single source of truth) ───────────
    // selectNode is stable (Zustand actions don't change between renders).
    const selectNode = useCanvasUIStore((s) => s.selectNode);

    // ── Event handlers ─────────────────────────────────────────────────────────
    const handleNodeClick = useCallback(
        (_: React.MouseEvent, node: any) => {
            selectNode(node.id);
            // selectNode also sets rightSidebarOpen: true per useCanvasUIStore definition
        },
        [ selectNode ],
    );

    const handlePaneClick = useCallback(() => {
        selectNode(null);
    }, [ selectNode ]);

    // Write viewport to store via getState() — not a reactive setter — so pan/
    // zoom ticks don't trigger a React re-render on PipelinePage or NodeGraph.
    const handleMove = useCallback(
        (_: any, viewport: { x: number; y: number; zoom: number; }) => {
            useNodeStore.getState().setViewport(viewport);
        },
        [],
    );

    return (
        <div
            ref={ setRef }
            className="w-full h-full bg-background relative"
            style={ {
                background: 'radial-gradient(circle at 2px 2px, hsl(var(--border)) 1px, transparent 0)',
                backgroundSize: '24px 24px',
            } }
        >
            {/* <GlobalNotifications /> */ }

            <ReactFlow
                nodes={ nodes }
                edges={ edges }
                onNodesChange={ onNodesChange }
                onEdgesChange={ onEdgesChange }
                onConnect={ onConnect }
                onNodeClick={ handleNodeClick }
                onPaneClick={ handlePaneClick }
                onMove={ handleMove }
                nodeTypes={ nodeTypes }
                fitView
                className="dark"
                minZoom={ 0.2 }
            >
                <Panel
                    position="top-left"
                    className="bg-card/80 backdrop-blur-md border border-border p-2 rounded-md shadow-sm"
                >
                    <div className="text-[10px] font-mono flex flex-col gap-1.5">
                        <span className="text-muted-foreground uppercase tracking-wider font-bold">
                            Pipeline Status
                        </span>
                        <div className="flex gap-4">
                            <span className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-success" />
                                COMPLETE (1)
                            </span>
                            <span className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                GENERATING (1)
                            </span>
                            <span className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-destructive" />
                                FAILED (1)
                            </span>
                        </div>
                    </div>
                </Panel>

                <Controls showInteractive={ false } className="!bg-card border-border" />

                <MiniMap
                    zoomable
                    pannable
                    nodeColor={ (n) => {
                        if (n.type === 'batchComposite') return 'hsl(var(--muted-foreground))';
                        const d = n.data as any;
                        if (d.status === 'complete') return 'hsl(var(--success))';
                        if (d.status === 'generating') return 'hsl(var(--primary))';
                        if (d.status === 'error') return 'hsl(var(--destructive))';
                        return 'hsl(var(--muted))';
                    } }
                    className="!bg-card border-border border rounded-md overflow-hidden"
                    maskColor="hsl(var(--background)/0.7)"
                />
            </ReactFlow>

            {/* <PerformanceMetrics /> */ }
        </div>
    );
}