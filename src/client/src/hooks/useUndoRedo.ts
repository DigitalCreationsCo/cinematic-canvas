// src/client/src/hooks/useUndoRedo.ts
//
// Wraps zundo's undo/redo with a pending-changes sync.
//
// WHY THIS EXISTS:
//   When the user undoes a canvas action (e.g. drawing a connection), the
//   useNodeStore is restored to its pre-change state — edges revert, node
//   counts revert. But useCanvasInteractionStore still holds the pending change
//   entries for those edges. Without clearing them, badges and the
//   PendingChangesBar would show stale data after undo/redo.
//
//   This hook is the single place that coordinates both stores. CanvasToolbar
//   should use this instead of calling useNodeStore.temporal.getState() directly.
//
// USAGE:
//   const { undo, redo, canUndo, canRedo } = useUndoRedo();

import { useCallback } from "react";
import { useNodeStore } from "#client/store/useNodeStore.js";
import { useCanvasInteractionStore } from "#client/store/useCanvasInteractionStore.js";

// ============================================================================
// TYPES
// ============================================================================

interface UseUndoRedoResult {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

export function useUndoRedo(): UseUndoRedoResult {
  // Subscribe only to the temporal store shape for canUndo/canRedo — this is
  // a live subscription so the buttons update correctly without a manual read.
  // @ts-ignore — temporal is added by the zundo middleware at runtime
  const temporalStore = useNodeStore.temporal;

  // Read live past/future counts for button enabled state.
  // These are accessed via getState() to avoid a render on every temporal update;
  // the CanvasToolbar already re-renders when the store changes via subscription.
  const getPastCount = () => temporalStore?.getState()?.pastStates?.length ?? 0;
  const getFutureCount = () => temporalStore?.getState()?.futureStates?.length ?? 0;

  const undo = useCallback(() => {
    const temporal = temporalStore?.getState();
    if (!temporal || temporal.pastStates.length === 0) return;

    temporal.undo();

    // Clear pending changes: the edge store was just restored to a pre-change
    // state, so any pending-add/remove entries are now inconsistent.
    useCanvasInteractionStore.getState().clearPendingChanges();
  }, [temporalStore]);

  const redo = useCallback(() => {
    const temporal = temporalStore?.getState();
    if (!temporal || temporal.futureStates.length === 0) return;

    temporal.redo();

    // Same reasoning: redo restores a future state; pending changes must reset.
    useCanvasInteractionStore.getState().clearPendingChanges();
  }, [temporalStore]);

  return {
    undo,
    redo,
    canUndo: getPastCount() > 0,
    canRedo: getFutureCount() > 0,
  };
}
