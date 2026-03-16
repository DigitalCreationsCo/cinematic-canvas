// src/client/src/store/useNodeStore.ts
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
import type { CanvasNode, CanvasEdge, CanvasEdgeData } from '../domain/canvas/NodeTypes.js';
import { makeCanvasStateDebounce } from './middleware/canvasStateDebounce.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEBOUNCE_MS = 1000;

// ============================================================================
// TYPES
// ============================================================================

export interface NodeStoreState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  softDeletedNodes: string[];
  viewport: { x: number; y: number; zoom: number };

  // ── Bulk setters ──────────────────────────────────────────────────────────
  setNodes: (nodes: CanvasNode[]) => void;
  setEdges: (edges: CanvasEdge[]) => void;

  // ── ReactFlow event handlers ──────────────────────────────────────────────
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  /** Raw ReactFlow connect handler — prefer useCanvasConnections.onConnect. */
  onConnect: (connection: Connection) => void;

  // ── Node CRUD ─────────────────────────────────────────────────────────────
  addNode: (node: CanvasNode) => void;
  /** Updates node position efficiently without delete+add cycle */
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  /** soft defaults to true. Metadata nodes are always protected. */
  deleteNode: (id: string, soft?: boolean) => void;
  restoreNode: (id: string) => void;
  permanentlyDeleteNode: (id: string) => void;
  isNodeSoftDeleted: (id: string) => boolean;
  getConnectedEdges: (nodeId: string) => CanvasEdge[];
  updateNodeData: (id: string, data: Partial<CanvasNode['data']>) => void;

  // ── Edge CRUD ─────────────────────────────────────────────────────────────
  addEdge: (edge: CanvasEdge) => void;
  deleteEdge: (id: string) => void;
  /** Merges partial data onto an existing edge (e.g. pending-type transitions). */
  updateEdgeData: (id: string, data: Partial<CanvasEdgeData>) => void;

  // ── Viewport ──────────────────────────────────────────────────────────────
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
}

// ============================================================================
// STORE
// ============================================================================

export const useNodeStore = create<NodeStoreState>()(
  subscribeWithSelector(
    temporal(
      (set, get) => ({
        nodes: [] as CanvasNode[],
        edges: [] as CanvasEdge[],
        softDeletedNodes: [] as string[],
        viewport: { x: 0, y: 0, zoom: 1 },

        // ── Bulk setters ───────────────────────────────────────────────────
        setNodes: (nodes) => set({ nodes }),
        setEdges: (edges) => set({ edges }),

        // ── ReactFlow handlers ─────────────────────────────────────────────
        onNodesChange: (changes) =>
          set({ nodes: applyNodeChanges(changes, get().nodes) as CanvasNode[] }),
        onEdgesChange: (changes) =>
          set({ edges: applyEdgeChanges(changes, get().edges) as CanvasEdge[] }),
        onConnect: (connection) =>
          set({ edges: addEdge(connection, get().edges) as CanvasEdge[] }),

        // ── Node CRUD ──────────────────────────────────────────────────────
        addNode: (node) => set({ nodes: [...get().nodes, node] }),

        updateNodePosition: (id, position) =>
          set({
            nodes: get().nodes.map((n) =>
              n.id === id ? { ...n, position } : n
            ),
          }),

        deleteNode: (id, soft = true) => {
          const nodeToDelete = get().nodes.find((n) => n.id === id);
          // Metadata node is indestructible — it anchors the project root edge.
          if (nodeToDelete?.type === 'metadata') return;

          const nodes = get().nodes.filter((n) => n.id !== id);
          const edges = get().edges.filter(
            (e) => e.source !== id && e.target !== id,
          );

          if (soft) {
            set({ softDeletedNodes: [...get().softDeletedNodes, id], nodes, edges });
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

        // ── Viewport ───────────────────────────────────────────────────────
        // Viewport is NOT partialized (pan/zoom should not pollute undo history).
        setViewport: (viewport) => set({ viewport }),
      }),

      // ── Zundo temporal options ────────────────────────────────────────────
      {
        // Only track canvas structure — not viewport (pan/zoom should not undo).
        partialize: (state) => ({
          nodes: state.nodes,
          edges: state.edges,
          softDeletedNodes: state.softDeletedNodes,
        }),

        limit: 50,

        // Delegate debounce logic to the canvasStateDebounce utility.
        // This ensures edge mutations (add, remove, style-update for pending-remove)
        // are all captured in undo history with proper pre-burst snapshotting.
        handleSet: makeCanvasStateDebounce(DEBOUNCE_MS) as any,
      },
    ),
  ),
);