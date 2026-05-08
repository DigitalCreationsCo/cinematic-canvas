// src/client/src/components/canvas/CanvasToolbar.tsx
import {
  Play,
  Square,
  Undo,
  Redo,
  LayoutGrid,
  Eye,
  EyeOff,
  GitBranch,
  Loader2,
  AlertCircle,
  Check,
} from "lucide-react";
import { Button } from "#client/components/ui/button.js";
import { usePipelineStore } from "#client/store/usePipelineStore.js";
import { useCanvasUIStore } from "#client/store/useCanvasUIStore.js";
import { useCanvasInteractionStore } from "#client/store/useCanvasInteractionStore.js";
import { useUndoRedo } from "#client/hooks/useUndoRedo.js";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import {
  useProjectStore,
  selectMostRecentSavedAt,
} from "#client/store/useProjectStore.js";
import { useWorldStore } from "#client/store/useWorldStore.js";
import { useShallow } from "zustand/shallow";
import { getAssetUrl } from "#shared/utils/assets.utils.js";
import { useAssetStore } from "#client/store/useAssetStore.js";
import { formatDistanceToNow } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#client/components/ui/tooltip.js";
import { AddNodeDropdown } from "#client/components/canvas/toolbar/AddNodeDropdown.js";
import { AssistantToolbar } from "#client/components/canvas/toolbar/AssistantToolbar.js";
import { motion } from "framer-motion";
import { cn } from "#client/lib/utils.js";

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
        <span>{saveError.slice(0, 23)}</span>
      </div>
    );
  }

  if (lastSaved) {
    const now = new Date();
    const diffMs = now.getTime() - lastSaved.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    let timeAgo: string;
    if (diffSec < 5) {
      timeAgo = "just now";
    } else if (diffSec < 60) {
      timeAgo = `${diffSec}s ago`;
    } else if (diffSec < 3600) {
      timeAgo = `${Math.floor(diffSec / 60)}m ago`;
    } else {
      timeAgo = lastSaved.toLocaleTimeString();
    }

    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground transition-[width]">
        {
          <span
            className={cn(
              "overflow-hidden whitespace-nowrap transition-all duration-50 ease-in-out",
              diffSec > 15 ? "max-w-0" : "max-w-xs opacity-100",
              "group-hover:max-w-xs group-hover:opacity-100 delay-300 group-hover:delay-100",
            )}
          >
            Saved {timeAgo}
          </span>
        }
        <Check className="w-4 h-4 text-green-500" />
      </div>
    );
  }

  return null;
};

export function CanvasToolbar({
  handleStart,
  handleStop,
  handleResume,
  projectId,
}: CanvasToolbarProps) {
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
        if (getAssetUrl(registry, "scene_video")) count++;
      }
      return count;
    }),
  );
  const total = useProjectStore((state) => state.scenes.size || 0);
  const lastSaved = useProjectStore(selectMostRecentSavedAt);
  const metadata = useProjectStore((s) => s.metadata);
  const title = metadata?.title || "";
  const worldName = useWorldStore((s) => s.worldName);

  // ── Portal slot ───────────────────────────────────────────────────────────
  const [slot, setSlot] = useState<Element | null>(null);
  useEffect(() => {
    setSlot(document.getElementById("canvas-toolbar-slot"));
  }, []);

  if (!slot) return null;

  const isRunning = ["analyzing", "generating", "evaluating"].includes(status);
  const edgesVisible = edgeVisibilityMode === "all";

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{
        opacity: 0,
      }}
      transition={{
        duration: 0.8,
        delay: 0.25,
        ease: [0.1, 0.2, 0.2, 0.5],
      }}
      className="z-20 flex items-center justify-between gap-4 w-full "
    >
      {/* ── Project / World title + save status ─────────────────────────── */}
      <div className="relative flex flex-col border-border pr-4 group">
        {worldName && (
          <span className="text-xs font-mono truncate uppercase">{worldName}</span>
        )}
        <div className="flex gap-2">
          <span className="text-xs font-heading font-normal truncate uppercase">
            {title}
          </span>
          <SaveStatus />
        </div>
      </div>

      <div className="flex">
        {pendingCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 text-xs font-mono text-amber-400 border-r border-border px-6 ">
                <GitBranch className="w-3.5 h-3.5" />
                <span className="font-semibold">{pendingCount}</span>
                <span className="text-muted-foreground hidden sm:inline">unsaved</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{`${pendingCount} unsaved change${pendingCount !== 1 ? "s" : ""} — use the canvas bar to Save or Discard`}</TooltipContent>
          </Tooltip>
        )}

        <div className="px-1 border-r border-border">
          {/* ── Add Node ─────────────────────────────────────────────────── */}
          <AddNodeDropdown contextType="project" projectId={projectId} />
        </div>

        {/* ── Undo / Redo ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-0.5 border-r border-border px-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 pl-6 pr-5 "
                disabled={!canUndo}
                onClick={undo}
              >
                <Undo className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 pl-5 pr-6 "
                disabled={!canRedo}
                onClick={redo}
              >
                <Redo className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo</TooltipContent>
          </Tooltip>
        </div>

        {/* ── Canvas layout controls ───────────────────────────────────────── */}
        <div className="flex items-center gap-0.5 border-r border-border px-1">
          {/* Auto-layout toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                data-active={autoLayout}
                className={`w-8 h-8 pl-6 pr-5`}
                onClick={() => {
                  // Set snapToGrid FIRST with the NEW intended value (inverse of current)
                  // This avoids stale closure - autoLayout value used is from current render
                  setSnapToGrid(!autoLayout);
                  toggleAutoLayout();
                }}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {autoLayout ? "Turn Off Snap To Grid" : "Turn On Snap To Grid"}
            </TooltipContent>
          </Tooltip>

          {/* Edge visibility toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                data-active={edgesVisible}
                className={`w-8 h-8 pl-5 pr-6 `}
                onClick={toggleEdgeVisibility}
              >
                {edgesVisible ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {edgesVisible ? "Hide Connections" : "Show Connections"}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* ── Pipeline run controls ────────────────────────────────────────── */}
        {/* <div className="flex items-center gap-2 border-r border-border pl-4 pr-4"> */}

        {/* {isPipelineRunning && (
        <div className="bg-card border border-border rounded-none shadow-lg p-3 flex gap-3 pointer-events-auto items-start">
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
        <AssistantToolbar
          handleStart={handleStart}
          handleStop={handleStop}
          handleResume={handleResume}
          projectId={projectId}
        />
      </div>
    </motion.div>,
    slot,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true })
    .replace(" minutes", "min")
    .replace(" minute", "min");
}
