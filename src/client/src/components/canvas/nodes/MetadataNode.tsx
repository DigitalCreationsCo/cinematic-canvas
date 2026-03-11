import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { BookOpen } from 'lucide-react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';

export function MetadataNode({ data, selected }: NodeProps<CanvasNode>) {
  const { selectNode } = useCanvasUIStore();

  return (
    <div 
      className={`
        w-80 rounded-xl bg-gray-900 border-2 overflow-hidden
        transition-all duration-200 shadow-xl
        ${selected ? 'border-indigo-500 shadow-indigo-500/20' : 'border-gray-700 hover:border-gray-500'}
      `}
      onClick={() => selectNode(data.entityId)}
    >
      <div className="bg-gray-800 p-3 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2 text-indigo-400">
          <BookOpen className="w-5 h-5" />
          <span className="font-semibold text-sm tracking-wide uppercase">
            {data.contextType === 'world' ? 'World Ledger' : 'Project Definition'}
          </span>
        </div>
      </div>
      
      <div className="p-4 flex flex-col gap-2">
        <p className="text-gray-400 text-xs">
          Contains core generation rules, base prompts, and global configuration. 
          Select to view and edit in the sidebar.
        </p>
      </div>

      <Handle 
        type="source" 
        position={Position.Right} 
        className="w-3 h-3 bg-indigo-500 border-2 border-gray-900" 
      />
    </div>
  );
}
