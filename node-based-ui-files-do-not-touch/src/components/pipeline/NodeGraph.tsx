import React, { useCallback, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Panel,
} from '@xyflow/react';
import { SceneNode } from './SceneNode';
import { BatchCompositeNode } from './BatchCompositeNode';
import { GlobalNotifications, PerformanceMetrics } from './GlobalNotifications';

const nodeTypes = {
  scene: SceneNode,
  batchComposite: BatchCompositeNode,
};

const initialNodes = [
  {
    id: 'scene-1',
    type: 'scene',
    position: { x: 50, y: 100 },
    data: { 
      label: 'SCENE 01: The Approach',
      status: 'complete',
      progress: 100,
      description: 'Establishing shot of the city at night, rain pouring.',
      time: '0:00 - 0:06',
      characters: [],
      location: 'loc-1'
    },
  },
  {
    id: 'scene-2',
    type: 'scene',
    position: { x: 450, y: 100 },
    data: { 
      label: 'SCENE 02: Cafe Interior',
      status: 'generating',
      progress: 45,
      description: 'Close up on hacker terminal. Neon lights reflecting.',
      time: '0:06 - 0:12',
      characters: ['char-1'],
      location: 'loc-2'
    },
  },
  {
    id: 'composite-1',
    type: 'batchComposite',
    position: { x: 450, y: 400 },
    data: {},
  },
  {
    id: 'scene-3',
    type: 'scene',
    position: { x: 850, y: 100 },
    data: { 
      label: 'SCENE 03: The Breach',
      status: 'pending',
      progress: 0,
      description: 'Terminal turns red, alarms blare, rapid pan.',
      time: '0:12 - 0:18',
      characters: ['char-1'],
      location: 'loc-2'
    },
  },
  {
    id: 'scene-4',
    type: 'scene',
    position: { x: 1250, y: 100 },
    data: { 
      label: 'SCENE 04: Escape',
      status: 'error',
      progress: 10,
      description: 'Running down the alleyway, tracking shot.',
      time: '0:18 - 0:24',
      characters: ['char-1'],
      location: 'loc-3',
      errorMessage: 'Generation failed: GPU Timeout on upscale'
    },
  }
];

const initialEdges = [
  { id: 'e1-2', source: 'scene-1', target: 'scene-2', animated: true, style: { stroke: 'hsl(var(--success))' } },
  { id: 'e1-c1', source: 'scene-1', target: 'composite-1', type: 'step', style: { stroke: 'hsl(var(--muted-foreground))', strokeDasharray: '4 4' } },
  { id: 'e2-3', source: 'scene-2', target: 'scene-3', animated: true, style: { stroke: 'hsl(var(--primary))' } },
  { id: 'e3-4', source: 'scene-3', target: 'scene-4' },
];

export function NodeGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div className="w-full h-full bg-background relative" style={{ background: 'radial-gradient(circle at 2px 2px, hsl(var(--border)) 1px, transparent 0)', backgroundSize: '24px 24px' }}>
      <GlobalNotifications />
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="dark"
        minZoom={0.2}
      >
        <Panel position="top-left" className="bg-card/80 backdrop-blur-md border border-border p-2 rounded-md shadow-sm">
          <div className="text-[10px] font-mono flex flex-col gap-1.5">
            <span className="text-muted-foreground uppercase tracking-wider font-bold">Pipeline Status</span>
            <div className="flex gap-4">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-success"></div> COMPLETE (1)</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div> GENERATING (1)</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-destructive"></div> FAILED (1)</span>
            </div>
          </div>
        </Panel>
        
        <Controls showInteractive={false} className="!bg-card border-border" />
        
        <MiniMap 
          zoomable 
          pannable 
          nodeColor={(n) => {
            if (n.type === 'batchComposite') return 'hsl(var(--muted-foreground))';
            if (n.data.status === 'complete') return 'hsl(var(--success))';
            if (n.data.status === 'generating') return 'hsl(var(--primary))';
            if (n.data.status === 'error') return 'hsl(var(--destructive))';
            return 'hsl(var(--muted))';
          }}
          className="!bg-card border-border border rounded-md overflow-hidden" 
          maskColor="hsl(var(--background)/0.7)"
        />
      </ReactFlow>

      <PerformanceMetrics />
    </div>
  );
}