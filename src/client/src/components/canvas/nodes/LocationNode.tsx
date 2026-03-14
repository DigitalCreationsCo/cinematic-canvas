import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { MapPin, Lock } from 'lucide-react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { NODE_STATUS_STYLES } from '../../../domain/canvas/NodeTypes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { Badge } from '../../ui/badge.js';
import { useLocationAssets } from '../../../store/useAssetStore.js';
import { resolvePublicUrl } from '../../../../../shared/utils/utils.js';

export function LocationNode({ data, selected }: NodeProps<CanvasNode>) {
  const { selectNode } = useCanvasUIStore();
  const location = useProjectStore((state) => state.locations.get(data.entityId));
  const { bestAssets: assets } = useLocationAssets(data.entityId);

  if (!location) return null;

  // const styleClass = NODE_STATUS_STYLES[ location.status ] || NODE_STATUS_STYLES.pending;
  const styleClass = NODE_STATUS_STYLES.pending;
  const isLocked = data.isLocked;
  const isSelectedForPipeline = data.pipelineSelected;

  return (
    <div
      className={ `
        w-64 rounded-xl bg-gray-900 border-2 overflow-hidden
        transition-all duration-200 
        ${selected ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-gray-950' : ''}
        ${isLocked ? 'border-dashed border-gray-600 opacity-80' : 'border-gray-700'}
        ${isSelectedForPipeline ? 'shadow-[0_0_15px_rgba(99,102,241,0.3)]' : ''}
      `}
      onClick={ () => selectNode(data.entityId) }
    >
      <Handle type="target" position={ Position.Left } className="w-3 h-3 bg-gray-500" />

      {/* Header */ }
      <div className="bg-gray-800 p-2 flex items-center justify-between border-b border-gray-700 relative">
        <div className="flex items-center gap-2 px-1">
          <MapPin className="w-4 h-4 text-orange-400" />
          <span className="font-semibold text-sm truncate text-gray-200">
            { location.name || 'Unnamed Location' }
          </span>
        </div>
        { isLocked && <Lock className="w-3 h-3 text-red-400 absolute right-2 top-2" /> }
      </div>

      {/* Content */ }
      <div className="p-0 relative group">
        <div className={ `aspect-video w-full bg-gray-950 border-b-2 flex items-center justify-center overflow-hidden ${styleClass}` }>
          { assets?.location_image?.data ? (
            <img
              src={ resolvePublicUrl(assets.location_image.data) }
              alt={ location.name }
              className="w-full h-full object-cover"
            />
          ) : (
            <MapPin className="w-12 h-12 text-gray-700" />
          ) }
        </div>

        { data.scope === 'world' && (
          <Badge variant="secondary" className="absolute bottom-2 right-2 bg-indigo-900/80 text-indigo-200 border border-indigo-700 backdrop-blur-sm shadow-md">
            WORLD
          </Badge>
        ) }
      </div>

      <Handle type="source" position={ Position.Right } className="w-3 h-3 bg-orange-500 border-2 border-gray-900" />
    </div>
  );
}
