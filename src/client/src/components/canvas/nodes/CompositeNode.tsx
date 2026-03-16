import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Layers } from 'lucide-react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { Button } from '../../ui/button.js';
// We simulate useStore pipeline events dispatcher here for the trigger (or via RightSidebar)
import { usePipelineStore } from '../../../store/usePipelineStore.js';

export function CompositeNode({ data, selected, id }: NodeProps<CanvasNode>) {
  const { selectNode } = useCanvasUIStore();

  const handleGenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    // This fires an event picked up by the pipeline worker
    // Full implementation triggers via context/props or right sidebar API call.
    console.log('[CompositeNode] Dispatch Generate for', id);
  };

  return (
    <div
      className={`
        w-64 card-cinematic-glass overflow-hidden
        transition-all duration-200 
        ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background node-selected' : 'node'}
      `}
      onClick={() => selectNode(data.entityId)}
    >
      {/* Left handles (Inputs) - A bit larger for easy dropping */}
      <Handle type="target" position={Position.Left} id="in1" style={{ top: '30%' }} className="w-4 h-4 bg-fuchsia-500/50 border-2 border-fuchsia-400 rounded-sm" />
      <Handle type="target" position={Position.Left} id="in2" style={{ top: '50%' }} className="w-4 h-4 bg-fuchsia-500/50 border-2 border-fuchsia-400 rounded-sm" />
      <Handle type="target" position={Position.Left} id="in3" style={{ top: '70%' }} className="w-4 h-4 bg-fuchsia-500/50 border-2 border-fuchsia-400 rounded-sm" />

      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-2 border-b border-gray-700">
        <div className="flex items-center justify-center gap-2">
          <Layers className="w-5 h-5 text-fuchsia-400" />
          <span className="font-bold text-sm text-gray-100 tracking-wide">COMPOSITE MERGE</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3">
        <div className="text-xs text-center text-gray-400 mb-2 font-mono bg-black/40 py-1 rounded">
          {'<< Select to adjust weights'}
        </div>

        <Button
          size="sm"
          className="w-full bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white shadow-md border-0"
          onClick={handleGenerate}
        >
          Generate Output
        </Button>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-4 h-4 bg-fuchsia-500 border-2 border-white rounded-sm" />
    </div>
  );
}
