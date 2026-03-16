import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Image as ImageIcon, Sparkles, Wand2, BookOpenText } from 'lucide-react';
import type { CanvasNode, ImageNodeFlag } from '../../../domain/canvas/NodeTypes.js';
import { NODE_STATUS_STYLES } from '../../../domain/canvas/NodeTypes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { Badge } from '../../ui/badge.js';
import { useLocationAssets } from '../../../store/useAssetStore.js';

const FLAG_CONFIG: Record<ImageNodeFlag, { icon: React.ReactNode, label: string, color: string; }> = {
  style_reference: { icon: <Sparkles className="w-4 h-4 text-purple-400" />, label: 'Style Reference', color: 'bg-purple-500' },
  lore: { icon: <BookOpenText className="w-4 h-4 text-slate-400" />, label: 'Lore Image', color: 'bg-slate-500' },
  import: { icon: <ImageIcon className="w-4 h-4 text-blue-400" />, label: 'Imported Image', color: 'bg-blue-500' },
  composite_output: { icon: <Wand2 className="w-4 h-4 text-fuchsia-400" />, label: 'Composite Image', color: 'bg-fuchsia-500' },
};

export function ImageNode({ data, selected }: NodeProps<CanvasNode>) {
  const { selectNode } = useCanvasUIStore();

  const entity = useProjectStore((state) => state.locations.get(data.entityId));
  const { bestAssets } = useLocationAssets(data.entityId);

  if (!entity && data.nodeTypeFlag !== 'composite_output') return null;

  const flagRaw = data.nodeTypeFlag || 'import';
  const config = FLAG_CONFIG[flagRaw];
  const isSelectedForPipeline = data.pipelineSelected;

  const imgSrc = bestAssets?.location_image?.data;

  return (
    <div
      className={`
        w-48 card-cinematic-glass overflow-hidden
        transition-all duration-200 
        ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background node-selected' : 'node'}
        ${isSelectedForPipeline ? 'node-selected' : ''}
      `}
      onClick={() => selectNode(data.entityId)}
    >
      {/* Target handle only for composite_output, others are source-only */}
      {flagRaw === 'composite_output' && (
        <Handle type="target" position={Position.Left} className="w-3 h-3 bg-gray-500" />
      )}

      {/* Header */}
      <div className="bg-gray-800 p-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-2 px-1">
          {config.icon}
          <span className="font-semibold text-xs text-gray-400 uppercase tracking-wider">
            {config.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-0 relative group">
        <div className={`aspect-square w-full bg-gray-950 flex items-center justify-center overflow-hidden`}>
          {imgSrc ? (
            <img
              src={imgSrc}
              alt="Node Media"
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageIcon className="w-12 h-12 text-gray-700" />
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className={`w-3 h-3 ${config.color} border-2 border-gray-900`} />
    </div>
  );
}
