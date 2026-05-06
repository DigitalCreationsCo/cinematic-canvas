// src/client/mocks/mock-store.ts
import { vi, beforeEach } from "vitest";

// ─── Mock NodeStore with isolated state (no temporal middleware) ─────────────
// Creates a fresh mock store that doesn't reference the real store at all,
// preventing OOM from zustand temporal middleware history accumulation.

const createMockNodeStore = () => {
  // Action methods - defined outside state so they persist across setState calls
  const actions = {
    addNode: vi.fn((node: any) => {
      const currentState = getState();
      setState({ nodes: [...currentState.nodes, node] });
    }),
    addEdge: vi.fn((edge: any) => {
      const currentState = getState();
      setState({ edges: [...currentState.edges, edge] });
    }),
    updateNodeData: vi.fn((id: string, data: any) => {
      const currentState = getState();
      setState({
        nodes: currentState.nodes.map((n: any) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)),
      });
    }),
    deleteEdge: vi.fn((id: string) => {
      const currentState = getState();
      setState({ edges: currentState.edges.filter((e: any) => e.id !== id) });
    }),
    setNodes: vi.fn((nodes: any[]) => {
      setState({ nodes });
    }),
    setEdges: vi.fn((edges: any[]) => {
      setState({ edges });
    }),
    setViewport: vi.fn((viewport: any) => {
      setState({ viewport });
    }),
  };

  let state = {
    nodes: [] as any[],
    edges: [] as any[],
    softDeletedNodes: [] as string[],
    viewport: { x: 0, y: 0, zoom: 1 },
    ...actions, // Include actions in initial state
  };

  const listeners = new Set<() => void>();

  const getState = () => state;
  const setState = (nextStateOrUpdater: any) => {
    const next = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(state) : nextStateOrUpdater;
    // Preserve action methods when state is updated
    state = { ...state, ...next, ...actions };
    listeners.forEach((listener) => listener());
  };

  const useStore = vi.fn((selector?: (s: any) => any) => {
    return typeof selector === "function" ? selector(state) : state;
  });

  return Object.assign(useStore, {
    getState: vi.fn(getState),
    setState: vi.fn(setState),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    destroy: vi.fn(),
    _reset: () => {
      state = {
        nodes: [],
        edges: [],
        softDeletedNodes: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        ...actions,
      };
    },
  });
};

const mockNodeStore = createMockNodeStore();

vi.mock("#client/store/useNodeStore.js", () => {
  return {
    useNodeStore: mockNodeStore,
  };
});

// ─── Mock ProjectStore with isolated state ────────────────────────────────

const createMockProjectStore = () => {
  let state = {
    currentProjectId: null as string | null,
    projects: [] as any[],
    isLoading: false,
  };

  const listeners = new Set<() => void>();

  const useStore = vi.fn((selector?: (s: any) => any) => {
    return typeof selector === "function" ? selector(state) : state;
  });

  return Object.assign(useStore, {
    getState: vi.fn(() => state),
    setState: vi.fn((nextStateOrUpdater: any) => {
      const next = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(state) : nextStateOrUpdater;
      state = { ...state, ...next };
      listeners.forEach((listener) => listener());
    }),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    destroy: vi.fn(),
    _reset: () => {
      state = {
        currentProjectId: null,
        projects: [],
        isLoading: false,
      };
    },
  });
};

const mockProjectStore = createMockProjectStore();

vi.mock("#client/store/useProjectStore.js", () => {
  return {
    useProjectStore: mockProjectStore,
  };
});

// It wires up vi.mock() for major client dependency stores, exports reset / spy helpers,
// and gives you a typed handle on every mock so tests stay clean.
//
// ⚠️  vi.mock() calls inside an imported module are NOT auto-hoisted the same
//     way top-level calls in test files are. To guarantee correct ordering,
//     this file has been added to `setupFiles` in vitest.config.ts instead of relying
//     on the import order inside a test:
//
//   // vitest.config.ts
//   export default defineConfig({
//     test: { setupFiles: ["src/client/mocks/mock-store.ts"] }
//   });

// ─── 1. Mock useAssetStore ────────────────────────────────────────────────────
// (Add asset store mock here if needed)

export const mockNormalizeFromProject = vi.fn();
export const mockMergeAssets = vi.fn();

// ─── 2. Reset helpers ─────────────────────────────────────────────────────────

/**
 * Resets the store back to a blank slate and clears all mock call history.
 * Call this in beforeEach so tests never bleed state into each other.
 *
 *   beforeEach(() => resetProjectStore());
 */
export function resetProjectStore() {
  mockNodeStore._reset();
  mockProjectStore._reset();
  vi.clearAllMocks();
}

// ─── 3. Auto-reset between tests ─────────────────────────────────────────────
//
// When this file is used as a setupFile, this runs automatically before every
// test in the suite without any boilerplate in individual test files.

beforeEach(() => {
  resetProjectStore();
});
