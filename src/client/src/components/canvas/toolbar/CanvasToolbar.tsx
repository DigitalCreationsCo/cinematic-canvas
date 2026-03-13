import { Play, Square, Pause, Save, Undo, Redo, LayoutGrid, ChevronDown } from 'lucide-react';
import { Button } from '../../ui/button.js';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

export function CanvasToolbar() {
  const { status: pipelineStatus } = usePipelineStore();
  const { snapToGrid, setSnapToGrid } = useCanvasUIStore();
  const [ slot, setSlot ] = useState<Element | null>(null);

  useEffect(() => {
    setSlot(document.getElementById('canvas-toolbar-slot'));
  }, []);

  const isRunning = pipelineStatus === 'generating' || pipelineStatus === 'evaluating';
  const canUndo = true;
  const canRedo = false;

  if (!slot) return null;

  return createPortal(
    <div className="z-20 bg-background backdrop-blur-md px-4 py-2 flex items-center gap-4">

      {/* Canvas Layout Actions */}
      <div className="flex items-center gap-2 border-r border-border pr-4">
        <Button 
          size="icon" 
          variant="ghost"
          className={ `w-8 h-8 ${snapToGrid ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}` }
          onClick={() => setSnapToGrid(!snapToGrid)}
          title="Snap to Grid & Auto-Layout"
        >
          <LayoutGrid className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1 border-r border-border pr-4">
        <Button variant="ghost" size="icon"
          className="w-8 h-8"
          disabled={ !canUndo }>
          <Undo className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon"
          className="w-8 h-8"
          disabled={ !canRedo }>
          <Redo className="w-4 h-4" />
        </Button>
      </div>

      {/* Global Pipeline Run Controls */}
      <div className="flex items-center gap-2">
        {!isRunning ? (
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-6 shadow-md shadow-emerald-900/30">
            <Play className="w-4 h-4 mr-2" />
            <span className="font-bold tracking-wide">RUN PIPELINE</span>
          </Button>
        ) : (
          <Button size="sm" className="bg-red-600 hover:bg-red-500 text-white rounded-full px-6 shadow-md shadow-red-900/30">
            <Square className="w-4 h-4 mr-2 fill-current" />
            <span className="font-bold tracking-wide">STOP</span>
          </Button>
        )}
      </div>

    </div>,
    slot
  );
}
