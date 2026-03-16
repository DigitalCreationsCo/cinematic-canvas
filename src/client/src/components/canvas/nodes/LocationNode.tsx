import { Handle, Position, type NodeProps } from '@xyflow/react';
import { MapPin, Lock } from 'lucide-react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { NODE_STATUS_STYLES } from '../../../domain/canvas/NodeTypes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { Badge } from '../../ui/badge.js';
import { useLocationAssets } from '../../../store/useAssetStore.js';
import { resolvePublicUrl } from '../../../../../shared/utils/utils.js';
import { useWorldStore } from '#/store/useWorldStore.js';

export function LocationNode({ data, selected }: NodeProps<CanvasNode>) {
  const selectNode = useCanvasUIStore(s => s.selectNode);
  const worldName = useWorldStore(s => s.worldName);
  const location = useProjectStore((state) => state.locations.get(data.entityId));
  const { bestAssets: assets } = useLocationAssets(data.entityId);

  if (!location) return null;

  // const styleClass = NODE_STATUS_STYLES[ location.status ] || NODE_STATUS_STYLES.pending;
  const styleClass = NODE_STATUS_STYLES.pending;
  const isSelectedForPipeline = data.pipelineSelected;

  return (
    <div
      className={`
        w-96 card-cinematic-glass pt-[var(--padding-card-top)] flex flex-col overflow-hidden
        transition-all duration-200 
        ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background node-selected' : 'node'}
        ${isSelectedForPipeline ? 'node-selected' : ''}
      `}
      onClick={() => selectNode(data.entityId)}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-gray-500" />

      {/* Header */}
      <div className="p-2 flex items-center justify-between border-b-2 relative">
        <div className="flex items-center gap-2 px-1">
          <MapPin className="w-4 h-4" />
          <span className="text-sm truncate">
            {location.name || 'Unnamed Location'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-0 relative group">
        <div className={`aspect-video w-full border-b-2 flex items-center justify-center overflow-hidden ${styleClass}`}>
          {assets?.location_image?.data ? (
            <img
              src={resolvePublicUrl(assets.location_image.data)}
              alt={location.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <MapPin className="w-12 h-12" />
          )}
        </div>

        {data.scope === 'world' && (
          <Badge className="absolute bottom-2 right-2 bg-indigo-900/80 text-indigo-200 border border-indigo-700 backdrop-blur-sm shadow-md">
            {`@${worldName}`}
          </Badge>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-orange-500 border-2 border-gray-900" />
    </div>
  );
}
