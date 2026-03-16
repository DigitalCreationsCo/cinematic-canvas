// src/client/src/components/canvas/PendingChangesBar.tsx
//
// A floating panel rendered inside the ReactFlow canvas.
// Appears when there are unsaved connection changes; hidden otherwise.
//
// Shows:
//   • Count of pending-add connections (amber)
//   • Count of pending-remove connections (red)
//   • "Save Changes" button → commits all changes to the project entity store
//   • "Discard" button → reverts all pending-add / pending-remove edges
//
// Wiring (inside the <ReactFlow> element in NodeGraph):
//   <PendingChangesBar projectId={projectId} />

import { useCallback } from 'react';
import { Panel } from '@xyflow/react';
import { Check, X, GitBranch, Loader2 } from 'lucide-react';
import { Button } from '../ui/button.js';
import { useCanvasInteractionStore } from '#/store/useCanvasInteractionStore.js';
import { useSavePendingChanges } from '#/hooks/useSavePendingChanges.js';

interface PendingChangesBarProps {
    projectId: string;
}

export function PendingChangesBar({ projectId }: PendingChangesBarProps) {
    const pendingChanges = useCanvasInteractionStore((s) => s.pendingChanges);
    const { save, discard, isSaving, error } = useSavePendingChanges(projectId);

    // Derive counts directly from the Map to avoid stale closures.
    const addCount = countByType(pendingChanges, 'add');
    const removeCount = countByType(pendingChanges, 'remove');
    const total = pendingChanges.size;

    // Don't render when there's nothing to show.
    if (total === 0) return null;

    return (
        <Panel
            position="bottom-center"
            className="mb-4 pointer-events-auto"
            style={{ zIndex: 50 }}
        >
            <div
                className="
          flex items-center gap-3
          bg-card/95 backdrop-blur-md
          border border-border
          rounded-xl px-4 py-2.5
          shadow-2xl shadow-black/30
          animate-in slide-in-from-bottom-2 duration-200
        "
            >
                {/* Icon */}
                <GitBranch className="w-4 h-4 text-muted-foreground shrink-0" />

                {/* Change summary */}
                <div className="flex items-center gap-2 text-sm font-mono">
                    <span className="text-muted-foreground">Unsaved:</span>

                    {addCount > 0 && (
                        <span className="flex items-center gap-1 text-amber-400 font-semibold">
                            <span
                                className="inline-block w-2 h-2 rounded-full bg-amber-400"
                                aria-hidden
                            />
                            +{addCount}
                        </span>
                    )}

                    {removeCount > 0 && (
                        <span className="flex items-center gap-1 text-red-400 font-semibold">
                            <span
                                className="inline-block w-2 h-2 rounded-full bg-red-400"
                                aria-hidden
                            />
                            −{removeCount}
                        </span>
                    )}
                </div>

                {/* Divider */}
                <div className="w-px h-4 bg-border" aria-hidden />

                {/* Save */}
                <Button
                    size="sm"
                    onClick={save}
                    disabled={isSaving}
                    className="
            h-7 px-3 text-xs font-semibold font-mono
            bg-emerald-600 hover:bg-emerald-500
            text-white border-0
            disabled:opacity-50
          "
                >
                    {isSaving ? (
                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    ) : (
                        <Check className="w-3 h-3 mr-1.5" />
                    )}
                    {isSaving ? 'Saving…' : 'Save changes'}
                </Button>

                {/* Discard */}
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={discard}
                    disabled={isSaving}
                    className="h-7 px-3 text-xs font-mono text-muted-foreground hover:text-destructive"
                >
                    <X className="w-3 h-3 mr-1" />
                    Discard
                </Button>

                {/* Inline error */}
                {error && (
                    <span
                        className="text-xs text-destructive font-mono max-w-48 truncate"
                        title={error}
                    >
                        {error}
                    </span>
                )}
            </div>
        </Panel>
    );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function countByType(
    changes: Map<string, { changeType: 'add' | 'remove' }>,
    type: 'add' | 'remove',
): number {
    let n = 0;
    changes.forEach((c) => { if (c.changeType === type) n++; });
    return n;
}