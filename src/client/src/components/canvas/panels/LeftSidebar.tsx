import React from 'react';
import { ScrollArea } from '../../ui/scroll-area.js';
import { Button } from '../../ui/button.js';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';

export function LeftSidebar() {
  const { interrupt } = usePipelineStore();
  const { sequenceMode, setSequenceMode } = useCanvasUIStore();

  return (
    <div className="absolute top-4 left-4 bottom-4 w-72 card-cinematic-glass backdrop-blur-md flex flex-col overflow-hidden z-20">

      {/* Header */}
      <div className="p-4 border-b bg-background/80 flex items-center justify-between">
        <span className="text-xs tracking-wide text-muted-foreground uppercase">Workspace</span>
        {/* <Button variant="ghost" size="icon" className="hover:bg-transparent w-6 h-6">
        <Settings2 className="w-4 h-4" />
      </Button> */}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 flex flex-col gap-6">

          {/* Sequence List vs Canvas Toggle */}
          <div className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider flex items-center gap-2">
              Sequence
            </h3>
            <div className="flex border p-1 rounded-lg">
              <Button
                variant={sequenceMode === 'canvas' ? 'secondary' : 'ghost'}
                size="sm"
                className={`flex-1 h-7 text-xs ${sequenceMode === 'canvas' ? 'shadow-sm' : ''}`}
                onClick={() => setSequenceMode('canvas')}
              >
                Canvas Edges
              </Button>
              <Button
                variant={sequenceMode === 'explicit' ? 'secondary' : 'ghost'}
                size="sm"
                className={`flex-1 h-7 text-xs ${sequenceMode === 'explicit' ? 'shadow-sm' : ''}`}
                onClick={() => setSequenceMode('explicit')}
              >
                Linear List
              </Button>
            </div>
            {sequenceMode === 'explicit' && (
              <div className="text-[10px] italic p-2 border border-dashed rounded">
                Drag scenes in the list below to explicitly reorder them. (List UI placeholder)
              </div>
            )}
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
