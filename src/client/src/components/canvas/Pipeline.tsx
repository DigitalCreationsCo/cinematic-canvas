import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useParams } from 'wouter';
import { useShallow } from 'zustand/shallow';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '#/components/ui/resizable.js';

import { TopAssetPanel } from '#/components/canvas/panels/TopAssetPanel.js';
import { PropertiesPanel } from '#/components/PropertiesPanel.js';
import { NodeGraph } from '#/components/canvas/NodeGraph.js';

import { usePipelineEvents } from '#/hooks/use-pipeline-events.js';
import { useCanvasPipelineSync } from '#/store/useCanvasPipelineSync.js';
import { useNodeStore } from '#/store/useNodeStore.js';
import { NodeFactory } from '#/domain/canvas/NodeFactory.js';
import { screenToWorld } from '#/domain/canvas/CoordinateSystem.js';
import { debouncedPersistLayout } from '#/store/middleware/indexedDBStorage.js';

import ProjectDashboard from '#/pages/ProjectDashboard.js';
import { CanvasToolbar } from '#/components/canvas/toolbar/CanvasToolbar.js';
import { LeftSidebar } from '#/components/canvas/panels/LeftSidebar.js';
import { useCanvasUIStore } from '#/store/useCanvasUIStore.js';

// ─────────────────────────────────────────────────────────────────────────────
// Demo seed data
//
// Only applied when projectId === 'demo-project' (route has no real UUID).
// For all real project routes, the canvas is populated exclusively via the
// SSE pipeline events that usePipelineEvents processes into the store, which
// useCanvasPipelineSync then reflects onto the canvas.
//
// Each node carries the full CanvasNodeData shape so NodeFactory invariants
// are respected, plus additive presentation fields that SceneNode reads.
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_PROJECT_ID = 'demo-project';

const DEMO_NODES = [
    {
        id: 'scene-1', type: 'scene', position: { x: 80, y: 120 },
        data: {
            entityId: 'scene-1', contextId: DEMO_PROJECT_ID,
            contextType: 'project' as const, scope: 'project' as const,
            isLocked: false, pipelineSelected: true, collapsed: false, idxVersion: 1,
            label: 'SCENE 01: The Approach', status: 'complete', progress: 100,
            description: 'Establishing shot of the city at night, rain pouring.',
            time: '0:00 - 0:06', characters: [], location: 'loc-1',
        },
    },
    {
        id: 'scene-2', type: 'scene', position: { x: 500, y: 120 },
        data: {
            entityId: 'scene-2', contextId: DEMO_PROJECT_ID,
            contextType: 'project' as const, scope: 'project' as const,
            isLocked: false, pipelineSelected: true, collapsed: false, idxVersion: 1,
            label: 'SCENE 02: Cafe Interior', status: 'generating', progress: 45,
            description: 'Close up on hacker terminal. Neon lights reflecting.',
            time: '0:06 - 0:12', characters: [ 'char-1' ], location: 'loc-2',
        },
    },
    {
        id: 'composite-1', type: 'batchComposite', position: { x: 500, y: 450 },
        data: {
            entityId: 'composite-1', contextId: DEMO_PROJECT_ID,
            contextType: 'project' as const, scope: 'project' as const,
            isLocked: false, pipelineSelected: true, collapsed: false, idxVersion: 1,
        },
    },
    {
        id: 'scene-3', type: 'scene', position: { x: 920, y: 120 },
        data: {
            entityId: 'scene-3', contextId: DEMO_PROJECT_ID,
            contextType: 'project' as const, scope: 'project' as const,
            isLocked: false, pipelineSelected: true, collapsed: false, idxVersion: 1,
            label: 'SCENE 03: The Breach', status: 'pending', progress: 0,
            description: 'Terminal turns red, alarms blare, rapid pan.',
            time: '0:12 - 0:18', characters: [ 'char-1' ], location: 'loc-2',
        },
    },
    {
        id: 'scene-4', type: 'scene', position: { x: 1340, y: 120 },
        data: {
            entityId: 'scene-4', contextId: DEMO_PROJECT_ID,
            contextType: 'project' as const, scope: 'project' as const,
            isLocked: false, pipelineSelected: true, collapsed: false, idxVersion: 1,
            label: 'SCENE 04: Escape', status: 'error', progress: 10,
            description: 'Running down the alleyway, tracking shot.',
            time: '0:18 - 0:24', characters: [ 'char-1' ], location: 'loc-3',
            errorMessage: 'Generation failed: GPU Timeout on upscale',
        },
    },
];

