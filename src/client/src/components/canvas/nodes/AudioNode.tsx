import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Music3 } from 'lucide-react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';

export function AudioNode({ data, selected }: NodeProps<CanvasNode>) {
  const { selectNode } = useCanvasUIStore();

  return (
    <div 
      className={`
        w-48 rounded-xl bg-gray-900 border-2 overflow-hidden
        transition-all duration-200 
        ${selected ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-gray-950' : ''}
        border-gray-700
      `}
      onClick={() => selectNode(data.entityId)}
    >
      <div className="bg-gray-800 p-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-2 px-1">
          <Music3 className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-xs text-gray-300">
            Audio Track
          </span>
        </div>
      </div>
      
      <div className="p-3 bg-gray-950 flex flex-col gap-2 relative overflow-hidden">
        {/* Fake waveform visualizer */}
        <div className="flex items-end justify-center gap-[2px] h-8 opacity-50">
           {Array.from({ length: 24 }).map((_, i) => (
             <div 
               key={i} 
               className="w-1 bg-cyan-500 rounded-t-sm" 
               style={{ height: `${Math.random() * 80 + 20}%` }} 
             />
           ))}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-cyan-500 border-2 border-gray-900" />
    </div>
  );
}
