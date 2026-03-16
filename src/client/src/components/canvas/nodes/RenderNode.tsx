import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Film, Download } from 'lucide-react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { Button } from '../../ui/button.js';

export function RenderNode({ data, selected }: NodeProps<CanvasNode>) {
  const { selectNode } = useCanvasUIStore();
  const pipelineStatus = usePipelineStore((state) => state.status);

  const isComplete = pipelineStatus === 'complete';
  const isRunning = pipelineStatus === 'generating' || pipelineStatus === 'evaluating';

  return (
    <div
      className={`
        w-56 card-cinematic-glass pt-[var(--padding-card-top)] flex flex-col overflow-hidden
        transition-all duration-300 transform
        ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background node-selected' : 'node'}
        ${isComplete ? 'bg-gradient-to-br from-yellow-900/50 to-gray-900 border-yellow-600/50 shadow-[0_0_30px_rgba(202,138,4,0.15)]' : 'bg-gray-900 border-gray-700 opacity-80 grayscale'}
      `}
      onClick={isComplete ? () => selectNode(data.entityId) : undefined}
    >
      <Handle type="target" position={Position.Left} className="w-4 h-4 bg-yellow-500 border-2 border-gray-900" />

      <div className="p-6 flex flex-col items-center justify-center gap-3 text-center">
        <Film className={`w-8 h-8 ${isComplete ? 'text-yellow-400' : 'text-gray-600'}`} />

        <div>
          <h3 className={`font-bold text-sm tracking-wide ${isComplete ? 'text-yellow-100' : 'text-gray-500'}`}>
            FINAL RENDER
          </h3>
          {isRunning && (
            <p className="text-[10px] text-gray-500 uppercase mt-1">Waiting for scenes...</p>
          )}
        </div>

        {isComplete && (
          <Button size="sm" variant="outline" className="w-full mt-2 border-yellow-600 text-yellow-500 hover:bg-yellow-950/50">
            <Download className="w-4 h-4 mr-2" /> Download
          </Button>
        )}
      </div>
    </div>
  );
}
