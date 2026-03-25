// src/client/src/components/canvas/CanvasToolbar.tsx
import { Play, Square, Undo, Redo, LayoutGrid, Eye, EyeOff, GitBranch, Loader2, AlertCircle, Check } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip.js';
import { AddNodeDropdown } from './AddNodeDropdown.js';

interface CanvasToolbarProps {
  handleStart: () => void;
  handleResume: () => void;
  handleStop: () => void;
  projectId?: string;
}

const SaveStatus = () => {
  const lastSaved = useCanvasUIStore((s) => s.lastSaved);
  const saveError = useCanvasUIStore((s) => s.saveError);

  if (saveError) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <AlertCircle className="w-4 h-4" />
        <span>{saveError}</span>
      </div>
    );
  }

  if (lastSaved) {
    const now = new Date();
    const diffMs = now.getTime() - lastSaved.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    let timeAgo: string;
    if (diffSec < 5) {
      timeAgo = 'Just now';
    } else if (diffSec < 60) {
      timeAgo = `${diffSec}s ago`;
    } else if (diffSec < 3600) {
      timeAgo = `${Math.floor(diffSec / 60)}m ago`;
    } else {
      timeAgo = lastSaved.toLocaleTimeString();
    }

    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="w-4 h-4 text-green-500" />
        <span>Last saved {timeAgo}</span>
      </div>
    );
  }

  return null;
};

export function CanvasToolbar({ handleStart, handleStop, handleResume, projectId }: CanvasToolbarProps) {
  const status = usePipelineStore((s) => s.status);
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

  const isRunning = ['analyzing', 'generating', 'evaluating'].includes(status);
  const edgesVisible = edgeVisibilityMode === 'all';

  return createPortal(
    <div className="z-20 bg-background backdrop-blur-md px-4 py-2 flex items-center gap-4">

      {/* ── Project / World title + save status ─────────────────────────── */}
      <div className="flex flex-col border-r border-border pr-4 items-center">
        {worldName && (
          <span className="text-xs font-mono truncate uppercase">{worldName}</span>
        )}
        <span className="text-xs font-heading font-normal items-center truncate uppercase">{title}</span>

        <SaveStatus />
      </div>

      {/* ── Pipeline status counters ─────────────────────────────────────── */}
      <div className="text-xs font-mono flex items-center gap-2 text-foreground border-r border-border pr-4">
        <span>COMPLETE:{current}/{total}</span>
        <span>GENERATING:0</span>
        <span>ERROR:1</span>
      </div>

      {/* ── Pipeline run controls ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-r border-border pr-4">

        {/* {isPipelineRunning && (
        <div className="bg-card border border-border rounded-md shadow-lg p-3 flex gap-3 pointer-events-auto items-start">
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold font-mono">PIPELINE {status.toUpperCase()}</span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {events.filter((e) => e.type === 'info').length} events
              </span>
            </div>
            <span className="text-xs text-muted-foreground leading-tight">
              {status === 'analyzing' ? 'Analyzing project structure...' :
               status === 'generating' ? 'Generating scene assets...' :
               status === 'evaluating' ? 'Evaluating scene quality...' :
               'Processing...'}
            </span>
          </div>
        </div>
      )} */}

        {!isRunning ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="bg-emerald-600 hover:bg-emerald-500 text-background hover:text-background rounded-full px-6 shadow-md shadow-emerald-900/30"
                onClick={() => {
                  if (confirm('Are you sure you want to execute this?')) {
                    if (total === 0) handleStart();
                    else handleResume();
                  }
                }}
              >
                <Play className="w-4 h-4 mr-2" />
                <span className="font-bold font-mono tracking-wide uppercase">{total === 0 ? "Start Pipeline" : "Resume Pipeline"}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Start Pipeline</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-500 text-background hover:text-background rounded-full px-6 shadow-md shadow-red-900/30"
                onClick={() => {
                  confirm(
                    'Are you sure you want to stop?\n(Pending jobs cancelled; current jobs continue)',
                  ) && handleStop();
                }}
              >
                <Loader2 className="w-4 h-4 mr-2 text-primary animate-spin shrink-0" />
                <span className="font-bold font-mono tracking-wide uppercase">
                  {status === 'analyzing' ? 'Analyzing project...' :
                    status === 'generating' ? 'Generating assets...' :
                      status === 'evaluating' ? 'Evaluating asset quality...' :
                        'Processing...'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop Pipeline</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* ── Canvas layout controls ───────────────────────────────────────── */}
      < div className="flex items-center gap-1 border-r border-border pr-4" >
        {/* Auto-layout toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            < Button
              size="icon"
              variant="ghost"
              className={`w-8 h-8 ${autoLayout ? 'text-foreground' : 'text-muted-foreground'}`}
              onClick={() => {
                // Set snapToGrid FIRST with the NEW intended value (inverse of current)
                // This avoids stale closure - autoLayout value used is from current render
                setSnapToGrid(!autoLayout);
                toggleAutoLayout();
              }}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button >
          </TooltipTrigger>
          <TooltipContent>{autoLayout
            ? 'Auto-Layout ON — nodes snap to grid'
            : 'Auto-Layout OFF — freeform positioning'}</TooltipContent>
        </Tooltip>

        {/* Edge visibility toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            < Button
              size="icon"
              variant="ghost"
              className={`w-8 h-8 ${edgesVisible ? 'text-foreground' : 'text-muted-foreground'}`}
              onClick={toggleEdgeVisibility}
            >
              {
                edgesVisible
                  ? <Eye className="w-4 h-4" />
                  : <EyeOff className="w-4 h-4" />}
            </Button >
          </TooltipTrigger>
          <TooltipContent>{
            edgesVisible
              ? 'Edges visible — click to hide all'
              : 'Edges hidden — click to show all'
          }</TooltipContent></Tooltip>

      </div >

      {/* ── Pending changes indicator ────────────────────────────────────── */}
      {
        pendingCount > 0 && (
          <div
            className="flex items-center gap-1.5 text-xs font-mono text-amber-400 border-r border-border pr-4"
            title={`${pendingCount} unsaved change${pendingCount !== 1 ? 's' : ''} — use the canvas bar to Save or Discard`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span className="font-semibold">{pendingCount}</span>
            <span className="text-muted-foreground hidden sm:inline">unsaved</span>
          </div>
        )
      }

      {/* ── Add Node ─────────────────────────────────────────────────── */}
      <AddNodeDropdown contextType="project" projectId={projectId} />

      {/* ── Undo / Redo ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              disabled={!canUndo}
              onClick={undo}
            >
              <Undo className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              disabled={!canRedo}
              onClick={redo}
            >
              <Redo className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo</TooltipContent>
        </Tooltip>
      </div>

    </div >,
    slot,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true })
    .replace(' minutes', 'min')
    .replace(' minute', 'min');
}