import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useParams } from 'wouter';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  Connection, EdgeChange, NodeChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useNodeStore } from '../store/useNodeStore.js';
import { useProjectStore } from '../store/useProjectStore.js';
import { useWorldStore } from '../store/useWorldStore.js';
import { useCanvasUIStore } from '../store/useCanvasUIStore.js';
import { debouncedPersistLayout } from '../store/middleware/indexedDBStorage.js';
import { useWorldAccess } from '../hooks/useSwrApi.js';
import { useWorlds } from '#/hooks/useSwrApi.js';

import { nodeTypes } from '../components/canvas/nodes/index.js';
import { TopAssetPanel } from '../components/canvas/panels/TopAssetPanel.js';
import { LeftSidebar } from '../components/canvas/panels/LeftSidebar.js';
import { RightSidebar } from '../components/canvas/panels/RightSidebar.js';
import { CanvasToolbar } from '../components/canvas/toolbar/CanvasToolbar.js';
import { NodeFactory } from '../domain/canvas/NodeFactory.js';
import { screenToWorld, snapToGrid as snapToGridFn, calculateAutoLayoutPosition, GRID_SIZE } from '../domain/canvas/CoordinateSystem.js';

export function WorldBuilderCanvas() {

  const { worldId } = useParams();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Zustand Store Slices
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setNodes, setViewport } = useNodeStore();
  const { setWorld } = useWorldStore();
  const selectedNodeId = useNodeStore(state => state.nodes.find(n => n.selected)?.id || null);
  const autoLayout = useCanvasUIStore((s) => s.autoLayout);
  const snapToGrid = useCanvasUIStore((s) => s.snapToGrid);

  // Load RBAC Data
  const { data: accessData, isLoading: accessLoading } = useWorldAccess(worldId || null);
  // Load Worlds for name lookup
  const { worlds } = useWorlds();

  // Set world (role, license) and initial layout
  useEffect(() => {
    if (!worldId || accessLoading) return;

    // Set RBAC role from fetched endpoint
    setWorld(
      worldId,
      (accessData?.role as any) || 'viewer',
      accessData?.licenseType || null
    );

    // MOCK: Initial layout load
    // If no nodes, spawn the metadata root.
    if (nodes.length === 0) {
      const rootNode = NodeFactory.createNode({
        type: 'metadata',
        entityId: worldId,
        contextId: worldId,
        contextType: 'world',
        posCanvas: { x: 0, y: 0 },
        scope: 'world'
      });
      setNodes([rootNode]);
    }
  }, [worldId, setWorld, setNodes, nodes.length, accessData, accessLoading]);

  // Set world name when worlds list changes
  useEffect(() => {
    if (!worldId) return;
    const world = worlds.find(w => w.id === worldId);
    if (world) {
      useWorldStore.getState().setWorldName(world.name);
    }
  }, [worldId, worlds]);

  // State for dragging files over canvas
  const [isDraggingFileOverCanvas, setIsDraggingFileOverCanvas] = useState(false);

  // Handle Drag & Drop from TopAssetPanel
  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    if (!reactFlowWrapper.current) return;

    // If dropping files, do nothing (files must be dropped on asset panel)
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      setIsDraggingFileOverCanvas(false);
      return;
    }

    const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();

    const dataRaw = event.dataTransfer.getData('application/json');
    if (!dataRaw) return;

    const { type, entityId } = JSON.parse(dataRaw);

    // Convert screen coordinates to canvas world coordinates
    const dropPosition = screenToWorld(
      event.clientX - reactFlowBounds.left,
      event.clientY - reactFlowBounds.top,
      useNodeStore.getState().viewport
    );

    let finalPosition: { x: number; y: number };
    
    if (autoLayout) {
      finalPosition = calculateAutoLayoutPosition(nodes, type, GRID_SIZE);
    } else {
      finalPosition = snapToGrid ? snapToGridFn(dropPosition, GRID_SIZE) : dropPosition;
    }

    const newNode = NodeFactory.createNode({
      type,
      entityId,
      contextId: worldId as string,
      contextType: 'world',
      posCanvas: finalPosition,
      scope: 'world'
    });

    useNodeStore.getState().addNode(newNode);
  }, [worldId, autoLayout, snapToGrid, nodes]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const isFileDrag = event.dataTransfer.types && Array.from(event.dataTransfer.types).includes('Files');

    if (isFileDrag) {
      setIsDraggingFileOverCanvas(true);
      event.dataTransfer.dropEffect = 'none';
    } else {
      setIsDraggingFileOverCanvas(false);
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const isFileDrag = event.dataTransfer.types && Array.from(event.dataTransfer.types).includes('Files');

    if (isFileDrag) {
      setIsDraggingFileOverCanvas(true);
      event.dataTransfer.dropEffect = 'none';
    } else {
      setIsDraggingFileOverCanvas(false);
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDraggingFileOverCanvas(false);
    }
  }, []);

  // Persist layout changes
  useEffect(() => {
    if (nodes.length > 0 && worldId) {
      debouncedPersistLayout(nodes, worldId, 'world');
    }
  }, [nodes, worldId]);

  return (
    <div
      className="w-full h-screen bg-gray-950 text-foreground relative font-sans"
      ref={reactFlowWrapper}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFileOverCanvas(false);
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onMove={(evt, viewport) => setViewport(viewport)}
        snapToGrid={snapToGrid}
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        fitView
      >
        <Background gap={30} size={2} color="#1f2937" />
        <Controls className="fill-white bg-gray-900 border-gray-700" showInteractive={false} />
        <MiniMap
          className="bg-gray-900 border-gray-700 rounded-lg overflow-hidden"
          maskColor="rgba(0, 0, 0, 0.4)"
        />
      </ReactFlow>

      {isDraggingFileOverCanvas && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/95 text-white text-3xl font-bold z-[99999] pointer-events-none backdrop-blur-[4px] border-2 border-white/20 animate-pulse">
          Drop files on the Asset Panel to add them
        </div>
      )}

      {/* Overlays */}
      {/* TODO extract project pipeline handlers into a project-only toolbar */}
      <CanvasToolbar handleResume={() => { }} handleStop={() => { }} />
      <TopAssetPanel contextId={worldId as string} contextType="world" />
      <LeftSidebar />
      <RightSidebar />
    </div>
  );
}
