import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Clapperboard, Video, Image as ImageIcon, MessageSquareWarning } from 'lucide-react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { NODE_STATUS_STYLES } from '../../../domain/canvas/NodeTypes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { useSceneAssets } from '../../../store/useAssetStore.js';

export function SceneNode({ data, selected }: NodeProps<CanvasNode>) {
  const { selectNode } = useCanvasUIStore();
  const scene = useProjectStore((state) => state.scenes.get(data.entityId));
  const { assets } = useSceneAssets(data.entityId);

  if (!scene) return null;

  const styleClass = NODE_STATUS_STYLES[ scene.status ] || NODE_STATUS_STYLES.pending;
  const isSelectedForPipeline = data.pipelineSelected;
  const isGenerating = scene.status === 'generating' || scene.status === 'evaluating';
  const hasError = scene.status === 'error';

  return (
    <div
      className={ `
        w-80 rounded-xl bg-gray-900 border-2 overflow-hidden
        transition-all duration-200 
        ${selected ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-gray-950' : ''}
        ${isSelectedForPipeline ? 'shadow-[0_0_15px_rgba(99,102,241,0.3)]' : ''}
        border-gray-700
      `}
      onClick={ () => selectNode(data.entityId) }
      onDoubleClick={ () => /* Trigger pipeline for just this scene */ undefined }
    >
      {/* Left handles (Inputs) */ }
      <Handle type="target" position={ Position.Left } id="sequence" style={ { top: '25%' } } className="w-3 h-3 bg-gray-500" />
      <Handle type="target" position={ Position.Left } id="character" style={ { top: '50%' } } className="w-3 h-3 bg-emerald-500" />
      <Handle type="target" position={ Position.Left } id="location" style={ { top: '75%' } } className="w-3 h-3 bg-orange-500" />

      {/* Header */ }
      <div className="bg-gray-800 p-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-2 px-1">
          <Clapperboard className="w-4 h-4 text-blue-400" />
          <span className="font-semibold text-sm truncate text-gray-200">
            Scene { scene.sceneIndex + 1 }
          </span>
        </div>
      </div>

      {/* Content */ }
      <div className="p-0 relative">
        <div className={ `aspect-video w-full bg-gray-950 border-b-2 flex flex-col items-center justify-center overflow-hidden relative ${styleClass}` }>

          {/* Main View: Video or Start Frame */ }
          { assets?.scene_video?.versions?.[ 0 ]?.data ? (
            <video
              src={ assets.scene_video.versions[ 0 ].data }
              className="w-full h-full object-cover"
              controls
              controlsList="nodownload pnp"
              disablePictureInPicture
            />
          ) : assets?.scene_start_frame?.versions?.[ 0 ]?.data ? (
            <img
              src={ assets.scene_start_frame.versions[ 0 ].data }
              alt="Start frame"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-700">
              <Video className="w-12 h-12" />
              <span className="text-xs uppercase font-semibold">No Media</span>
            </div>
          ) }

          {/* Overlays */ }
          { isGenerating && (
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-t-2 border-r-2 border-blue-400 rounded-full animate-spin mb-2" />
              <span className="text-xs text-blue-200 font-medium px-4 text-center">
                { scene.progressMessage || 'Generating...' }
              </span>
            </div>
          ) }

          { hasError && (
            <div className="absolute inset-0 bg-red-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-center p-4">
              <MessageSquareWarning className="w-8 h-8 text-red-200 mb-2" />
              <span className="text-xs text-red-100 font-medium line-clamp-2">
                { scene.progressMessage || 'Generation failed' }
              </span>
            </div>
          ) }
        </div>

        {/* Thumbnail Row (End Frame if it exists) */ }
        { !isGenerating && !hasError && assets?.scene_end_frame?.versions?.[ 0 ]?.data && (
          <div className="h-12 bg-gray-800 flex gap-1 p-1 overflow-x-auto">
            <div className="h-full aspect-video rounded overflow-hidden relative border border-gray-700 shrink-0">
              <img
                src={ assets.scene_end_frame.versions[ 0 ].data }
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 right-0 bg-black/70 px-1 py-0.5 text-[8px] text-white">END</div>
            </div>
          </div>
        ) }
      </div>

      <Handle type="source" position={ Position.Right } id="sequence" className="w-3 h-3 bg-blue-500 border-2 border-gray-900" />
    </div>
  );
}
