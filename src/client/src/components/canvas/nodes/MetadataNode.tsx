import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { BookOpen, Clock } from 'lucide-react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { useProjectStore } from '../../../store/useProjectStore.js';

export function MetadataNode({ data, selected }: NodeProps<CanvasNode>) {
  const { selectNode } = useCanvasUIStore();
  const metadata = useProjectStore((state) => state.metadata);

  return (
    <div
      className={`
        w-80 card-cinematic-glass overflow-hidden z-10 mb-4
        transition-all duration-200
        ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background node-selected' : 'node'}
      `}
      onClick={() => selectNode(data.entityId)}
    >
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          <span className="text-xs tracking-wide uppercase">
            {data.contextType === 'world' ? 'Metadata' : 'Metadata'}
          </span>
        </div>
      </div>


      <div className="p-4 flex flex-col gap-2">
        <p className="text-xs">
          Generation rules, base prompts, and globals.
          Select to view.
        </p>
      </div>

      {!metadata && <div className="flex flex-col text-center">
        <div className="flex items-center gap-2 p-4 rounded-full animate-pulse">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading Project...</p>
        </div>
      </div>}
    </div>
  );
}
