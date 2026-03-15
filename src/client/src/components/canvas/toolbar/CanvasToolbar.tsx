import { Play, Square, Pause, Save, Undo, Redo, LayoutGrid, ChevronDown } from 'lucide-react';
import { Button } from '../../ui/button.js';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { useProjectStore, selectMostRecentSavedAt } from '#/store/useProjectStore.js';
import { useWorldStore } from '#/store/useWorldStore.js';
import { useShallow } from 'zustand/shallow';
import { getAssetUrl } from '../../../../../shared/utils/assets-utils.js';
import { useAssetStore } from '#/store/useAssetStore.js';
import { formatDistanceToNow } from 'date-fns';
import { useNodeStore } from '../../../store/useNodeStore.js';
import { useStore } from 'zustand';

interface CanvasToolbarProps {
  handleResume: () => void;
  handleStop: () => void;
}

export function CanvasToolbar({ handleStop, handleResume }: CanvasToolbarProps) {
  const { status: pipelineStatus } = usePipelineStore();
  const { assets } = useAssetStore();
  const { snapToGrid, setSnapToGrid } = useCanvasUIStore();
  const [slot, setSlot] = useState<Element | null>(null);


  const current = useProjectStore(useShallow((state) => {
    if (!state.scenes) return 0;
    let count = 0;
    // Use a for...of loop to avoid creating a new array from the Map iterator
    for (const scene of state.scenes.values()) {
      const registry = assets.get(scene.id);
      if (getAssetUrl(registry, 'scene_video')) {
        count++;
      }
    }
    return count;
  })
  );
  const total = useProjectStore((state) => state.scenes.size || 0);

  const lastSaved = useProjectStore(selectMostRecentSavedAt);

  function timeAgo(date: Date) {
    return formatDistanceToNow(date, { addSuffix: true })
      .replace(' minutes', 'min') // Custom shortening
      .replace(' minute', 'min');
  };

  const metadata = useProjectStore((s) => s.metadata);
  const title = metadata?.title || "";
  const worldName = useWorldStore((s) => s.worldName);

  useEffect(() => {
    setSlot(document.getElementById('canvas-toolbar-slot'));
  }, []);

  const isRunning = pipelineStatus === 'generating' || pipelineStatus === 'evaluating';
  // @ts-ignore - temporal property is added by zundo middleware
  const { pastStates, futureStates, undo, redo } = useStore(useNodeStore.temporal, (state: any) => ({
    pastStates: state.pastStates,
    futureStates: state.futureStates,
    undo: state.undo,
    redo: state.redo,
  }));

  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  if (!slot) return null;

  return createPortal(
    <div className="z-20 bg-background backdrop-blur-md px-4 py-2 flex items-center gap-4">

      {/* Project Title & Save Status */}
      <div className="flex flex-col border-r border-border pr-4">
        {worldName && (
          <span className="text-xs font-mono text-base truncate uppercase">{worldName}</span>
        )}
        <span className="text-xs font-mono text-base truncate uppercase">{title}</span>
        {lastSaved && <span className="text-xs text-muted-foreground leading-none mt-0.5">Saved {timeAgo(lastSaved)}</span>}
      </div>

      {/* Pipeline Status */}
      <div className="text-xs font-mono flex items-center gap-2 border-r border-border pr-4">
        <span className="flex items-center gap-1">
          COMPLETE:{current}/{total}
        </span>
        <span className="flex items-center gap-1">
          GENERATING:{0}
        </span>
        <span className="flex items-center gap-1">
          ERROR:1
        </span>
      </div>

      {/* Global Pipeline Run Controls */}
      <div className="flex items-center gap-2 border-r border-border pr-4">
        {!isRunning ? (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-6 shadow-md shadow-emerald-900/30"
            onClick={() => {
              if (confirm('Are you sure you want to execute this?')) {
                handleResume();
              }
            }
            }>
            <Play className="w-4 h-4 mr-2" />
            <span className="font-bold font-mono tracking-wide uppercase">Start pipeline</span>
          </Button>
        ) : (
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-500 text-white rounded-full px-6 shadow-md shadow-red-900/30"
            onClick={() => { confirm('Are you sure you want to stop this? \n(Pending jobs will be cancelled. Current jobs will continue to run)') && handleStop(); }}
          >
            <Square className="w-4 h-4 mr-2 fill-current" />
            <span className="font-bold font-mono tracking-wide uppercase">Stop pipeline</span>
          </Button>
        )}
      </div>

      {/* Canvas Layout Actions */}
      <div className="flex items-center gap-2 border-r border-border pr-4">
        <Button
          size="icon"
          variant="ghost"
          className={`w-8 h-8 ${snapToGrid ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setSnapToGrid(!snapToGrid)}
          title="Snap to Grid & Auto-Layout"
        >
          <LayoutGrid className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon"
          className="w-8 h-8"
          disabled={!canUndo}
          onClick={() => undo()}
          title="Undo">
          <Undo className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon"
          className="w-8 h-8"
          disabled={!canRedo}
          onClick={() => redo()}
          title="Redo">
          <Redo className="w-4 h-4" />
        </Button>
      </div>

    </div>,
    slot
  );
}
