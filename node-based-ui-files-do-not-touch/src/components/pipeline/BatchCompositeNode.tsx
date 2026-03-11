import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Layers, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDroppable } from '@dnd-kit/core';

export const BatchCompositeNode = memo(({ data, isConnectable, id }: any) => {
  // Drop zone for combining images
  const { isOver, setNodeRef } = useDroppable({
    id: `composite-drop-${id}`,
    data: {
      accepts: ['image', 'scene']
    }
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "w-64 bg-panel rounded-md border-2 border-dashed overflow-hidden flex flex-col transition-all duration-200",
        isOver ? "border-primary bg-primary/5 scale-105" : "border-border hover:border-muted-foreground"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-3 h-6 rounded-sm bg-muted border-border -ml-1.5"
      />

      <div className="p-4 flex flex-col items-center justify-center text-center gap-3 min-h-[120px]">
        <div className="relative">
          <Layers className={cn("w-8 h-8 transition-colors", isOver ? "text-primary" : "text-muted-foreground")} />
          {isOver && (
            <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5">
              <Wand2 className="w-4 h-4 text-primary" />
            </div>
          )}
        </div>
        
        <div className="flex flex-col gap-1">
          <span className={cn("text-xs font-mono font-bold tracking-wider", isOver ? "text-primary" : "text-foreground")}>
            BATCH COMPOSITE
          </span>
          <span className="text-[10px] text-muted-foreground max-w-[200px] leading-tight">
            Drop scenes or images here to automatically generate composite frames
          </span>
        </div>

        {/* Visual stack indicator */}
        <div className="flex -space-x-2 mt-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-6 h-6 rounded bg-card border border-border shadow-sm flex items-center justify-center transform transition-transform" style={{ transform: `rotate(${(i-2)*5}deg)` }}>
              <span className="text-[8px] text-muted-foreground opacity-50">{i}</span>
            </div>
          ))}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="w-3 h-6 rounded-sm bg-muted border-border -mr-1.5"
      />
    </div>
  );
});