// src/client/mocks/mock-store.ts
// Setup file for Vitest - mocks store modules with isolated state.
// This prevents OOM errors from zustand temporal middleware accumulation.

import { type NodeStoreState } from "#client/store/useNodeStore.js";
import { ProjectStoreState } from "#client/store/useProjectStore.js";
import { vi } from "vitest";

const _mockUseNodeStore = await vi.hoisted(async () => {
  const actual = await import("#client/store/useNodeStore.js");

  const nodeStoreState: NodeStoreState = {
    nodes: [],
    edges: [],
    softDeletedNodes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };

  const nodeStoreActions = {
    promotePendingNode: vi.fn(),
    addNode: (node: any) => {
      nodeStoreState.nodes = [...nodeStoreState.nodes, node];
    },
    addEdge: (edge: any) => {
      nodeStoreState.edges = [...nodeStoreState.edges, edge];
    },
    updateNodeData: (id: string, data: any) => {
      nodeStoreState.nodes = nodeStoreState.nodes.map((n: any) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
      );
    },
    deleteEdge: (id: string) => {
      nodeStoreState.edges = nodeStoreState.edges.filter((e: any) => e.id !== id);
    },
    deleteNode: (id: string) => {
      nodeStoreState.nodes = nodeStoreState.nodes.filter((n: any) => n.id !== id);
    },
    setNodes: (nodes: any[]) => {
      nodeStoreState.nodes = nodes;
    },
    setEdges: (edges: any[]) => {
      nodeStoreState.edges = edges;
    },
    setViewport: (viewport: any) => {
      nodeStoreState.viewport = viewport;
    },
  };

  const useNodeStore = vi.fn((selector?: (s: any) => any) => {
    const fullState = { ...nodeStoreState, ...nodeStoreActions };
    return typeof selector === "function" ? selector(fullState) : fullState;
  });

  Object.assign(useNodeStore, {
    getState: () => ({ ...nodeStoreState, ...nodeStoreActions }),
    setState: (next: any) => {
      Object.assign(nodeStoreState, typeof next === "function" ? next(nodeStoreState) : next);
    },
    subscribe: (listener: () => void) => {
      return () => {};
    },
    destroy: () => {},
    _reset: () => {
      nodeStoreState.nodes = [];
      nodeStoreState.edges = [];
      nodeStoreState.softDeletedNodes = [];
      nodeStoreState.viewport = { x: 0, y: 0, zoom: 1 };
    },
  });

  return {
    ...actual,
    useNodeStore,
  };
});

vi.mock("#client/store/useNodeStore.js", () => _mockUseNodeStore);

// // ─── Mock CanvasInteractionStore ────────────────────────────

// const canvasInteractionState: any = {
//   initiatorNodeId: null,
//   edgeVisibilityMode: "all",
//   pendingChanges: new Map(),
//   nodesWithPendingChanges: new Set(),
// };

// const recomputeNodes = (changes: Map<string, any>) => {
//   const nodes = new Set<string>();
//   changes.forEach((c: any) => {
//     nodes.add(c.sourceId);
//     nodes.add(c.targetId);
//   });
//   return nodes;
// };

// const canvasInteractionActions = {
//   addPendingChange: (change: any) => {
//     canvasInteractionState.pendingChanges.set(change.edgeId, change);
//     canvasInteractionState.nodesWithPendingChanges = recomputeNodes(canvasInteractionState.pendingChanges);
//   },
//   removePendingChange: (edgeId: string) => {
//     canvasInteractionState.pendingChanges.delete(edgeId);
//     canvasInteractionState.nodesWithPendingChanges = recomputeNodes(canvasInteractionState.pendingChanges);
//   },
//   clearPendingChanges: () => {
//     canvasInteractionState.pendingChanges = new Map();
//     canvasInteractionState.nodesWithPendingChanges = new Set();
//   },
//   getPendingChangesForNode: (nodeId: string) => {
//     const results: any[] = [];
//     canvasInteractionState.pendingChanges.forEach((c: any) => {
//       if (c.sourceId === nodeId || c.targetId === nodeId) results.push(c);
//     });
//     return results;
//   },
//   hasPendingChanges: () => canvasInteractionState.pendingChanges.size > 0,
//   setInitiatorNodeId: (id: string | null) => {
//     canvasInteractionState.initiatorNodeId = id;
//   },
//   toggleEdgeVisibility: () => {
//     canvasInteractionState.edgeVisibilityMode = canvasInteractionState.edgeVisibilityMode === "all" ? "none" : "all";
//   },
//   setEdgeVisibilityMode: (mode: string) => {
//     canvasInteractionState.edgeVisibilityMode = mode;
//   },
// };

