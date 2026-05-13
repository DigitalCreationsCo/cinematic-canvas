import React, { useState, useCallback } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Clock, X, Plus, ImageIcon } from 'lucide-react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useNodeStore } from '#client/store/useNodeStore.js';
import { cn } from '#client/lib/utils.js';
import { NodeShell, NodeShellHeader } from '#client/components/canvas/nodes/NodeShell.js';
import { Button } from '#client/components/ui/button.js';
import { Input } from '#client/components/ui/input.js';
import { trpcClient } from '#client/lib/trpc.js';
import { resolvePublicUrl } from '#shared/utils/utils.js';

export function MetadataNode({ data, selected }: NodeProps<CanvasNode>) {
  const metadata = useProjectStore((state) => state.metadata);
  const styleReferences = useProjectStore((state) => state.styleReferences);
  const addStyleReference = useProjectStore((state) => state.addStyleReference);
  const removeStyleReference = useProjectStore((state) => state.removeStyleReference);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);

  const viewport = useNodeStore((s) => s.viewport);
  const isZoomedIn = viewport.zoom >= 0.3;

  // ── Local state for the "add style reference" input ───────────────────
  const [newRefUrl, setNewRefUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removingUrls, setRemovingUrls] = useState<Set<string>>(new Set());

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleAddReference = useCallback(async () => {
    const url = newRefUrl.trim();
    if (!url || !selectedProjectId || isAdding) return;

    setIsAdding(true);
    setAddError(null);

    try {
      const result = await trpcClient.projects.addStyleReference.mutate({
        projectId: selectedProjectId,
        url,
      });
      if (result.success) {
        // Store the GCS URI (mediaId), NOT the user-provided URL
        addStyleReference(result.gcsUri);
        setNewRefUrl('');
      } else {
        setAddError(result.message);
      }
    } catch (err) {
      console.error('[MetadataNode] Failed to add style reference:', err);
      setAddError(err instanceof Error ? err.message : 'Failed to add style reference');
    } finally {
      setIsAdding(false);
    }
  }, [newRefUrl, selectedProjectId, isAdding, addStyleReference]);

  const handleRemoveReference = useCallback(async (gcsUri: string) => {
    if (!selectedProjectId) return;

    setRemovingUrls((prev) => new Set(prev).add(gcsUri));
    // Optimistic local update — mutation confirms server-side
    removeStyleReference(gcsUri);

    try {
      await trpcClient.projects.removeStyleReference.mutate({
        projectId: selectedProjectId,
        gcsUri,
      });
    } catch (err) {
      console.error('[MetadataNode] Failed to remove style reference:', err);
      addStyleReference(gcsUri);
    } finally {
      setRemovingUrls((prev) => {
        const next = new Set(prev);
        next.delete(gcsUri);
        return next;
      });
    }
  }, [selectedProjectId, removeStyleReference, addStyleReference]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddReference();
    }
  }, [handleAddReference]);

  return (
    <NodeShell
      id={data.entityId}
      data={data}
      selected={selected}
      className={cn(
        `w-86 card-cinematic-glass overflow-hidden z-10 mb-4`,
        selected ? 'node-selected' : 'node',
        !isZoomedIn && selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
    >
      <NodeShellHeader
        className={cn("uppercase")}
        label={metadata?.title || "Project"}
      />

      {!metadata ? (
        <div className="flex flex-col text-center">
          <div className="flex items-center gap-2 p-4 rounded-full animate-pulse">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading Project...</p>
          </div>
        </div>
      ) : isZoomedIn ? (
        <div className="p-4 flex flex-col gap-4">
          {/* ── Style References Section ──────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Style References
              </span>
              {styleReferences.length > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  ({styleReferences.length})
                </span>
              )}
            </div>

            {/* Thumbnail grid */}
            {styleReferences.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {styleReferences.map((refUrl) => (
                  <div
                    key={refUrl}
                    className={cn(
                      "relative group aspect-square rounded-sm overflow-hidden border border-border bg-muted",
                      removingUrls.has(refUrl) && "opacity-50 pointer-events-none"
                    )}
                  >
                    <img
                      src={resolvePublicUrl(refUrl)}
                      alt="Style reference"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback if image fails to load
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/80 hidden">
                      <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveReference(refUrl);
                      }}
                      className={cn(
                        "nodrag absolute top-0.5 right-0.5",
                        "opacity-0 group-hover:opacity-100 transition-opacity",
                        "w-5 h-5 flex items-center justify-center",
                        "bg-destructive/90 hover:bg-destructive text-destructive-foreground",
                        "rounded-sm text-[10px]"
                      )}
                      title="Remove style reference"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {styleReferences.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic">
                No style references yet. Add URLs below.
              </p>
            )}

            {/* Add reference input */}
            <div className="flex items-center gap-1.5">
              <Input
                className="nodrag h-7 text-xs flex-1 min-w-0"
                placeholder="Paste image URL..."
                value={newRefUrl}
                onChange={(e) => setNewRefUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isAdding}
              />
              <Button
                className="nodrag h-7 w-7 shrink-0"
                size="sm"
                variant="ghost"
                onClick={handleAddReference}
                disabled={!newRefUrl.trim() || isAdding}
                title="Add style reference"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Error message */}
            {addError && (
              <p className="text-[10px] text-destructive">{addError}</p>
            )}
          </div>
        </div>
      ) : (
        /* ── Compact / zoomed-out view ──────────────────────────────────── */
        <div className="p-4 flex flex-col gap-2">
          <p className="text-xs">
            Generation rules, base prompts, and global settings.
            Select to view.
          </p>
          {styleReferences.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {styleReferences.length} style reference{styleReferences.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}
    </NodeShell>
  );
}
