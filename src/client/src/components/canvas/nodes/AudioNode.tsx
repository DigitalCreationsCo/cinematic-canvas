import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { Music3 } from 'lucide-react';
import type { CanvasNode } from '#/domain/canvas/NodeTypes.js';
import { HANDLE_IDS } from '#/domain/canvas/NodeTypes.js';
import { NodeShell, NodeShellHeader } from './NodeShell.js';
import { AudioPlayer } from '#/components/ui/audio-player.js';

export function AudioNode({ data, isConnectable, selected }: NodeProps<CanvasNode>) {
  const pendingCount = data.pendingChangeCount ?? 0;
  const audioSrc = data.audioSrc;
  const audioFileName = data.audioFileName;

  return (
    <NodeShell
      data={data}
      selected={selected}
      isConnectable={isConnectable}
      className="w-[320px]"
      sourceHandle={{
        id: HANDLE_IDS.audio.source,
        colorClass: '!bg-cyan-500 !border-gray-900',
        title: 'Connect to a scene to sync this audio track',
      }}
    >
      <NodeShellHeader
        icon={<Music3 className="w-4 h-4 text-cyan-400" />}
        label={audioFileName ? `Audio: ${audioFileName}` : 'Audio Track'}
        pendingCount={pendingCount}
      />

      <div className="p-3 bg-gray-950 flex flex-col gap-2 relative overflow-hidden">
        {audioSrc ? (
          <AudioPlayer 
            src={audioSrc} 
            title={audioFileName}
            className="w-full"
            controls
          />
        ) : (
          <>
            <div className="flex items-end justify-center gap-[2px] h-12 opacity-50">
              {Array.from({ length: 32 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-cyan-500 rounded-t-sm"
                  style={{ height: `${Math.sin(i * 0.4) * 30 + 40}%` }}
                />
              ))}
            </div>
            <p className="text-xs text-cyan-400/50 text-center">Drop an audio file here</p>
          </>
        )}
      </div>
    </NodeShell>
  );
}
