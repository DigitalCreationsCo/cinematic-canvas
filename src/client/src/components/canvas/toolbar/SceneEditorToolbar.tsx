import { Play, Square, Undo, Redo, LayoutGrid, Eye, EyeOff, GitBranch, Loader2, AlertCircle, Check, Save, X } from 'lucide-react';
import { Button } from '../../ui/button.js';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { useCanvasInteractionStore } from '../../../store/useCanvasInteractionStore.js';
import { useUndoRedo } from '../../../hooks/useUndoRedo.js';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { useProjectStore, selectMostRecentSavedAt } from '#client/store/useProjectStore.js';
import { useWorldStore } from '#client/store/useWorldStore.js';
import { useShallow } from 'zustand/shallow';
import { getAssetUrl } from '../../../../../shared/utils/assets-utils.js';
import { useAssetStore } from '#client/store/useAssetStore.js';
import { formatDistanceToNow } from 'date-fns';
import { Tooltip, TooltipContent, TooltipTrigger } from '#client/components/ui/tooltip.js';
import type { EditableSceneFields } from '#shared/types/editable.types.js';
import { motion } from 'framer-motion';

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

interface SceneEditorToolbarProps {
  onClose: () => void;
  onSave: (updates: EditableSceneFields) => Promise<void>;
}

export function SceneEditorToolbar({ onSave, onClose }: SceneEditorToolbarProps) {
  const status = usePipelineStore((s) => s.status);
  const assets = useAssetStore((s) => s.assets);

  // ── Canvas UI ──────────────────────────────────────────────────────────────
  const autoLayout = useCanvasUIStore((s) => s.autoLayout);
  const toggleAutoLayout = useCanvasUIStore((s) => s.toggleAutoLayout);
  const setSnapToGrid = useCanvasUIStore((s) => s.setSnapToGrid);

  const setIsSaving = useCanvasUIStore((s) => s.setIsSaving);
  const isSaving = useCanvasUIStore((s) => s.isSaving);

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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        name: "",
        description: "",
        mood: "",
        continuityNotes: []
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  // ── Portal slot ───────────────────────────────────────────────────────────
  const [slot, setSlot] = useState<Element | null>(null);
  useEffect(() => { setSlot(document.getElementById('canvas-toolbar-slot')); }, []);

  if (!slot) return null;

  const isRunning = ['analyzing', 'generating', 'evaluating'].includes(status);
  const edgesVisible = edgeVisibilityMode === 'all';

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
      className="z-20 flex items-center justify-between gap-4 w-full ">

      {/* ── Project / World title + save status ─────────────────────────── */}
      <div className="flex flex-col border-r border-border pr-4 items-center">
        <span className="text-xs font-heading font-normal items-center truncate uppercase">{title}</span>

        <SaveStatus />
      </div>
      {worldName && (
        <span className="text-xs font-mono truncate uppercase">{worldName}</span>
      )}

      <div className="flex">

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

        {/* ── Scene Editor Controls ───────────────────────────────────────── */}
        <div className="flex items-center gap-1 border-r border-border px-4 mr-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={onClose} disabled={isSaving}>
                <X className="w-4 h-4 mr-2" /> Leave Editor
              </Button>
            </TooltipTrigger>
            <TooltipContent>Leave Editor</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={handleSave} disabled={isSaving}>
                <Save className="w-4 h-4 mr-2" /> {isSaving ? "Saving..." : "Save"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </motion.div >,
    slot,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true })
    .replace(' minutes', 'min')
    .replace(' minute', 'min');
}