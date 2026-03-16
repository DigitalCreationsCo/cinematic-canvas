// src/client/src/store/middleware/canvasStateDebounce.ts
//
// Reusable debounce factory for the zundo `handleSet` option in useNodeStore.
//
// WHY A UTILITY:
//   entityDebounce.ts owns the entity-attribute persistence lifecycle.
//   This utility owns the canvas STATE persistence lifecycle (node positions,
//   edges, soft-delete list). They are orthogonal concerns — keeping them
//   separate means tests, error handling, and flush logic don't intermingle.
//
// DESIGN:
//   The debounce factory captures the PRE-BURST snapshot (pastState) on the
//   first call in a burst, discards subsequent intermediate states, and flushes
//   only once after the quiet period. This ensures:
//     • Undo restores the state as it was BEFORE the burst, not the mid-burst state.
//     • Rapid node drags or edge mutations collapse into one history entry.
//
// USAGE (in useNodeStore):
//   temporal({ handleSet: makeCanvasStateDebounce(DEBOUNCE_MS) })

import { CanvasEdge, CanvasNode } from "#/domain/canvas/NodeTypes.js";

export interface CanvasPartialState {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    softDeletedNodes: string[];
}

/**
 * Returns a `handleSet` factory compatible with zundo's `temporal` option.
 *
 * @param debounceMs  Milliseconds of silence before the history entry is committed.
 */
export function makeCanvasStateDebounce(debounceMs: number) {
    return function handleSetFactory(
        handleSet: (state: CanvasPartialState, replace: boolean) => void,
    ) {
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        // Snapshot of state BEFORE the current burst started.
        // This is what gets pushed to pastStates so undo restores the pre-burst state.
        let preburstSnapshot: CanvasPartialState | null = null;

        return (
            pastState: Partial<CanvasPartialState> | undefined,
            _replace: boolean,
            currentPartialState: Partial<CanvasPartialState> | undefined,
        ): void => {
            // On the first call in a burst, capture the pre-change snapshot.
            // Subsequent calls in the burst update only the latest state for the flush.
            if (!debounceTimer && pastState) {
                preburstSnapshot = {
                    nodes: pastState.nodes ?? [],
                    edges: pastState.edges ?? [],
                    softDeletedNodes: pastState.softDeletedNodes ?? [],
                };
            }

            // Always reset the timer so the flush fires after the last mutation.
            if (debounceTimer) clearTimeout(debounceTimer);

            // Capture the latest state now; it will be the "current" state when flush fires.
            // We need this so that redo after undo restores the post-burst state.
            const latestState: CanvasPartialState = {
                nodes: currentPartialState?.nodes ?? [],
                edges: currentPartialState?.edges ?? [],
                softDeletedNodes: currentPartialState?.softDeletedNodes ?? [],
            };

            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                if (preburstSnapshot) {
                    // Push the pre-burst snapshot: undo will restore this state.
                    handleSet(preburstSnapshot, false);
                    preburstSnapshot = null;
                }
            }, debounceMs);
        };
    };
}