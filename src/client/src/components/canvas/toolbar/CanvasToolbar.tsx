import React from 'react';
import { Play, Square, Pause, Save, Undo, Redo, LayoutGrid } from 'lucide-react';
import { Button } from '../../ui/button.js';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { useNodeStore } from '../../../store/useNodeStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';

export function CanvasToolbar() {
  const { status: pipelineStatus } = usePipelineStore();
  const { snapToGrid, setSnapToGrid } = useCanvasUIStore();
  // We'd use zundo's useStore for undo/redo state here, but mocking for brevity
  const canUndo = true;
  const canRedo = false;

  const isRunning = pipelineStatus === 'generating' || pipelineStatus === 'evaluating';

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-gray-900/90 backdrop-blur-md border border-gray-700 rounded-full shadow-2xl px-4 py-2 flex items-center gap-4">
      
      {/* Undo / Redo */}
      <div className="flex items-center gap-1 border-r border-gray-700 pr-4">
        <Button variant="ghost" size="icon" className="w-8 h-8 text-gray-400 hover:text-white" disabled={!canUndo}>
          <Undo className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="w-8 h-8 text-gray-400 hover:text-white" disabled={!canRedo}>
          <Redo className="w-4 h-4" />
        </Button>
      </div>
      
      {/* Canvas Layout Actions */}
      <div className="flex items-center gap-1 border-r border-gray-700 pr-4">
        <Button 
          variant={snapToGrid ? "default" : "ghost"} 
          size="icon" 
          className={`w-8 h-8 ${snapToGrid ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'text-gray-400 hover:text-white'}`}
          onClick={() => setSnapToGrid(!snapToGrid)}
          title="Snap to Grid & Auto-Layout"
        >
          <LayoutGrid className="w-4 h-4" />
        </Button>
      </div>

      {/* Global Pipeline Run Controls */}
      <div className="flex items-center gap-2 pl-1">
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

    </div>
  );
}
