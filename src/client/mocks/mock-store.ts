// src/client/mocks/mock-store.ts
import { vi, beforeEach } from "vitest";

const noopUnsubscribe = vi.hoisted(() => () => {});

vi.mock("#client/store/useNodeStore.js", async () => {
  const mockedModule = await vi.importMock<typeof import("#client/store/useNodeStore.js")>(
    "#client/store/useNodeStore.js",
  );

  let currentState: any = null;

  const storeMock = vi.fn((selector?: (s: any) => any) => {
    if (!currentState) currentState = mockedModule.useNodeStore.getState();
    return typeof selector === "function" ? selector(currentState) : currentState;
  });

  const mockStoreMethods = {
    getState: vi.fn(() => {
      if (!currentState) currentState = mockedModule.useNodeStore.getState();
      return currentState;
    }),
    setState: vi.fn((nextStateOrUpdater) => {
      if (!currentState) currentState = mockedModule.useNodeStore.getState();
      const next = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(currentState) : nextStateOrUpdater;
      currentState = { ...currentState, ...next };
    }),
    subscribe: vi.fn(() => () => {}),
    destroy: vi.fn(),
  };

  return {
    ...mockedModule,
    useNodeStore: Object.assign(storeMock, mockStoreMethods),
  };
});

vi.mock("#client/store/useProjectStore.js", async () => {
  const mockedModule = await vi.importMock<typeof import("#client/store/useProjectStore.js")>(
    "#client/store/useProjectStore.js",
  );

  let currentState: any = null;

  const storeMock = vi.fn((selector?: (s: any) => any) => {
    if (!currentState) currentState = mockedModule.useProjectStore.getState();
    return typeof selector === "function" ? selector(currentState) : currentState;
  });

  const mockStoreMethods = {
    getState: vi.fn(() => {
      if (!currentState) currentState = mockedModule.useProjectStore.getState();
      return currentState;
    }),
    setState: vi.fn((nextStateOrUpdater) => {
      if (!currentState) currentState = mockedModule.useProjectStore.getState();
      const next = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(currentState) : nextStateOrUpdater;
      currentState = { ...currentState, ...next };
    }),
    subscribe: vi.fn(() => () => {}),
    destroy: vi.fn(),
  };

  return {
    ...mockedModule,
    useProjectStore: Object.assign(storeMock, mockStoreMethods),
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

import { enableMapSet } from "immer";
enableMapSet();

// ─── 1. Mock useAssetStore ────────────────────────────────────────────────────
//
// useProjectStore imports useAssetStore at the top of the module, so we mock
// it before any store code runs.

export const mockNormalizeFromProject = vi.fn();
export const mockMergeAssets = vi.fn();

// ─── 2. Mock useNodeStore ─────────────────────────────────────────────────────
//
// useProjectStore.ts has module-level subscription code:
//
//   const nodeUnsubscribe = useNodeStore.subscribe(...)
//   const sceneUnsubscribe = useProjectStore.subscribe(...)
//
// Without this mock, importing the store in tests triggers the real subscription
// logic, which requires a full React/ReactFlow environment and causes
// "Cannot read properties of undefined" crashes.

// ─── 3. Reset helpers ─────────────────────────────────────────────────────────

/**
 * Resets the store back to a blank slate and clears all mock call history.
 * Call this in beforeEach so tests never bleed state into each other.
 *
 *   beforeEach(() => resetProjectStore());
 */
export async function resetProjectStore() {
  const { useProjectStore } = await import("#client/store/useProjectStore.js");
  const { useNodeStore } = await import("#client/store/useNodeStore.js");
  useProjectStore.getState().clearSession?.();
  useNodeStore.setState({ nodes: [], edges: [], softDeletedNodes: [] });
  vi.clearAllMocks();
}

// ─── 5. Auto-reset between tests ─────────────────────────────────────────────
//
// When this file is used as a setupFile, this runs automatically before every
// test in the suite without any boilerplate in individual test files.

beforeEach(async () => {
  await resetProjectStore();
});
