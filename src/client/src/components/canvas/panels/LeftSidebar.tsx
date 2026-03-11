import React from 'react';
import { AlignLeft, Film, PlayCircle, Settings2 } from 'lucide-react';
import { ScrollArea } from '../../ui/scroll-area.js';
import { Button } from '../../ui/button.js';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { useWorldStore } from '../../../store/useWorldStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';

export function LeftSidebar() {
  const { events, interrupt } = usePipelineStore();
  const { worldId } = useWorldStore();
  const { sequenceMode, setSequenceMode } = useCanvasUIStore();

  return (
    <div className="absolute top-16 left-4 bottom-4 w-72 bg-gray-900/95 backdrop-blur-md border border-gray-800 rounded-xl shadow-2xl flex flex-col overflow-hidden z-20">
      
      {/* Header */}
      <div className="p-4 border-b border-gray-800 bg-gray-950 flex items-center justify-between">
        <h2 className="font-bold text-sm text-gray-200 tracking-wide uppercase">Workspace</h2>
        <Button variant="ghost" size="icon" className="w-6 h-6 text-gray-500">
          <Settings2 className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 flex flex-col gap-6">
          
          {/* Metadata Section (World or Project) */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <AlignLeft className="w-3 h-3" /> Core Definition
            </h3>
            <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 text-xs text-gray-400">
              Select the Metadata root node on the canvas to edit generation rules and base prompts.
            </div>
          </div>

          {/* Sequence List vs Canvas Toggle */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <Film className="w-3 h-3" /> Sequence Mode
            </h3>
            <div className="flex bg-gray-950 border border-gray-800 p-1 rounded-lg">
              <Button 
                variant={sequenceMode === 'canvas' ? 'secondary' : 'ghost'} 
                size="sm" 
                className={`flex-1 h-7 text-xs ${sequenceMode === 'canvas' ? 'bg-indigo-900 text-indigo-100 shadow-sm' : 'text-gray-500'}`}
                onClick={() => setSequenceMode('canvas')}
              >
                Canvas Edges
              </Button>
              <Button 
                variant={sequenceMode === 'explicit' ? 'secondary' : 'ghost'} 
                size="sm" 
                className={`flex-1 h-7 text-xs ${sequenceMode === 'explicit' ? 'bg-indigo-900 text-indigo-100 shadow-sm' : 'text-gray-500'}`}
                onClick={() => setSequenceMode('explicit')}
              >
                Linear List
              </Button>
            </div>
            {sequenceMode === 'explicit' && (
              <div className="text-[10px] text-gray-500 italic p-2 border border-dashed border-gray-800 rounded">
                Drag scenes in the list below to explicitly reorder them. (List UI placeholder)
              </div>
            )}
          </div>

          {/* Intervention Panel (shows when pipeline is interrupted) */}
          {interrupt && (
            <div className="space-y-2 border-l-2 border-red-500 pl-3">
               <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-2 animate-pulse">
                Action Required
               </h3>
               <div className="bg-red-950/30 border border-red-900 rounded p-3 text-xs text-red-200">
                 {interrupt.error}
                 <Button size="sm" className="w-full mt-3 bg-red-600 hover:bg-red-500 text-white">
                   Review Options
                 </Button>
               </div>
            </div>
          )}

        </div>
      </ScrollArea>

      {/* Pipeline Event Log Footer */}
      <div className="h-48 border-t border-gray-800 bg-gray-950 flex flex-col">
        <div className="p-2 border-b border-gray-900 flex justify-between items-center text-[10px] uppercase font-bold text-gray-500">
          <span>Pipeline Logs</span>
          <PlayCircle className="w-3 h-3" />
        </div>
        <ScrollArea className="flex-1 p-2">
           {events.length === 0 ? (
             <p className="text-xs text-gray-600 text-center mt-4">No events yet.</p>
           ) : (
             <div className="flex flex-col gap-1">
               {events.map((evt, i) => (
                 <div key={evt.id} className="text-[10px] flex items-start gap-2 py-1">
                   <span className="text-gray-600 shrink-0 font-mono">
                     {new Date(evt.timestamp).toLocaleTimeString([], { hour12: false })}
                   </span>
                   <span className={`
                      ${evt.type === 'error' ? 'text-red-400' : ''}
                      ${evt.type === 'success' ? 'text-green-400' : ''}
                      ${evt.type === 'warn' ? 'text-yellow-400' : ''}
                      ${evt.type === 'info' ? 'text-blue-300' : ''}
                   `}>
                     {evt.message}
                   </span>
                 </div>
               ))}
             </div>
           )}
        </ScrollArea>
      </div>
    </div>
  );
}
