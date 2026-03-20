import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useParams } from 'wouter';
import { useShallow } from 'zustand/shallow';
import { DndContext, DragCancelEvent, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '#/components/ui/resizable.js';

import { TopAssetPanel } from '#/components/canvas/panels/TopAssetPanel.js';
import { NodeGraph } from '#/components/canvas/NodeGraph.js';

import { usePipelineEvents } from '#/hooks/usePipelineEvents.js';
import { useCanvasPipelineSync } from '#/store/useCanvasPipelineSync.js';
import { useNodeStore } from '#/store/useNodeStore.js';
import { NodeFactory } from '#/domain/canvas/NodeFactory.js';
import { screenToWorld, snapToGrid as snapToGridFn, calculateAutoLayoutPosition } from '#/domain/canvas/CoordinateSystem.js';
import { debouncedPersistLayout } from '#/store/middleware/indexedDBStorage.js';

import ProjectDashboard from '#/pages/ProjectDashboard.js';
import { CanvasToolbar } from '#/components/canvas/toolbar/CanvasToolbar.js';
import { LeftSidebar } from '#/components/canvas/panels/LeftSidebar.js';
import { GlobalNotifications } from '#/components/canvas/panels/GlobalNotifications.js';
import { useCanvasUIStore } from '#/store/useCanvasUIStore.js';
import { DEMO_EDGES, DEMO_NODES, DEMO_PROJECT_ID } from '#/domain/canvas/DEMO_NODES.js';
import { useAuth } from '#/lib/auth-context.js';
import { useProjectStore } from '#/store/useProjectStore.js';
import { usePipelineStore } from '#/store/usePipelineStore.js';
import { resumePipeline, startPipeline, stopPipeline } from '#/lib/api.js';
import { RightSidebar } from '#/components/canvas/panels/RightSidebar.js';
import { initPubSubCanvasAdapter } from '#/domain/canvas/PubSubCanvasAdapter.js';

/**
 * Dummy PubSub client used to initialize the adapter before
 * the real WebSocket hooks from the workspace are wired in.
 */
const mockPubSubClient = {
    events: {} as Record<string, ((p: any) => void)[]>,
    on(evt: string, fn: (p: any) => void) {
        if (!this.events[evt]) this.events[evt] = [];
        this.events[evt].push(fn);
    },
    off(evt: string, fn: (p: any) => void) {
        if (!this.events[evt]) return;
        this.events[evt] = this.events[evt].filter(f => f !== fn);
    }
};

export default function ProjectBuilderCanvas() {

    // projectId from route; falls back to demo slug when accessed standalone.
    const { projectId = DEMO_PROJECT_ID } = useParams<{ projectId: string; }>();
    const isDemo = projectId === DEMO_PROJECT_ID;

    console.debug('[ProjectBuilderCanvas] Rendering', { projectId, isDemo });

    // Forwarded to NodeGraph so handleDragEnd can call getBoundingClientRect()
    // on the canvas element for the screenToWorld coordinate transform.
    const reactFlowWrapperRef = useRef<HTMLDivElement>(null);

    const { activeTeamId } = useAuth();
    const setProjectStatus = usePipelineStore((s) => s.setStatus);
    const interrupt = usePipelineStore((s) => s.interrupt);
    const setInterrupt = usePipelineStore((s) => s.setInterrupt);
    const addMessage = usePipelineStore((s) => s.pushEvent);

    const selectedProject = useProjectStore((s) => s.selectedProjectId);
    const setSelectedProject = useProjectStore((s) => s.setSelectedProjectId);
    const metadata = useProjectStore((s) => s.metadata);
    const audioGcsUri = metadata?.audioGcsUri;
    const initialPrompt = metadata?.initialPrompt;

    // Primitive mobile guard — mirrors ProjectBuilderCanvas.
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    usePipelineEvents({ projectId: isDemo ? null : projectId });
    useCanvasPipelineSync(isDemo ? '' : projectId);

    useEffect(() => {
        if (isDemo) return;
        setSelectedProject(projectId);
    }, [projectId, isDemo, setSelectedProject]);

    useEffect(() => {
        if (!projectId) return;

        const currentNodes = useNodeStore.getState().nodes;
        console.debug('[ProjectBuilderCanvas] Effect running', { projectId, nodesCount: currentNodes.length });

        const teardown = initPubSubCanvasAdapter(projectId, mockPubSubClient);

        if (currentNodes.length === 0) {
            console.debug('[ProjectBuilderCanvas] Creating root metadata node');
            const rootNode = NodeFactory.createNode({
                type: 'metadata',
                entityId: projectId,
                contextId: projectId,
                contextType: 'project',
                posCanvas: { x: 0, y: 0 },
                scope: 'project'
            });
            setNodes([rootNode]);
        }

        return () => teardown();
    }, [projectId]);

    const isDraggingFileOverCanvasRef = useRef(false);
    const [isDraggingFileOverCanvas, setIsDraggingFileOverCanvas] = useState(false);
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [activeDragData, setActiveDragData] = useState<{ type: string; name: string; } | null>(null);

    const updateDragOverlay = useCallback((show: boolean) => {
        if (isDraggingFileOverCanvasRef.current === show) return;
        isDraggingFileOverCanvasRef.current = show;
        setIsDraggingFileOverCanvas(show);
    }, []);


    const { nodes, setNodes, setEdges, addNode } = useNodeStore(
        useShallow((s) => ({
            nodes: s.nodes,
            setNodes: s.setNodes,
            setEdges: s.setEdges,
            addNode: s.addNode,
        }))
    );

    const selectedNodeId = useCanvasUIStore((s) => s.selectedNodeId);
    const autoLayout = useCanvasUIStore((s) => s.autoLayout);
    const snapToGrid = useCanvasUIStore((s) => s.snapToGrid);

    // ── Demo seed ─────────────────────────────────────────────────────────────
    // Guards on both isDemo and nodes.length === 0 so navigating away and back
    // doesn't re-seed over real state.
    useEffect(() => {
        if (!isDemo) return;
        if (useNodeStore.getState().nodes.length > 0) return;
        setNodes(DEMO_NODES as any);
        setEdges(DEMO_EDGES as any);
    }, [projectId]);

    const handleDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const isFileDrag = event.dataTransfer.types && Array.from(event.dataTransfer.types).includes('Files');

        if (isFileDrag) {
            updateDragOverlay(true);
            event.dataTransfer.dropEffect = 'none';
        } else {
            updateDragOverlay(false);
            event.dataTransfer.dropEffect = 'copy';
        }
    }, [updateDragOverlay]);

    const handleDragEnter = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const isFileDrag = event.dataTransfer.types && Array.from(event.dataTransfer.types).includes('Files');

        if (isFileDrag) {
            updateDragOverlay(true);
            event.dataTransfer.dropEffect = 'none';
        } else {
            updateDragOverlay(false);
            event.dataTransfer.dropEffect = 'copy';
        }
    }, [updateDragOverlay]);

    const handleDragLeave = useCallback((event: React.DragEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            updateDragOverlay(false);
        }
    }, [updateDragOverlay]);

    const dndHandleDragCancel = useCallback(() => {
        updateDragOverlay(false);
    }, [updateDragOverlay]);

    // ── Layout persistence ─────────────────────────────────────────────────────
    // Debounced write to IndexedDB → Postgres OCC on every node-array change.
    // Skipped for demo — there is no server-side project to persist to.
    useEffect(() => {
        if (isDemo || nodes.length === 0) return;
        debouncedPersistLayout(nodes, projectId, 'project');
    }, [nodes, projectId, isDemo]);

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
     * Auto-layout mode:
     *   - When ON: uses calculateAutoLayoutPosition to place new nodes to the
     *     right of the bottom-most node of the same type, snapped to grid.
     *   - When OFF: places nodes at drop position (optionally snapped if snapToGrid is enabled).
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
            let worldPos = screenToWorld(
                finalScreenX - bounds.left,
                finalScreenY - bounds.top,
                useNodeStore.getState().viewport,
            );

            const { type, entityId } = (event.active.data.current as any) ?? {};
            if (!type) return;

            let finalPosition: { x: number; y: number };

            if (autoLayout) {
                finalPosition = calculateAutoLayoutPosition(nodes, type);
            } else {
                finalPosition = snapToGrid ? snapToGridFn(worldPos) : worldPos;
            }

            addNode(
                NodeFactory.createNode({
                    type,
                    entityId: entityId ?? (event.active.id as string),
                    contextId: projectId,
                    contextType: 'project',
                    posCanvas: finalPosition,
                    scope: 'project',
                })
            );
        },
        [projectId, addNode, autoLayout, snapToGrid, nodes],
    );

    const handleStartPipeline = useCallback(async () => {
        if (!selectedProject) {
            console.error("Cannot start pipeline: missing project.");
            return;
        }
        if (!initialPrompt) {
            console.error("Cannot start pipeline: missing creative prompt.");
            return;
        }
        if (!activeTeamId) {
            console.error("Cannot start pipeline: missing team id.");
            return;
        }
        try {
            setProjectStatus("analyzing");
            await startPipeline({
                projectId: selectedProject,
                payload: {
                    teamId: activeTeamId,
                    audioGcsUri,
                    initialPrompt
                },
            });
        } catch (error) {
            console.error("Failed to start pipeline:", error);
            addMessage({ id: Date.now().toString(), type: "error", message: `Failed to start pipeline: ${(error as Error).message}`, timestamp: new Date() });
            setProjectStatus("error");
        }
    }, [selectedProject, activeTeamId, audioGcsUri, initialPrompt, setProjectStatus, addMessage]);

    const handleStopPipeline = useCallback(async () => {
        if (!selectedProject) {
            console.error("Cannot stop pipeline: no project selected.");
            return;
        }
        try {
            await stopPipeline({ projectId: selectedProject });
            setProjectStatus("idle");
            addMessage({ id: Date.now().toString(), type: "info", message: "Pipeline stop command issued.", timestamp: new Date() });
        } catch (error) {
            console.error("Failed to stop pipeline:", error);
            addMessage({ id: Date.now().toString(), type: "error", message: `Failed to stop pipeline: ${(error as Error).message}`, timestamp: new Date() });
        }
    }, [selectedProject, setProjectStatus, addMessage]);

    const handleResumePipeline = useCallback(async () => {
        if (!selectedProject) return;
        setProjectStatus("analyzing");

        interrupt?.type === "user_approval" ?
            await resumePipeline({ projectId: selectedProject, payload: { resumeValue: true } }) :
            await resumePipeline({ projectId: selectedProject, payload: {} });

        setInterrupt(null);
    }, [selectedProject, setProjectStatus, interrupt, setInterrupt]);

    // ── Mobile fallback ───────────────────────────────────────────────────────
    if (isMobile) return <ProjectDashboard />;

    return (
        <div
            className="flex flex-col h-screen w-screen overflow-hidden bg-background relative z-10"
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={(e) => {
                e.preventDefault();
                updateDragOverlay(false);
            }}
        >
            <DndContext
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={dndHandleDragCancel}
            >
                <CanvasToolbar
                    handleStop={handleStopPipeline}
                    handleResume={handleResumePipeline}
                />

                <TopAssetPanel
                    contextId={projectId}
                    contextType="project"
                />

                <div className="flex-1 h-full overflow-hidden">
                    <ResizablePanelGroup className="z-50" direction="horizontal">
                        <ResizablePanel defaultSize={80} className="relative z-0">
                            <NodeGraph projectId={projectId} wrapperRef={reactFlowWrapperRef} >
                                <LeftSidebar />
                            </NodeGraph>
                            <GlobalNotifications />

                        </ResizablePanel>

                        <ResizableHandle className="w-1 bg-border hover:bg-primary transition-colors z-10" />

                        {selectedNodeId && <ResizablePanel
                            defaultSize={20} minSize={15} maxSize={30}
                            className="bg-panel border-l border-panel-border z-10"
                        >
                            <RightSidebar />
                        </ResizablePanel>}
                    </ResizablePanelGroup>
                </div>

                {/* Drag overlay — portal-rendered above everything for visual ghost. */}
                <DragOverlay>
                    {activeDragId && activeDragData ? (
                        <div className="bg-card border border-primary rounded-md p-2 shadow-lg opacity-80 text-xs flex items-center gap-2 pointer-events-none">
                            <div className="w-6 h-6 bg-muted rounded shrink-0" />
                            <div className="flex flex-col">
                                <span className="font-mono text-[9px] text-muted-foreground uppercase">
                                    {activeDragData.type}
                                </span>
                                <span className="font-mono text-[10px] text-foreground font-semibold">
                                    {activeDragData.name}
                                </span>
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>

                {isDraggingFileOverCanvas && (
                    <div className="fixed inset-0 flex items-center justify-center bg-black/95 text-white text-3xl font-bold z-[99999] pointer-events-none backdrop-blur-[4px] border-2 border-white/20 animate-pulse">
                        Drop files on the Asset Panel to add them
                    </div>
                )}

            </DndContext>
        </div>
    );
}