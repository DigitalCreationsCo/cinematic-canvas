import "#shared/mocks/mock-supabase.js";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  debouncedPersistLayout,
  clearDebounce,
  flushPendingPersist,
  resetStorage,
} from "#client/store/middleware/canvasIndexedDBStorage.js";

const createMockNodes = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `node-${i}`,
    type: "scene",
    position: { x: i * 100, y: i * 100 },
    width: 200,
    height: 150,
    data: {
      entityId: `node-${i}`,
      contextId: "project-1",
      contextType: "project" as const,
      scope: "project",
      isLocked: false,
      pipelineSelected: false,
      collapsed: false,
      idxVersion: 1,
      nodeTypeFlag: undefined,
    },
  }));

describe("canvasIndexedDBStorage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearDebounce();
    resetStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearDebounce();
    resetStorage();
  });

  describe("flushPendingPersist", () => {
    it("should be a no-op when no pending persist exists", () => {
      // Should not throw and should return silently
      flushPendingPersist();
    });

    it("should flush pending persist immediately", async () => {
      const nodes = createMockNodes(2);
      const onResult = vi.fn();

      // 1. Trigger the debounced call
      debouncedPersistLayout(nodes as any, "project-1", "project", onResult);

      // 2. Flush immediately
      flushPendingPersist();

      /** * 3. Use vi.waitFor to poll for the side effect.
       * This is more robust than manual microtask flushing because it handles
       * the dynamic import and the database mock resolution internally.
       */
      await vi.waitFor(
        () => {
          if (onResult.mock.calls.length === 0) {
            throw new Error("Persist not yet executed");
          }
        },
        {
          timeout: 500, // Reasonable timeout for the mock to resolve
          interval: 20, // Check every 20ms
        },
      );

      expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("should clear the debounce timer when flushing", () => {
      const nodes = createMockNodes(1);

      debouncedPersistLayout(nodes as any, "project-1", "project");

      // Flush clears the timer
      flushPendingPersist();

      // A subsequent flush should be a no-op (no pending persist)
      flushPendingPersist();
    });

    it("should use the latest pending payload when flushed", async () => {
      const nodesFirst = createMockNodes(1);
      const nodesSecond = createMockNodes(3);
      const onResultFirst = vi.fn();
      const onResultSecond = vi.fn();

      // Schedule two debounced persists — second should overwrite first
      debouncedPersistLayout(nodesFirst as any, "project-1", "project", onResultFirst);
      debouncedPersistLayout(nodesSecond as any, "project-1", "project", onResultSecond);

      // Flush — should use the latest (nodesSecond)
      flushPendingPersist();

      await vi.runAllTimersAsync();
      await Promise.resolve();

      // Only the second onResult should fire (first was overwritten)
      expect(onResultFirst).not.toHaveBeenCalled();
      expect(onResultSecond).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe("clearDebounce", () => {
    it("should cancel pending debounce and clear pending args", () => {
      const nodes = createMockNodes(1);
      const onResult = vi.fn();

      debouncedPersistLayout(nodes as any, "project-1", "project", onResult);
      clearDebounce();

      // Advance timers — persist should NOT fire
      vi.advanceTimersByTime(2000);

      expect(onResult).not.toHaveBeenCalled();

      // Flush should also be a no-op after clear
      flushPendingPersist();
    });
  });

  describe("debouncedPersistLayout", () => {
    it("should debounce persist calls", async () => {
      const nodes = createMockNodes(1);
      const onResult = vi.fn();

      debouncedPersistLayout(nodes as any, "project-1", "project", onResult);

      // Before debounce fires
      expect(onResult).not.toHaveBeenCalled();

      // Advance to trigger debounce
      await vi.advanceTimersByTimeAsync(1400);
      await Promise.resolve();

      expect(onResult).toHaveBeenCalledTimes(1);
    });
  });
});