const DEMO_EDGES = [
    { id: 'e1-2', source: 'scene-1', target: 'scene-2', animated: true, style: { stroke: 'var(--success)' } },
    { id: 'e1-c1', source: 'scene-1', target: 'composite-1', type: 'step', style: { stroke: 'var(--muted-foreground)', strokeDasharray: '4 4' } },
    { id: 'e2-3', source: 'scene-2', target: 'scene-3', animated: true, style: { stroke: 'var(--primary)' } },
    { id: 'e3-4', source: 'scene-3', target: 'scene-4' },
];

export default function PipelinePage() {

    // projectId from route; falls back to demo slug when accessed standalone.
    const { projectId = DEMO_PROJECT_ID } = useParams<{ projectId: string; }>();

    const isDemo = projectId === DEMO_PROJECT_ID;

    // Primitive mobile guard — mirrors ProjectBuilderCanvas.
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    // ── SSE pipeline events ───────────────────────────────────────────────────
    // This is the ONLY place SSE is connected. usePipelineEvents manages the
    // EventSource lifecycle (open, reconnect, auth headers, cleanup) and writes
    // parsed events into useProjectStore / usePipelineStore / useCanvasUIStore.
    // Passing null for demo mode disables the SSE connection entirely.
    usePipelineEvents({ projectId: isDemo ? null : projectId });

    // ── Canvas ↔ store bridge ─────────────────────────────────────────────────
    // Subscribes to store mutations produced by usePipelineEvents and reflects
    // them as node/edge operations on the ReactFlow canvas. Passing an empty
    // string for demo mode is a no-op inside the hook (guarded on projectId).
    useCanvasPipelineSync(isDemo ? '' : projectId);

    // ── Drag state ────────────────────────────────────────────────────────────
    const [ activeDragId, setActiveDragId ] = useState<string | null>(null);
    const [ activeDragData, setActiveDragData ] = useState<{ type: string; name: string; } | null>(null);

    // Forwarded to NodeGraph so handleDragEnd can call getBoundingClientRect()
    // on the canvas element for the screenToWorld coordinate transform.
    const reactFlowWrapperRef = useRef<HTMLDivElement>(null);

    // Narrow store slice — prevents PipelinePage from re-rendering on viewport
    // pans or selectedNodeId changes (handled by child components respectively).
    const { nodes, setNodes, setEdges, addNode } = useNodeStore(
        useShallow((s) => ({
            nodes: s.nodes,
            setNodes: s.setNodes,
            setEdges: s.setEdges,
            addNode: s.addNode,
        }))
    );

    const selectedNodeId = useCanvasUIStore((s) => s.selectedNodeId);

    // ── Demo seed ─────────────────────────────────────────────────────────────
    // Guards on both isDemo and nodes.length === 0 so navigating away and back
    // doesn't re-seed over real state.
    useEffect(() => {
        if (!isDemo) return;
        if (useNodeStore.getState().nodes.length > 0) return;
        setNodes(DEMO_NODES as any);
        setEdges(DEMO_EDGES as any);
    }, [ projectId ]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Layout persistence ────────────────────────────────────────────────────
    // Debounced write to IndexedDB → Postgres OCC on every node-array change.
    // Skipped for demo — there is no server-side project to persist to.
    useEffect(() => {
        if (isDemo || nodes.length === 0) return;
        debouncedPersistLayout(nodes, projectId, 'project');
    }, [ nodes, projectId, isDemo ]);

    // ── Drag handlers ─────────────────────────────────────────────────────────
    const handleDragStart = useCallback((event: DragStartEvent) => {
        setActiveDragId(event.active.id as string);
        setActiveDragData((event.active.data.current as any) ?? null);
    }, []);

    /**
     * Handles asset drops from WorldAssetPanel onto the NodeGraph canvas.
     *
     * Coordinate pipeline:
     *   1. Reconstruct final pointer screen position:
     *        finalScreen = activatorEvent.clientXY + dnd-kit cumulative delta
     *      activatorEvent is the original pointerdown; delta is total movement
     *      since pickup — so this gives us the release position, not the start.
     *   2. Make position canvas-relative: subtract the wrapper element's rect.
     *   3. screenToWorld applies the ReactFlow viewport transform (pan + zoom),
     *      placing the node exactly under the cursor at any zoom level.
     *
     * Drops onto scene/composite droppables are intentionally ignored here;
     * those nodes handle their own dnd-kit useDroppable logic independently.
     */
    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            setActiveDragId(null);
            setActiveDragData(null);

            if (event.over?.id !== 'pipeline-canvas-drop-zone') return;
            if (!reactFlowWrapperRef.current) return;

            const activatorEvent = event.activatorEvent as PointerEvent;
            const finalScreenX = activatorEvent.clientX + event.delta.x;
            const finalScreenY = activatorEvent.clientY + event.delta.y;

            const bounds = reactFlowWrapperRef.current.getBoundingClientRect();
            const worldPos = screenToWorld(
                finalScreenX - bounds.left,
                finalScreenY - bounds.top,
                useNodeStore.getState().viewport,
            );

            const { type, entityId } = (event.active.data.current as any) ?? {};
            if (!type) return;

            addNode(
                NodeFactory.createNode({
                    type,
                    entityId: entityId ?? (event.active.id as string),
                    contextId: projectId,
                    contextType: 'project',
                    posCanvas: worldPos,
                    scope: 'project',
                })
            );
        },
        [ projectId, addNode ],
    );

    // ── Mobile fallback ───────────────────────────────────────────────────────
    if (isMobile) return <ProjectDashboard />;

    return (
            <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
            <DndContext onDragStart={ handleDragStart } onDragEnd={ handleDragEnd }>
                <CanvasToolbar />

                <TopAssetPanel
                    contextId={ projectId }
                    contextType="project"
                />

                <div className="flex-1 h-full overflow-hidden">
                    <ResizablePanelGroup className="z-50" direction="horizontal">
                        <ResizablePanel defaultSize={ 80 } className="relative z-0">
                            <NodeGraph projectId={ projectId } wrapperRef={ reactFlowWrapperRef } >
                                <LeftSidebar />
                            </NodeGraph>
                        </ResizablePanel>

                        <ResizableHandle className="w-1 bg-border hover:bg-primary transition-colors z-10" />

                        { selectedNodeId && <ResizablePanel
                            defaultSize={ 20 } minSize={ 15 } maxSize={ 30 }
                            className="bg-panel border-l border-panel-border z-10"
                        >
                            <PropertiesPanel />
                        </ResizablePanel> }
                    </ResizablePanelGroup>
                </div>

            {/* Drag overlay — portal-rendered above everything for visual ghost. */ }
            <DragOverlay>
                { activeDragId && activeDragData ? (
                    <div className="bg-card border border-primary rounded-md p-2 shadow-lg opacity-80 text-xs flex items-center gap-2 pointer-events-none">
                        <div className="w-6 h-6 bg-muted rounded shrink-0" />
                        <div className="flex flex-col">
                            <span className="font-mono text-[9px] text-muted-foreground uppercase">
                                { activeDragData.type }
                            </span>
                            <span className="font-mono text-[10px] text-foreground font-semibold">
                                { activeDragData.name }
                            </span>
                        </div>
                    </div>
                ) : null }
            </DragOverlay>
        </DndContext>
        </div>
    );
}