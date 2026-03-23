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
import { debouncedPersistLayout } from '../store/middleware/canvasIndexedDBStorage.js';
import { useWorldAccess } from '../hooks/useSwrApi.js';
import { useWorlds } from '#/hooks/useSwrApi.js';
import { getHybridNodeStorage } from '#/services/hybridNodeStorage.js';
import { supabase } from '../lib/supabase.js';

import { nodeTypes } from '../components/canvas/nodes/index.js';
import { TopAssetPanel } from '../components/canvas/panels/TopAssetPanel.js';
import { LeftSidebar } from '../components/canvas/panels/LeftSidebar.js';
import { RightSidebar } from '../components/canvas/panels/RightSidebar.js';
import { CanvasToolbar } from '../components/canvas/toolbar/CanvasToolbar.js';
import { GlobalNotifications } from '../components/canvas/panels/GlobalNotifications.js';
import { NodeFactory } from '../domain/canvas/NodeFactory.js';
import { screenToWorld, snapToGrid as snapToGridFn, calculateAutoLayoutPosition, GRID_SIZE } from '../domain/canvas/CoordinateSystem.js';
import { DropFilesOverlay } from '#/components/canvas/overlays/DropFilesOverlay.js';
import { AddNodeDropdown } from '#/components/canvas/toolbar/AddNodeDropdown.js';

export function WorldBuilderCanvas() {

  const { worldId } = useParams();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setNodes, setViewport } = useNodeStore();
  const { setWorld } = useWorldStore();
  const selectedNodeId = useNodeStore(state => state.nodes.find(n => n.selected)?.id || null);
  const autoLayout = useCanvasUIStore((s) => s.autoLayout);
  const snapToGrid = useCanvasUIStore((s) => s.snapToGrid);

  const { data: accessData, isLoading: accessLoading } = useWorldAccess(worldId || null);
  const { worlds } = useWorlds();

  useEffect(() => {
    if (!worldId || accessLoading) return;

    setNodes([]);

    setWorld(
      worldId,
      (accessData?.role as any) || 'viewer',
      accessData?.licenseType || null
    );

    const storage = getHybridNodeStorage(supabase);
    storage.fetch(worldId)
      .then(layouts => {
        const store = useNodeStore.getState();

        const rootNode = NodeFactory.createNode({
          type: 'metadata',
          entityId: worldId,
          contextId: worldId,
          contextType: 'world',
          posCanvas: { x: 0, y: 0 },
          scope: 'world'
        });

        const allNodes = [rootNode];

        layouts.forEach((layout: any) => {
          const existingNode = store.nodes.find(n => n.id === layout.idEntity);
          if (existingNode) {
            store.updateNodePosition(existingNode.id, { x: layout.valPosX, y: layout.valPosY });
            const dataUpdate = layout.jsonUiMetadata ? { ...layout.jsonUiMetadata, idxVersion: layout.idxVersion } : { idxVersion: layout.idxVersion };
            store.updateNodeData(existingNode.id, dataUpdate);
          } else {
            const newNode = NodeFactory.createNode({
              type: layout.nodeType as any,
              entityId: layout.idEntity,
              contextId: worldId,
              contextType: 'world',
              posCanvas: { x: layout.valPosX, y: layout.valPosY },
              scope: 'world',
              width: layout.valWidth,
              height: layout.valHeight,
              idxVersion: layout.idxVersion
            });
            if (layout.jsonUiMetadata) {
              newNode.data = { ...newNode.data, ...layout.jsonUiMetadata };
            }
            allNodes.push(newNode);
          }
        });

        store.setNodes(allNodes);
      })
      .catch(err => console.error('[WorldBuilderCanvas] Failed to load canvas layouts', err));
  }, [worldId, setWorld, setNodes, accessData, accessLoading]);

  // Set world name when worlds list changes
  useEffect(() => {
    if (!worldId) return;
    const world = worlds.find(w => w.id === worldId);
    if (world) {
      useWorldStore.getState().setWorldName(world.name);
    }
  }, [worldId, worlds]);

  const isDraggingFileOverCanvasRef = useRef(false);
  const [isDraggingFileOverCanvas, setIsDraggingFileOverCanvas] = useState(false);

  const updateDragOverlay = useCallback((show: boolean) => {
    if (isDraggingFileOverCanvasRef.current === show) return;
    isDraggingFileOverCanvasRef.current = show;
    setIsDraggingFileOverCanvas(show);
  }, []);

  // Handle Drag & Drop from TopAssetPanel
  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    if (!reactFlowWrapper.current) return;

    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      updateDragOverlay(false);
      return;
    }

    const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();

    const dataRaw = event.dataTransfer.getData('application/json');
    if (!dataRaw) return;

    const { type, entityId } = JSON.parse(dataRaw);

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
  }, [worldId, autoLayout, snapToGrid, nodes, updateDragOverlay]);

  const onDragOver = useCallback((event: React.DragEvent) => {
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

  const onDragEnter = useCallback((event: React.DragEvent) => {
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

  const onDragLeave = useCallback((event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      updateDragOverlay(false);
    }
  }, [updateDragOverlay]);

  // Persist layout changes
  useEffect(() => {
    if (nodes.length > 0 && worldId) {
      debouncedPersistLayout(nodes, worldId, 'world');
    }
  }, [nodes, worldId]);

  return (
    <div
      className="w-full h-screen bg-gray-950 text-foreground relative z-10 font-sans"
      ref={reactFlowWrapper}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        updateDragOverlay(false);
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

      <DropFilesOverlay isDraggingFileOverCanvas={isDraggingFileOverCanvas} />

      <div className="absolute bottom-4 left-4 z-20">
        <AddNodeDropdown contextType="world" worldId={worldId as string} />
      </div>

      {/* Overlays */}
      <CanvasToolbar handleResume={() => { }} handleStop={() => { }} />
      <TopAssetPanel contextId={worldId as string} contextType="world" />
      <LeftSidebar />
      <RightSidebar />
      <GlobalNotifications />
    </div>
  );
}
