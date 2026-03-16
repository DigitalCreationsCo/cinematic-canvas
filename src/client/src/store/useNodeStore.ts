import { create } from 'zustand';
import { temporal } from 'zundo';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Connection,
  addEdge,
} from '@xyflow/react';
import type {
  CanvasNode,
  CanvasEdge,
  CanvasEdgeData
} from '../domain/canvas/NodeTypes.js';

export interface NodeStoreState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  softDeletedNodes: string[];
  viewport: { x: number; y: number; zoom: number };

  setNodes: (nodes: CanvasNode[]) => void;
  setEdges: (edges: CanvasEdge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  addNode: (node: CanvasNode) => void;
  /** soft param defaults to true for soft-delete logic */
  deleteNode: (id: string, soft?: boolean) => void;
  restoreNode: (id: string) => void;
  permanentlyDeleteNode: (id: string) => void;
  isNodeSoftDeleted: (id: string) => boolean;
  getConnectedEdges: (nodeId: string) => CanvasEdge[];
  updateNodeData: (id: string, data: Partial<CanvasNode['data']>) => void;

  addEdge: (edge: CanvasEdge) => void;
  deleteEdge: (id: string) => void;
  updateEdgeData: (id: string, data: Partial<CanvasEdgeData>) => void;

  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
}

const DEBOUNCE_MS = 1000;

export const useNodeStore = create<NodeStoreState>()(
  subscribeWithSelector(
    temporal(
      (set, get) => ({
        nodes: [] as CanvasNode[],
        edges: [] as CanvasEdge[],
        softDeletedNodes: [] as string[],
        viewport: { x: 0, y: 0, zoom: 1 },

        setNodes: (nodes) => set({ nodes }),
        setEdges: (edges) => set({ edges }),

        onNodesChange: (changes) =>
          set({ nodes: applyNodeChanges(changes, get().nodes) as CanvasNode[] }),
        onEdgesChange: (changes) =>
          set({ edges: applyEdgeChanges(changes, get().edges) as CanvasEdge[] }),
        onConnect: (connection) =>
          set({ edges: addEdge(connection, get().edges) as CanvasEdge[] }),

        addNode: (node) => set({ nodes: [...get().nodes, node] }),
        deleteNode: (id, soft = true) => {
          const nodeToDelete = get().nodes.find((n) => n.id === id);
          
          if (nodeToDelete?.type === 'metadata') {
            return;
          }
          
          const nodes = get().nodes.filter((n) => n.id !== id);
          const edges = get().edges.filter((e) => e.source !== id && e.target !== id);

          if (soft) {
            set({
              softDeletedNodes: [...get().softDeletedNodes, id],
              nodes,
              edges,
            });
          } else {
            set({ nodes, edges });
          }
        },
        restoreNode: (id) => {
          if (!get().softDeletedNodes.includes(id)) return;
          set({
            softDeletedNodes: get().softDeletedNodes.filter((nid) => nid !== id),
          });
        },
        permanentlyDeleteNode: (id) => {
          set({
            softDeletedNodes: get().softDeletedNodes.filter((nid) => nid !== id),
          });
        },
        isNodeSoftDeleted: (id) => get().softDeletedNodes.includes(id),
        getConnectedEdges: (nodeId) =>
          get().edges.filter((e) => e.source === nodeId || e.target === nodeId),
        updateNodeData: (id, data) =>
          set({
            nodes: get().nodes.map((n) =>
              n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
            ),
          }),

        addEdge: (edge) => set({ edges: [...get().edges, edge] }),
        deleteEdge: (id) =>
          set({ edges: get().edges.filter((e) => e.id !== id) }),
        updateEdgeData: (id, data) =>
          set({
            edges: get().edges.map((e) =>
              e.id === id ? { ...e, data: { ...e.data, ...data } } : e,
            ),
          }),

        setViewport: (viewport) => set({ viewport }),
      }),
      {
        partialize: (state) => ({
          nodes: state.nodes,
          edges: state.edges,
          softDeletedNodes: state.softDeletedNodes,
        }),
        limit: 50,
        handleSet: (handleSet) => {
          let debounceTimer: ReturnType<typeof setTimeout> | null = null;

          return (_pastState, _replace, currentPartialState) => {
            const stateToSave = {
              nodes: currentPartialState?.nodes ?? [],
              edges: currentPartialState?.edges ?? [],
              softDeletedNodes: currentPartialState?.softDeletedNodes ?? [],
            };

            if (debounceTimer) clearTimeout(debounceTimer);

            debounceTimer = setTimeout(() => {
              handleSet(stateToSave, false);
            }, DEBOUNCE_MS);
          };
        },
      },
    ),
  ),
);