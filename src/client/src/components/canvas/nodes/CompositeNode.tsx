// src/client/src/components/canvas/nodes/CompositeNode.tsx
import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { Layers } from 'lucide-react';
import type { CanvasNode } from '#client/domain/canvas/NodeTypes.js';
import { HANDLE_IDS } from '#client/domain/canvas/NodeTypes.js';
import { Button } from '#client/components/ui/button.js';
import { NodeShell, NodeShellHeader } from './NodeShell.js';

export function CompositeNode({ data, id, isConnectable, selected }: NodeProps<CanvasNode>) {
  const pendingCount = data.pendingChangeCount ?? 0;

  const handleGenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Dispatched to pipeline worker — see usePipelineStore.
    console.log('[CompositeNode] Dispatch Generate for', id);
  };

  return (
    <NodeShell
      id={data.entityId}
      data={data}
      selected={selected}
      isConnectable={isConnectable}
      className="w-64"
      // No primary single target — composite uses three named inputs instead.
      // The `additionalTargetHandles` prop renders them via NodeShell.
      additionalTargetHandles={[
        {
          id: HANDLE_IDS.composite.in1,
          colorClass: '!bg-fuchsia-500/50 !border-fuchsia-400',
          style: { top: '30%' },
          title: 'Composite input 1',
        },
        {
          id: HANDLE_IDS.composite.in2,
          colorClass: '!bg-fuchsia-500/50 !border-fuchsia-400',
          style: { top: '50%' },
          title: 'Composite input 2',
        },
        {
          id: HANDLE_IDS.composite.in3,
          colorClass: '!bg-fuchsia-500/50 !border-fuchsia-400',
          style: { top: '70%' },
          title: 'Composite input 3',
        },
      ]}
      // Single output — emits merged composite image.
      sourceHandle={{
        id: HANDLE_IDS.composite.source,
        colorClass: '!bg-fuchsia-500 !border-white',
        title: 'Composite output — connect to a scene',
      }}
    >
      {/* Custom dark header (doesn't use NodeShellHeader default bg) */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-2 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-fuchsia-400" />
            <span className="font-bold text-sm text-gray-100 tracking-wide">
              COMPOSITE MERGE
            </span>
          </div>
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-none text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
              {pendingCount}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
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
    </NodeShell>
  );
}