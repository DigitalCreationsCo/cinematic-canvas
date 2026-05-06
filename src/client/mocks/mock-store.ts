// src/client/mocks/mock-store.ts

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

import { vi, beforeEach } from "vitest";
import { enableMapSet } from "immer";
import { createDeepMock } from "#shared/mocks/mock.utils.js";

enableMapSet();

// ─── 1. Mock useAssetStore ────────────────────────────────────────────────────
//
// useProjectStore imports useAssetStore at the top of the module, so we mock
// it before any store code runs.

export const mockNormalizeFromProject = vi.fn();
export const mockMergeAssets = vi.fn();

vi.mock("@xyflow/react", () => createDeepMock());

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

vi.mock("#client/store/useNodeStore.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("#client/store/useNodeStore.js");
  const realStore = actual.useNodeStore;

  // 1. Define only the specific methods you want to override/mock
  const overrides = {
    onNodesChange: vi.fn(),
    deleteNode: vi.fn(),
    permanentlyDeleteNode: vi.fn(),
  };

  // 2. Create the hook mock that merges live state with overrides
  const useNodeStoreMock = vi.fn((selector) => {
    const currentState = { ...realStore.getState(), ...overrides };
    return typeof selector === "function" ? selector(currentState) : currentState;
  });

  // 3. Attach static properties and ensure .getState() is dynamic
  Object.assign(useNodeStoreMock, realStore, {
    getState: vi.fn(() => ({ ...realStore.getState(), ...overrides })),
    // Ensure setState and subscribe remain the real ones so logic works
    setState: realStore.setState,
    subscribe: realStore.subscribe,
  });

  return {
    ...actual,
    useNodeStore: useNodeStoreMock,
  };
});

vi.mock("#client/store/useProjectStore.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#client/store/useProjectStore.js")>();
  const realStore = actual.useProjectStore;

  // 1. Define only the specific methods you want to override
  const overrides = {
    hydrateProject: vi.fn(),
    // any other specific mocks...
  };

  // 2. Create the hook mock
  const useProjectStoreMock = vi.fn((selector) => {
    // Merge real live state with your overrides
    const currentState = { ...realStore.getState(), ...overrides };
    return typeof selector === "function" ? selector(currentState) : currentState;
  });

  // 3. Sync static properties
  Object.assign(useProjectStoreMock, realStore, {
    // Critical: getState must return the LIVE state merged with mocks
    getState: vi.fn(() => ({ ...realStore.getState(), ...overrides })),
  });

  return {
    ...actual,
    useProjectStore: useProjectStoreMock,
  };
});

// ─── 3. Reset helpers ─────────────────────────────────────────────────────────

/**
 * Resets the store back to a blank slate and clears all mock call history.
 * Call this in beforeEach so tests never bleed state into each other.
 *
 *   beforeEach(() => resetProjectStore());
 */
export async function resetProjectStore() {
  // Dynamic import avoids a circular dep — the store is only resolved after
  // the vi.mock() calls above have been registered.
  const { useProjectStore } = await import("#client/store/useProjectStore.js");
  useProjectStore.getState().clearSession();
  vi.clearAllMocks();
}

// ─── 5. Auto-reset between tests ─────────────────────────────────────────────
//
// When this file is used as a setupFile, this runs automatically before every
// test in the suite without any boilerplate in individual test files.

beforeEach(async () => {
  await resetProjectStore();
});
