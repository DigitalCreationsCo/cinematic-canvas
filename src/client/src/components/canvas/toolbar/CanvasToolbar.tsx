// src/client/src/components/canvas/CanvasToolbar.tsx
import { Play, Square, Undo, Redo, LayoutGrid, Eye, EyeOff, GitBranch } from 'lucide-react';
import { Button } from '../../ui/button.js';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { useCanvasInteractionStore } from '../../../store/useCanvasInteractionStore.js';
import { useUndoRedo } from '../../../hooks/useUndoRedo.js';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { useProjectStore, selectMostRecentSavedAt } from '#/store/useProjectStore.js';
import { useWorldStore } from '#/store/useWorldStore.js';
import { useShallow } from 'zustand/shallow';
import { getAssetUrl } from '../../../../../shared/utils/assets-utils.js';
import { useAssetStore } from '#/store/useAssetStore.js';
import { formatDistanceToNow } from 'date-fns';

interface CanvasToolbarProps {
  handleResume: () => void;
  handleStop: () => void;
}

export function CanvasToolbar({ handleStop, handleResume }: CanvasToolbarProps) {
  const pipelineStatus = usePipelineStore((s) => s.status);
  const assets = useAssetStore((s) => s.assets);

  // ── Canvas UI ──────────────────────────────────────────────────────────────
  const autoLayout = useCanvasUIStore((s) => s.autoLayout);
  const toggleAutoLayout = useCanvasUIStore((s) => s.toggleAutoLayout);
  const setSnapToGrid = useCanvasUIStore((s) => s.setSnapToGrid);

  // ── Edge visibility ────────────────────────────────────────────────────────
  const edgeVisibilityMode = useCanvasInteractionStore((s) => s.edgeVisibilityMode);
  const toggleEdgeVisibility = useCanvasInteractionStore((s) => s.toggleEdgeVisibility);

  // ── Pending changes ────────────────────────────────────────────────────────
  const pendingChanges = useCanvasInteractionStore((s) => s.pendingChanges);
  const pendingCount = pendingChanges.size;

  // ── Undo/Redo via hook — coordinates temporal + pending changes ────────────
  const { undo, redo, canUndo, canRedo } = useUndoRedo();

  // ── Project/world metadata ─────────────────────────────────────────────────
  const current = useProjectStore(
    useShallow((state) => {
      if (!state.scenes) return 0;
      let count = 0;
      for (const scene of state.scenes.values()) {
        const registry = assets.get(scene.id);
        if (getAssetUrl(registry, 'scene_video')) count++;
      }
      return count;
    }),
  );
  const total = useProjectStore((state) => state.scenes.size || 0);
  const lastSaved = useProjectStore(selectMostRecentSavedAt);
  const metadata = useProjectStore((s) => s.metadata);
  const title = metadata?.title || '';
  const worldName = useWorldStore((s) => s.worldName);

  // ── Portal slot ───────────────────────────────────────────────────────────
  const [slot, setSlot] = useState<Element | null>(null);
  useEffect(() => { setSlot(document.getElementById('canvas-toolbar-slot')); }, []);

  if (!slot) return null;

  const isRunning = ['analyzing', 'generating', 'evaluating'].includes(pipelineStatus);
  const edgesVisible = edgeVisibilityMode === 'all';

  return createPortal(
    <div className="z-20 bg-background backdrop-blur-md px-4 py-2 flex items-center gap-4">

      {/* ── Project / World title + save status ─────────────────────────── */}
      <div className="flex flex-col border-r border-border pr-4">
        {worldName && (
          <span className="text-xs font-mono text-base truncate uppercase">{worldName}</span>
        )}
        <span className="text-xs font-mono text-base truncate uppercase">{title}</span>
        {lastSaved && (
          <span className="text-xs text-muted-foreground leading-none mt-0.5">
            Saved {timeAgo(lastSaved)}
          </span>
        )}
      </div>

      {/* ── Pipeline status counters ─────────────────────────────────────── */}
      <div className="text-xs font-mono flex items-center gap-2 border-r border-border pr-4">
        <span>COMPLETE:{current}/{total}</span>
        <span>GENERATING:0</span>
        <span>ERROR:1</span>
      </div>

      {/* ── Pipeline run controls ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-r border-border pr-4">
        {!isRunning ? (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-6 shadow-md shadow-emerald-900/30"
            onClick={() => {
              if (confirm('Are you sure you want to execute this?')) handleResume();
            }}
          >
            <Play className="w-4 h-4 mr-2" />
            <span className="font-bold font-mono tracking-wide uppercase">Start pipeline</span>
          </Button>
        ) : (
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-500 text-white rounded-full px-6 shadow-md shadow-red-900/30"
            onClick={() => {
              confirm(
                'Are you sure you want to stop?\n(Pending jobs cancelled; current jobs continue)',
              ) && handleStop();
            }}
          >
            <Square className="w-4 h-4 mr-2 fill-current" />
            <span className="font-bold font-mono tracking-wide uppercase">Stop pipeline</span>
          </Button>
        )}
      </div>

      {/* ── Canvas layout controls ───────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-r border-border pr-4">
        {/* Auto-layout toggle */}
        <Button
          size="icon"
          variant="ghost"
          className={`w-8 h-8 ${autoLayout ? 'text-foreground' : 'text-muted-foreground'}`}
          onClick={() => {
            toggleAutoLayout();
            setSnapToGrid(!autoLayout);
          }}
          title={
            autoLayout
              ? 'Auto-Layout ON — nodes snap to grid'
              : 'Auto-Layout OFF — freeform positioning'
          }
        >
          <LayoutGrid className="w-4 h-4" />
        </Button>

        {/* Edge visibility toggle */}
        <Button
          size="icon"
          variant="ghost"
          className={`w-8 h-8 ${edgesVisible ? 'text-foreground' : 'text-muted-foreground'}`}
          onClick={toggleEdgeVisibility}
          title={
            edgesVisible
              ? 'Edges visible — click to hide all'
              : 'Edges hidden — click to show all'
          }
        >
          {edgesVisible
            ? <Eye className="w-4 h-4" />
            : <EyeOff className="w-4 h-4" />}
        </Button>
      </div>

      {/* ── Pending changes indicator ────────────────────────────────────── */}
      {pendingCount > 0 && (
        <div
          className="flex items-center gap-1.5 text-xs font-mono text-amber-400 border-r border-border pr-4"
          title={`${pendingCount} unsaved change${pendingCount !== 1 ? 's' : ''} — use the canvas bar to Save or Discard`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span className="font-semibold">{pendingCount}</span>
          <span className="text-muted-foreground hidden sm:inline">unsaved</span>
        </div>
      )}

      {/* ── Undo / Redo ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8"
          disabled={!canUndo}
          onClick={undo}
          title="Undo"
        >
          <Undo className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8"
          disabled={!canRedo}
          onClick={redo}
          title="Redo"
        >
          <Redo className="w-4 h-4" />
        </Button>
      </div>

    </div>,
    slot,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true })
    .replace(' minutes', 'min')
    .replace(' minute', 'min');
}