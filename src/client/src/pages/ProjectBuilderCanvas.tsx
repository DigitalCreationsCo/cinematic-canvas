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
import { debouncedPersistLayout, clearDebounce, flushPendingPersist } from '#/store/middleware/canvasIndexedDBStorage.js';
import { getHybridNodeStorage } from '#/services/hybridNodeStorage.js';
import { supabase } from '#/lib/supabase.js';
import { apiFetch, resumePipeline, startPipeline, stopPipeline } from '#/lib/api.js';
import { api } from '#/lib/routes.js';

import ProjectDashboard from '#/pages/ProjectDashboard.js';
import { CanvasToolbar } from '#/components/canvas/toolbar/CanvasToolbar.js';
import { LeftSidebar } from '#/components/canvas/panels/LeftSidebar.js';
import { GlobalNotifications } from '#/components/canvas/panels/GlobalNotifications.js';
import { useCanvasUIStore } from '#/store/useCanvasUIStore.js';
import { DEMO_EDGES, DEMO_NODES, DEMO_PROJECT_ID } from '#/domain/canvas/DEMO_NODES.js';
import { useAuth } from '#/lib/auth-context.js';
import { useProjectStore } from '#/store/useProjectStore.js';
import { usePipelineStore } from '#/store/usePipelineStore.js';
import { RightSidebar } from '#/components/canvas/panels/RightSidebar.js';
import { DropFilesOverlay } from '#/components/canvas/overlays/DropFilesOverlay.js';
import { useImageFileDrop } from '#/hooks/useImageFileDrop.js';
import { useAudioFileDrop } from '#/hooks/useAudioFileDrop.js';
import { CanvasNode } from '#/domain/canvas/NodeTypes.js';
import { CompoundModal } from '#/components/CompoundModal.js';

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

        useNodeStore.getState().setNodes([]);
        console.debug('[ProjectBuilderCanvas] Canvas cleared for project', { projectId });

        // BUG-4 fix: flush pending persist and clean up on unmount / beforeunload.
        const handleBeforeUnload = () => {
            flushPendingPersist();
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            // MEM-1 fix: Clear global store on unmount to prevent unbounded memory growth.
            useNodeStore.getState().setNodes([]);
            useNodeStore.getState().setEdges([]);
            // BUG-4 fix: Flush any pending debounced persist before unmounting.
            flushPendingPersist();
            clearDebounce();
            window.removeEventListener('beforeunload', handleBeforeUnload);
            console.debug('[ProjectBuilderCanvas] Canvas cleanup on unmount', { projectId });
        };
    }, [projectId]);

    const isDraggingFileOverCanvasRef = useRef(false);
    const [isDraggingFileOverCanvas, setIsDraggingFileOverCanvas] = useState(false);
    const [draggedFileType, setDraggedFileType] = useState<'image' | 'audio' | null>(null);
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [activeDragData, setActiveDragData] = useState<{ type: string; name: string; } | null>(null);

    const { handleFileDrop: handleImageDrop, isSupportedExtension: isImageExtension } = useImageFileDrop(reactFlowWrapperRef);
    const { handleFileDrop: handleAudioDrop, isAudioFile } = useAudioFileDrop(reactFlowWrapperRef);

    const isProcessingDropRef = useRef(false);
    const dropTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const detectFileType = (files: FileList | null): 'image' | 'audio' | null => {
        if (!files || files.length === 0) return null;
        const file = files[0];
        if (isAudioFile(file)) return 'audio';
        if (isImageExtension(file.name)) return 'image';
        return null;
    };

    const updateDragOverlay = useCallback((show: boolean, type: 'image' | 'audio' | null = null) => {
        if (isDraggingFileOverCanvasRef.current === show && draggedFileType === type) return;
        isDraggingFileOverCanvasRef.current = show;
        setIsDraggingFileOverCanvas(show);
        setDraggedFileType(show ? type : null);
    }, [draggedFileType]);

    const handleFileDrop = useCallback(
        async (event: DragEvent) => {
            if (isProcessingDropRef.current) {
                console.debug('[ProjectBuilderCanvas] Ignoring duplicate drop event');
                return;
            }
            isProcessingDropRef.current = true;

            try {
                event.preventDefault();
                event.stopPropagation();

                const fileType = detectFileType(event.dataTransfer?.files ?? null);

                console.debug('[ProjectBuilderCanvas] handleFileDrop processing', {
                    fileType,
                    fileCount: event.dataTransfer?.files?.length ?? 0,
                });

                if (fileType === 'audio') {
                    await handleAudioDrop(event, projectId);
                } else {
                    await handleImageDrop(event, projectId);
                }
            } finally {
                updateDragOverlay(false);
                // MEM-2 fix: Track the timeout ref so it can be cleared on unmount.
                dropTimeoutRef.current = setTimeout(() => {
                    isProcessingDropRef.current = false;
                    dropTimeoutRef.current = null;
                }, 100);
            }
        },
        [projectId, handleAudioDrop, handleImageDrop, updateDragOverlay]
    );


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
            const fileType = detectFileType(event.dataTransfer.files);
            updateDragOverlay(true, fileType);
            event.dataTransfer.dropEffect = 'copy';
        } else {
            updateDragOverlay(false);
            event.dataTransfer.dropEffect = 'copy';
        }
    }, [updateDragOverlay, isAudioFile, isImageExtension]);

    const handleDragEnter = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const isFileDrag = event.dataTransfer.types && Array.from(event.dataTransfer.types).includes('Files');

        if (isFileDrag) {
            const fileType = detectFileType(event.dataTransfer.files);
            updateDragOverlay(true, fileType);
            event.dataTransfer.dropEffect = 'copy';
        } else {
            updateDragOverlay(false);
            event.dataTransfer.dropEffect = 'copy';
        }
    }, [updateDragOverlay, isAudioFile, isImageExtension]);

    const handleDragLeave = useCallback((event: React.DragEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            updateDragOverlay(false);
        }
    }, [updateDragOverlay]);

    const dndHandleDragCancel = useCallback(() => {
        updateDragOverlay(false);
    }, [updateDragOverlay]);

    // ── Layout persistence ─────────────────────────────────────────────────────
    // PERF-1 fix: Persist on structural changes (add/delete) via useEffect,
    // but NOT on every drag frame. Drag persistence is handled by onNodeDragStop.
    const setLastSaved = useCanvasUIStore((s) => s.setLastSaved);
    const setSaveError = useCanvasUIStore((s) => s.setSaveError);
    const prevNodeCountRef = useRef(0);

    const handleSaveResult = useCallback(async (result: { success: boolean; error?: string; timestamp: Date }) => {
        if (result.success) {
            setLastSaved(result.timestamp);
            setSaveError(null);
        } else {
            if (result.error?.includes('OCC conflict')) {
                console.debug('[ProjectBuilderCanvas] OCC conflict, refreshing layouts');
                try {
                    const storage = getHybridNodeStorage(supabase);
                    const layouts = await storage.fetch(projectId);
                    const store = useNodeStore.getState();
                    layouts.forEach((layout) => {
                        store.updateNodeData(layout.idEntity, { idxVersion: layout.idxVersion });
                        store.updateNodePosition(layout.idEntity, { x: layout.valPosX, y: layout.valPosY });
                    });
                    setSaveError('Refreshed due to conflict');
                } catch (refreshErr) {
                    setSaveError('Failed to refresh after conflict');
                }
            } else {
                setSaveError(result.error || 'Save failed');
            }
        }
    }, [projectId, setLastSaved, setSaveError]);

    // Persist on structural changes (node add/delete) — NOT on drag position changes.
    useEffect(() => {
        if (isDemo || nodes.length === 0) return;
        // Only trigger on node count change (structural), not position changes.
        if (nodes.length === prevNodeCountRef.current) return;
        prevNodeCountRef.current = nodes.length;
        debouncedPersistLayout(nodes, projectId, 'project', handleSaveResult);
    }, [nodes, projectId, isDemo, handleSaveResult]);

    /** PERF-1 fix: Persist position on drag stop, not every frame. */
    const handleNodeDragStop = useCallback((e: React.MouseEvent, node: any, activeNodes: CanvasNode[]) => {
        if (isDemo || activeNodes.length === 0) return;
        debouncedPersistLayout(activeNodes, projectId, 'project', handleSaveResult);
    }, [projectId, isDemo, handleSaveResult]);

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
                finalPosition = calculateAutoLayoutPosition(nodes, type, worldPos, useNodeStore.getState().viewport);
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
                e.stopPropagation();
            }}
        >
            <DndContext
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={dndHandleDragCancel}
            >
                <CanvasToolbar
                    handleStart={handleStartPipeline}
                    handleStop={handleStopPipeline}
                    handleResume={handleResumePipeline}
                    projectId={projectId}
                />

                <TopAssetPanel
                    contextId={projectId}
                    contextType="project"
                />

                <div className="flex-1 h-full overflow-hidden">
                    <ResizablePanelGroup className="z-50" direction="horizontal">
                        <ResizablePanel defaultSize={80} className="relative z-0">
                            <NodeGraph projectId={projectId} wrapperRef={reactFlowWrapperRef} onFileDrop={handleFileDrop} onNodeDragStop={handleNodeDragStop}>
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

                <DropFilesOverlay isDraggingFileOverCanvas={isDraggingFileOverCanvas} draggedFileType={draggedFileType} />

                <CompoundModal />

            </DndContext>
        </div>
    );
}