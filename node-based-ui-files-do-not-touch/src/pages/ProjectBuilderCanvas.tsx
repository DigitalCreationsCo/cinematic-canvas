import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useParams } from 'wouter';
import { useShallow } from 'zustand/shallow';
import {
  ReactFlow, Background, Controls, MiniMap
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useNodeStore } from '../../store/useNodeStore.js';
import { debouncedPersistLayout } from '../../store/middleware/indexedDBStorage.js';

import { nodeTypes } from './nodes/index.js';
import { TopAssetPanel } from './panels/TopAssetPanel.js';
import { LeftSidebar } from './panels/LeftSidebar.js';
import { RightSidebar } from './panels/RightSidebar.js';
import { CanvasToolbar } from './toolbar/CanvasToolbar.js';
import { NodeFactory } from '../../domain/canvas/NodeFactory.js';
import { screenToWorld } from '../../domain/canvas/CoordinateSystem.js';
import { initPubSubCanvasAdapter } from '../../domain/canvas/PubSubCanvasAdapter.js';

import ProjectDashboard from '../../pages/ProjectDashboard.js';

/**
 * Dummy PubSub client used to initialize the adapter before
 * the real WebSocket hooks from the workspace are wired in.
 */
const mockPubSubClient = {
  events: {} as Record<string, ((p: any) => void)[]>,
  on(evt: string, fn: (p: any) => void) {
    if (!this.events[ evt ]) this.events[ evt ] = [];
    this.events[ evt ].push(fn);
  },
  off(evt: string, fn: (p: any) => void) {
    if (!this.events[ evt ]) return;
    this.events[ evt ] = this.events[ evt ].filter(f => f !== fn);
  }
};

export function ProjectBuilderCanvas() {
  const { projectId } = useParams();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Mobile fallback (primitive check)
  const isMobile = window.innerWidth < 768;

  // useShallow prevents this component re-rendering when unrelated nodeStore
  // state changes (e.g. internal viewport updates during drag don't need a
  // full Canvas re-render — ReactFlow handles those internally).
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setViewport, setNodes } = useNodeStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      onConnect: s.onConnect,
      setViewport: s.setViewport,
      setNodes: s.setNodes,
    }))
  );

  useEffect(() => {
    if (!projectId) return;

    // init PubSub adapter
    const teardown = initPubSubCanvasAdapter(projectId, mockPubSubClient);

    // Initial root node if empty
    if (nodes.length === 0) {
      const rootNode = NodeFactory.createNode({
        type: 'metadata',
        entityId: projectId,
        contextId: projectId,
        contextType: 'project',
        posCanvas: { x: 0, y: 0 },
        scope: 'project'
      });
      setNodes([ rootNode ]);
    }

    return () => teardown();
  }, [ projectId ]);

  // Handle Drag & Drop
  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    if (!reactFlowWrapper.current || !projectId) return;
    const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
    const dataRaw = event.dataTransfer.getData('application/json');
    if (!dataRaw) return;

    const { type, entityId } = JSON.parse(dataRaw);

    // World coordinates transform
    const position = screenToWorld(
      event.clientX - reactFlowBounds.left,
      event.clientY - reactFlowBounds.top,
      useNodeStore.getState().viewport
    );

    const newNode = NodeFactory.createNode({
      type,
      entityId,
      contextId: projectId,
      contextType: 'project',
      posCanvas: position,
      scope: 'project'
    });

    useNodeStore.getState().addNode(newNode);
  }, [ projectId ]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  // Persist layout
  useEffect(() => {
    if (nodes.length > 0 && projectId) {
      debouncedPersistLayout(nodes, projectId, 'project');
    }
  }, [ nodes, projectId ]);

  // Render classic dashboard on mobile
  if (isMobile) {
    return <ProjectDashboard />;
  }

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
      <TopAssetPanel contextId={ projectId as string } contextType="project" />
      <LeftSidebar />
      <RightSidebar />
    </div>
  );
}