import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Image as ImageIcon, Clock, AlertTriangle, Loader2, Play, Settings2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useDroppable } from '@dnd-kit/core';

import scene1 from '@/assets/images/placeholder-scene-1.png';
import scene2 from '@/assets/images/placeholder-scene-2.png';

export const SceneNode = memo(({ data, isConnectable, id }: any) => {
  const { isOver, setNodeRef } = useDroppable({
    id: `scene-drop-${id}`,
    data: {
      accepts: ['character', 'location', 'audio', 'image']
    }
  });

  const getStatusColor = () => {
    switch (data.status) {
      case 'complete': return 'border-success shadow-[0_0_15px_-3px_hsl(var(--success)/0.3)]';
      case 'generating': return 'border-primary shadow-[0_0_15px_-3px_hsl(var(--primary)/0.3)]';
      case 'error': return 'border-destructive shadow-[0_0_15px_-3px_hsl(var(--destructive)/0.3)]';
      default: return 'border-border';
    }
  };

  const getThumbnail = () => {
    if (id === 'scene-1') return scene1;
    if (id === 'scene-2') return scene2;
    return null;
  };

  const thumb = getThumbnail();

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "w-80 bg-card rounded-md border-2 overflow-hidden flex flex-col transition-all duration-200",
        getStatusColor(),
        isOver && "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02]"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-3 h-6 rounded-sm bg-muted border-border -ml-1.5"
      />

      {/* Header */}
      <div className="bg-muted/50 px-2 py-1.5 border-b border-border flex justify-between items-center">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="text-xs font-mono font-bold truncate" title={data.label}>
            {data.label}
          </div>
          {data.status === 'generating' && (
             <Badge variant="outline" className="text-[8px] h-4 px-1 py-0 bg-primary/20 text-primary border-primary/30 shrink-0">
                PRODUCING
             </Badge>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono shrink-0">
          <Clock size={10} />
          {data.time}
        </div>
      </div>

      {/* Reference Images Area - Start and End frames */}
      <div className="flex bg-black/50 border-b border-border divide-x divide-border h-16">
        <div className="flex-1 relative flex items-center justify-center group overflow-hidden">
           <span className="absolute top-0.5 left-1 text-[8px] font-mono bg-black/60 px-1 rounded z-10 text-white/70">START REF</span>
           {data.status === 'complete' || (data.status === 'generating' && data.progress > 20) ? (
             <img src={thumb || scene1} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
           ) : (
             <div className="flex flex-col items-center opacity-30 text-white">
               <ImageIcon size={12} />
             </div>
           )}
        </div>
        <div className="flex-1 relative flex items-center justify-center group overflow-hidden">
           <span className="absolute top-0.5 right-1 text-[8px] font-mono bg-black/60 px-1 rounded z-10 text-white/70">END REF</span>
           {data.status === 'complete' || (data.status === 'generating' && data.progress > 80) ? (
             <img src={thumb || scene2} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
           ) : (
             <div className="flex flex-col items-center opacity-30 text-white">
               <ImageIcon size={12} />
             </div>
           )}
        </div>
      </div>

      {/* Main Video Thumbnail Area */}
      <div className="h-36 bg-black relative group">
        {data.status === 'complete' ? (
          <>
            <img src={thumb || scene1} alt="Scene Thumbnail" className="w-full h-full object-cover opacity-80" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button className="w-10 h-10 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center backdrop-blur-sm hover:scale-110 transition-transform">
                <Play size={18} className="fill-current ml-1" />
              </button>
            </div>
            {/* Quick Metrics Overlay */}
            <div className="absolute bottom-1 left-1 flex gap-1">
              <span className="bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-mono text-white">1080p</span>
              <span className="bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-mono text-white">24fps</span>
            </div>
          </>
        ) : data.status === 'generating' ? (
          <div className="w-full h-full flex flex-col p-3 gap-2 justify-end relative overflow-hidden">
             {/* Animated Skeleton Background */}
             <div className="absolute inset-0 bg-gradient-to-tr from-muted/20 via-primary/5 to-muted/20 animate-pulse" />
             
             <div className="z-10 w-full">
               <div className="flex justify-between items-end mb-1">
                 <span className="text-[10px] font-mono tracking-widest text-primary animate-pulse font-semibold">
                   {data.progress < 30 ? 'EXPANDING PROMPT...' : 
                    data.progress < 60 ? 'GENERATING FRAMES...' : 
                    data.progress < 90 ? 'RENDERING VIDEO...' : 'UPSCALE & REFINE...'}
                 </span>
                 <span className="text-[10px] font-mono text-primary">{data.progress}%</span>
               </div>
               <Progress value={data.progress} className="h-1 bg-background/50 [&>div]:bg-primary" />
             </div>
          </div>
        ) : data.status === 'error' ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <AlertTriangle size={24} className="text-destructive" />
            <span className="text-[10px] font-mono tracking-widest text-destructive">GENERATION FAILED</span>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <ImageIcon size={24} className="opacity-20" />
            <span className="text-[10px] font-mono tracking-widest opacity-50">AWAITING TRIGGER</span>
          </div>
        )}
      </div>

      {/* Details Area */}
      <div className="p-2 flex flex-col gap-2">
        {data.status === 'generating' ? (
          <div className="space-y-1.5 mt-1">
            <Skeleton className="h-2 w-full bg-muted/50" />
            <Skeleton className="h-2 w-4/5 bg-muted/50" />
          </div>
        ) : (
          <div className="text-xs text-muted-foreground line-clamp-2 leading-snug">
            {data.description}
          </div>
        )}

        {data.errorMessage && (
          <div className="text-[10px] text-destructive bg-destructive/10 p-1.5 rounded border border-destructive/20 flex items-start gap-1.5">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
            <span className="leading-tight">{data.errorMessage}</span>
          </div>
        )}

        {/* Connected Assets indicators */}
        <div className="flex items-center justify-between mt-1 border-t border-border pt-2">
          <div className="flex gap-1 flex-wrap">
            {data.characters?.length > 0 && (
               <div className="flex items-center gap-1 bg-accent/50 text-accent-foreground px-1.5 py-0.5 rounded text-[9px] font-mono border border-border">
                 CHR
                 <span className="opacity-50">x{data.characters.length}</span>
               </div>
            )}
            {data.location && (
               <div className="flex items-center gap-1 bg-accent/50 text-accent-foreground px-1.5 py-0.5 rounded text-[9px] font-mono border border-border">
                 LOC
                 <span className="opacity-50">#1</span>
               </div>
            )}
            {isOver && (
               <div className="flex items-center gap-1 bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[9px] font-mono border border-primary/30 animate-pulse">
                 DROP TO ASSIGN
               </div>
            )}
          </div>
          <button className="text-muted-foreground hover:text-foreground">
            <Settings2 size={12} />
          </button>
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

// Mock Badge component since we didn't import it at the top
function Badge({ children, className, variant = 'default' }: any) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors", className)}>{children}</span>;
}