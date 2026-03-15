// src/client/src/store/useNodeStore.ts
// React Flow state management.
// Manages nodes, edges, viewport, and selection.
// Wrapped with zundo for temporal undo/redo of positional changes.
//
// NOTE ON SELECTION:
//   selectedNodeId lives in useCanvasUIStore, not here. That store owns all
//   transient UI state (sidebar open, tabs, layout mode, playback, etc.).
//   Keeping selection there avoids polluting zundo's temporal history with
//   ephemeral UI events and keeps the separation of concerns clean:
//     useNodeStore   → structural canvas state (undoable)
//     useCanvasUIStore → transient view state (not tracked)

import { create } from 'zustand';
import { temporal } from 'zundo';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
  addEdge,
} from '@xyflow/react';
import type { CanvasNode, CanvasEdge } from '../domain/canvas/NodeTypes.js';

export interface NodeStoreState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: { x: number; y: number; zoom: number; };

  setNodes: (nodes: CanvasNode[]) => void;
  setEdges: (edges: CanvasEdge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  addNode: (node: CanvasNode) => void;
  deleteNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<CanvasNode['data']>) => void;

  addEdge: (edge: CanvasEdge) => void;
  deleteEdge: (id: string) => void;

  setViewport: (viewport: { x: number; y: number; zoom: number; }) => void;
}

export const useNodeStore = create<NodeStoreState>()(
  subscribeWithSelector(
    temporal(
      (set, get) => ({
        nodes: [] as CanvasNode[],
        edges: [] as CanvasEdge[],
        viewport: { x: 0, y: 0, zoom: 1 },

        setNodes: (nodes: CanvasNode[]) => set({ nodes }),
        setEdges: (edges: CanvasEdge[]) => set({ edges }),

        onNodesChange: (changes: NodeChange[]) =>
          set({ nodes: applyNodeChanges(changes, get().nodes) as CanvasNode[] }),
        onEdgesChange: (changes: EdgeChange[]) =>
          set({ edges: applyEdgeChanges(changes, get().edges) as CanvasEdge[] }),
        onConnect: (connection: Connection) =>
          set({ edges: addEdge(connection, get().edges) as CanvasEdge[] }),

        addNode: (node: CanvasNode) => set({ nodes: [...get().nodes, node] }),
        deleteNode: (id: string) =>
          set({
            nodes: get().nodes.filter((n) => n.id !== id),
            edges: get().edges.filter((e) => e.source !== id && e.target !== id),
          }),
        updateNodeData: (id: string, data: Partial<CanvasNode['data']>) =>
          set({
            nodes: get().nodes.map((n) =>
              n.id === id ? { ...n, data: { ...n.data, ...data } } : n
            ),
          }),

        addEdge: (edge: CanvasEdge) => set({ edges: [...get().edges, edge] }),
        deleteEdge: (id: string) =>
          set({ edges: get().edges.filter((e) => e.id !== id) }),

        setViewport: (viewport: { x: number; y: number; zoom: number; }) =>
          set({ viewport }),
      }),
      {
        partialize: (state) => ({
          nodes: state.nodes,
          edges: state.edges,
        }),
        equality: (pastState, currentState) =>
          pastState.nodes === currentState.nodes &&
          pastState.edges === currentState.edges,
        limit: 50,
      }
    )
  )
);