// const useCanvasInteractionStore = (selector?: (s: any) => any) => {
//   const fullState = { ...canvasInteractionState, ...canvasInteractionActions };
//   return typeof selector === "function" ? selector(fullState) : fullState;
// };

// Object.assign(useCanvasInteractionStore, {
//   getState: () => ({ ...canvasInteractionState, ...canvasInteractionActions }),
//   setState: (next: any) => {
//     Object.assign(canvasInteractionState, typeof next === "function" ? next(canvasInteractionState) : next);
//   },
//   subscribe: (listener: () => void) => {
//     return () => {};
//   },
//   destroy: () => {},
//   _reset: () => {
//     canvasInteractionState.initiatorNodeId = null;
//     canvasInteractionState.edgeVisibilityMode = "all";
//     canvasInteractionState.pendingChanges = new Map();
//     canvasInteractionState.nodesWithPendingChanges = new Set();
//   },
// });

// vi.mock("#client/store/useCanvasInteractionStore.js", () => ({
//   useCanvasInteractionStore,
// }));

// // ─── Mock ProjectStore ────────────────────────────

const _mockUseProjectStore = await vi.hoisted(async () => {
  const actual = await import("#client/store/useProjectStore.js");

  const projectStoreState: ProjectStoreState = actual.useProjectStore.getState();

  const useProjectStore = vi.fn((selector?: (s: any) => any) => {
    return typeof selector === "function" ? selector(projectStoreState) : projectStoreState;
  });

  Object.assign(useProjectStore, {
    getState: () => projectStoreState,
    setState: (next: any) => {
      Object.assign(projectStoreState, typeof next === "function" ? next(projectStoreState) : next);
    },
    subscribe: (listener: () => void) => {
      return () => {};
    },
    destroy: () => {},
    _reset: () => {
      projectStoreState.currentProjectId = null;
      projectStoreState.projects = [];
      projectStoreState.isLoading = false;
    },
  });

  return {
    ...actual,
    useProjectStore,
  };
});

vi.mock("#client/store/useProjectStore.js", async () => _mockUseProjectStore);

// const { _mockUseNodeStoreWithActualModule } = await vi.hoisted(async () => {
//   const actual = await vi.importMock<typeof import("#client/store/useNodeStore.js")>("#client/store/useNodeStore.js");
//   const mockStore = { ...actual.useNodeStore, subscribe: vi.fn(() => vi.fn()) };
//   return {
//     _mockUseNodeStoreWithActualModule: {
//       ...actual,
//       useNodeStore: mockStore,
//     },
//   };
// });

// vi.mock("#client/store/useNodeStore.js", async () => {
//   return _mockUseNodeStoreWithActualModule;
// });

// const { _mockUseProjectStoreWithActualModule } = await vi.hoisted(async () => {
//   const actual = await import("#client/store/useProjectStore.js");
//   const mockStore = { ...actual.useProjectStore, subscribe: vi.fn(() => vi.fn()) };
//   return {
//     _mockUseProjectStoreWithActualModule: {
//       ...actual,
//       useProjectStore: mockStore,
//     },
//   };
// });

// vi.mock("#client/store/useProjectStore.js", async () => {
//   const actual = await vi.importActual<typeof import("#client/store/useProjectStore.js")>(
//     "#client/store/useProjectStore.js",
//   );
//   actual.useProjectStore.subscribe = vi.fn();
//   return {
//     ...actual,
//   };
// });

// const { useNodeStore } = _mockUseNodeStoreWithActualModule;
// const { useProjectStore } = _mockUseProjectStoreWithActualModule;

export const useNodeStore = _mockUseNodeStore.useNodeStore;
export const useProjectStore = _mockUseProjectStore.useProjectStore;

// export async function resetProjectStore() {
//   (await import("#client/store/useNodeStore.js")).useNodeStore.setState({
//     nodes: [],
//     edges: [],
//     softDeletedNodes: [],
//     viewport: { x: 0, y: 0, zoom: 1 },
//   });
//   (await import("#client/store/useProjectStore.js")).useProjectStore.setState({
//     selectedProjectId: null,
//     scenes: new Map(),
//     characters: new Map(),
//     locations: new Map(),
//     metadata: null,
//     generationRules: null,
//   });
//   (await import("#client/store/useCanvasInteractionStore.js")).useCanvasInteractionStore.setState({
//     initiatorNodeId: null,
//     edgeVisibilityMode: "all",
//     pendingChanges: new Map(),
//     nodesWithPendingChanges: new Set(),
//   });
//   vi.clearAllMocks();
// }

// beforeEach(() => {
//   resetProjectStore();
// });
