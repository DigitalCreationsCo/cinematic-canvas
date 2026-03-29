import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Film, Download } from 'lucide-react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { Button } from '../../ui/button.js';
import { VideoPlayer } from '../../ui/video-player.js';
import { resolvePublicUrl } from '../../../../../shared/utils/utils.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useAssetStore, useProjectAssets } from '#/store/useAssetStore.js';
import { NodeShell } from '#/components/canvas/nodes/NodeShell.js';


export function RenderNode({ data, selected }: NodeProps<CanvasNode>) {
  const { selectNode } = useCanvasUIStore();
  const pipelineStatus = usePipelineStore((state) => state.status);

  const isComplete = pipelineStatus === 'complete';
  const isRunning = pipelineStatus === 'generating' || pipelineStatus === 'evaluating';
  // Temporarily removing finalVideoUrl since it's not present in store
  // Using lore.finalVideoUrl just as an example since project isn't exported in the state root
  // Using metadata.audioPublicUri just as an example since final video URL isn't explicitly defined in metadata types yet. You might need to update shared/types to add it if it belongs there.

  const projectId = useProjectStore(s => s.selectedProjectId);
  const { latestAssets: assets } = useProjectAssets(projectId);
  const finalVideoUrl = assets['render_video']?.data;

   return (
     <NodeShell
       id={data.entityId}
       data={data}
       selected={selected}
       className={`
         w-56 card-cinematic-glass pt-[var(--padding-card-top)] flex flex-col overflow-hidden
         transition-all duration-300 transform
         ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background node-selected' : 'node'}
         ${isComplete ? 'bg-gradient-to-br from-yellow-900/50 to-gray-900 border-yellow-600/50 shadow-[0_0_30px_rgba(202,138,4,0.15)]' : 'bg-gray-900 border-gray-700 opacity-80 grayscale'}
       `}
    >
      <Handle type="target" position={Position.Left} className="w-4 h-4 bg-yellow-500 border-2 border-gray-900" />

      {finalVideoUrl ? (
        <div className="aspect-[16/9] w-full border-b border-yellow-600/30 overflow-hidden relative group">
          <VideoPlayer
            src={resolvePublicUrl(finalVideoUrl)}
            className="w-full h-full object-cover"
            playOnHover
            controls={true}
          />
        </div>
      ) : (
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
        </div>
      )}

      {finalVideoUrl && (
        <div className="p-4 pt-2 flex flex-col items-center justify-center">
          <Button
            size="sm"
            variant="outline"
            className="w-full border-yellow-600 text-yellow-500 hover:bg-yellow-950/50"
            onClick={(e) => {
              e.stopPropagation();
              if (finalVideoUrl) {
                window.open(resolvePublicUrl(finalVideoUrl), '_blank');
              }
            }}
          >
            <Download className="w-4 h-4 mr-2" /> Download
          </Button>
        </div>
      )}
    </NodeShell>
  );
}
