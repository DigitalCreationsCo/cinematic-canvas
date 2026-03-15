import React, { useEffect, useCallback, useRef } from 'react';
import { useParams } from 'wouter';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  Connection, EdgeChange, NodeChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useNodeStore } from '../../store/useNodeStore.js';
import { useProjectStore } from '../../store/useProjectStore.js';
import { useWorldStore } from '../../store/useWorldStore.js';
import { debouncedPersistLayout } from '../../store/middleware/indexedDBStorage.js';
import { useWorldAccess } from '../../hooks/use-swr-api.js';
import { useWorlds } from '#/hooks/use-swr-api.js';

import { nodeTypes } from './nodes/index.js';
import { TopAssetPanel } from './panels/TopAssetPanel.js';
import { LeftSidebar } from './panels/LeftSidebar.js';
import { RightSidebar } from './panels/RightSidebar.js';
import { CanvasToolbar } from './toolbar/CanvasToolbar.js';
import { NodeFactory } from '../../domain/canvas/NodeFactory.js';
import { screenToWorld } from '../../domain/canvas/CoordinateSystem.js';

export function WorldBuilderCanvas() {
  
   const { worldId } = useParams();
   const reactFlowWrapper = useRef<HTMLDivElement>(null);
 
   // Zustand Store Slices
   const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setNodes, setViewport } = useNodeStore();
   const { setWorld } = useWorldStore();
   const selectedNodeId = useNodeStore(state => state.nodes.find(n => n.selected)?.id || null);
 
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
       setNodes([ rootNode ]);
     }
   }, [ worldId, setWorld, setNodes, nodes.length, accessData, accessLoading ]);
 
   // Set world name when worlds list changes
   useEffect(() => {
     if (!worldId) return;
     const world = worlds.find(w => w.id === worldId);
     if (world) {
       useWorldStore.getState().setWorldName(world.name);
     }
   }, [ worldId, worlds ]);
 
   // Handle Drag & Drop from TopAssetPanel
   const onDrop = useCallback((event: React.DragEvent) => {
     event.preventDefault();
 
     if (!reactFlowWrapper.current) return;
     const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
 
     const dataRaw = event.dataTransfer.getData('application/json');
     if (!dataRaw) return;
 
     const { type, entityId } = JSON.parse(dataRaw);
 
     // Convert screen coordinates to canvas world coordinates
     const position = screenToWorld(
       event.clientX - reactFlowBounds.left,
       event.clientY - reactFlowBounds.top,
       useNodeStore.getState().viewport
     );
 
     const newNode = NodeFactory.createNode({
       type,
       entityId,
       contextId: worldId as string,
       contextType: 'world',
       posCanvas: position,
       scope: 'world'
     });
 
     useNodeStore.getState().addNode(newNode);
   }, [ worldId ]);
 
   const onDragOver = useCallback((event: React.DragEvent) => {
     event.preventDefault();
     event.dataTransfer.dropEffect = 'copy';
   }, []);
 
   // Persist layout changes
   useEffect(() => {
     if (nodes.length > 0 && worldId) {
       debouncedPersistLayout(nodes, worldId, 'world');
     }
   }, [ nodes, worldId ]);
 
   return (
     <div className="w-full h-screen bg-gray-950 text-foreground relative font-sans" ref={ reactFlowWrapper }>
       <ReactFlow
         nodes={ nodes }
         edges={ edges }
         onNodesChange={ onNodesChange }
         onEdgesChange={ onEdgesChange }
         onConnect={ onConnect }
         nodeTypes={ nodeTypes }
         onDrop={ onDrop }
         onDragOver={ onDragOver }
         onMove={ (evt, viewport) => setViewport(viewport) }
         fitView
       >
         <Background gap={ 24 } size={ 2 } color="#1f2937" />
         <Controls className="fill-white bg-gray-900 border-gray-700" showInteractive={ false } />
         <MiniMap
           className="bg-gray-900 border-gray-700 rounded-lg overflow-hidden"
           maskColor="rgba(0, 0, 0, 0.4)"
         />
       </ReactFlow>
 
       {/* Overlays */ }
       <CanvasToolbar />
       <TopAssetPanel contextId={ worldId as string } contextType="world" />
       <LeftSidebar />
       <RightSidebar />
     </div>
   );
 }
   }, [ worldId, setWorld, setNodes, nodes.length, accessData, accessLoading ]);
 
   // Set world name when worlds list changes
   useEffect(() => {
     if (!worldId) return;
     const world = worlds.find(w => w.id === worldId);
     if (world) {
       useWorldStore.getState().setWorldName(world.name);
     }
   }, [ worldId, worlds ]);
 
   // Handle Drag & Drop from TopAssetPanel
   const onDrop = useCallback((event: React.DragEvent) => {
     event.preventDefault();
 
     if (!reactFlowWrapper.current) return;
     const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
 
     const dataRaw = event.dataTransfer.getData('application/json');
     if (!dataRaw) return;
 
     const { type, entityId } = JSON.parse(dataRaw);
 
     // Convert screen coordinates to canvas world coordinates
     const position = screenToWorld(
       event.clientX - reactFlowBounds.left,
       event.clientY - reactFlowBounds.top,
       useNodeStore.getState().viewport
     );
 
     const newNode = NodeFactory.createNode({
       type,
       entityId,
       contextId: worldId as string,
       contextType: 'world',
       posCanvas: position,
       scope: 'world'
     });
 
     useNodeStore.getState().addNode(newNode);
   }, [ worldId ]);
 
   const onDragOver = useCallback((event: React.DragEvent) => {
     event.preventDefault();
     event.dataTransfer.dropEffect = 'copy';
   }, []);
 
   // Persist layout changes
   useEffect(() => {
     if (nodes.length > 0 && worldId) {
       debouncedPersistLayout(nodes, worldId, 'world');
     }
   }, [ nodes, worldId ]);
 
   return (
     <div className="w-full h-screen bg-gray-950 text-foreground relative font-sans" ref={ reactFlowWrapper }>
       <ReactFlow
         nodes={ nodes }
         edges={ edges }
         onNodesChange={ onNodesChange }
         onEdgesChange={ onEdgesChange }
         onConnect={ onConnect }
         nodeTypes={ nodeTypes }
         onDrop={ onDrop }
         onDragOver={ onDragOver }
         onMove={ (evt, viewport) => setViewport(viewport) }
         fitView
       >
         <Background gap={ 24 } size={ 2 } color="#1f2937" />
         <Controls className="fill-white bg-gray-900 border-gray-700" showInteractive={ false } />
         <MiniMap
           className="bg-gray-900 border-gray-700 rounded-lg overflow-hidden"
           maskColor="rgba(0, 0, 0, 0.4)"
         />
       </ReactFlow>
 
       {/* Overlays */ }
       <CanvasToolbar />
       <TopAssetPanel contextId={ worldId as string } contextType="world" />
       <LeftSidebar />
       <RightSidebar />
     </div>
   );
 }
