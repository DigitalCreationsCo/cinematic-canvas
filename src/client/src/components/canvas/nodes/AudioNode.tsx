// src/client/src/components/canvas/nodes/AudioNode.tsx
import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { Music3 } from 'lucide-react';
import type { CanvasNode } from '#/domain/canvas/NodeTypes.js';
import { HANDLE_IDS } from '#/domain/canvas/NodeTypes.js';
import { NodeShell, NodeShellHeader } from './NodeShell.js';

export function AudioNode({ data, isConnectable, selected }: NodeProps<CanvasNode>) {
  const pendingCount = data.pendingChangeCount ?? 0;

  return (
    <NodeShell
      data={data}
      selected={selected}
      isConnectable={isConnectable}
      className="w-48"
      // Audio only outputs (sync to scenes) — no target handle.
      sourceHandle={{
        id: HANDLE_IDS.audio.source,
        colorClass: '!bg-cyan-500 !border-gray-900',
        title: 'Connect to a scene to sync this audio track',
      }}
    >
      <NodeShellHeader
        icon={<Music3 className="w-4 h-4 text-cyan-400" />}
        label="Audio Track"
        pendingCount={pendingCount}
      />

      <div className="p-3 bg-gray-950 flex flex-col gap-2 relative overflow-hidden">
        {/* Fake waveform visualiser */}
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
    </NodeShell>
  );
}