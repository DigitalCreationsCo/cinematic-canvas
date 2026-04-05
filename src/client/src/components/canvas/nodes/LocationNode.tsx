// src/client/src/components/canvas/nodes/LocationNode.tsx
import type { NodeProps } from '@xyflow/react';
import { MapPin } from 'lucide-react';
import type { CanvasNode } from '#client/domain/canvas/NodeTypes.js';
import { NODE_STATUS_STYLES, HANDLE_IDS } from '#client/domain/canvas/NodeTypes.js';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { Badge } from '#client/components/ui/badge.js';
import { useLocationAssets } from '#client/store/useAssetStore.js';
import { resolvePublicUrl } from '../../../../../shared/utils/utils.js';
import { useWorldStore } from '#client/store/useWorldStore.js';
import { NodeShell, NodeShellHeader } from './NodeShell.js';
import { useWorldEntities } from '#client/hooks/useWorldEntities.js';
import { Skeleton } from '#client/components/ui/skeleton.js';

export function LocationNode({ data, isConnectable, selected }: NodeProps<CanvasNode>) {
  const worldName = useWorldStore((s) => s.worldName);
  const location = useProjectStore((s) => s.locations.get(data.entityId));
  const { worldLocations } = useWorldEntities();
  const worldLocation = worldLocations[data.entityId];
  const resolvedLocation = location || worldLocation;
  const { bestAssets: assets } = useLocationAssets(data.entityId);

  if (!resolvedLocation) {
    return (
      <NodeShell
        id={data.entityId}
        data={data}
        selected={selected}
        isConnectable={isConnectable}
        className="w-103 h-80 h-80 max-h-80 flex flex-col pt-[var(--padding-card-top)]"
        sourceHandle={{
          id: HANDLE_IDS.location.source,
          colorClass: '!bg-emerald-500 !border-gray-900',
          title: 'Connect to a scene to set this as the scene\'s location',
        }}
      >
        <NodeShellHeader
          icon={<MapPin className="w-4 h-4" />}
          label="Loading..."
          pendingCount={data.pendingChangeCount ?? 0}
        />
        <div className="p-0 relative group">
          <div className="aspect-video w-full border-b-2 flex items-center justify-center overflow-hidden border-gray-600 bg-gray-900/50">
            <MapPin className="w-12 h-12 text-gray-600 animate-pulse" />
          </div>
        </div>
      </NodeShell>
    );
  }

  const styleClass = NODE_STATUS_STYLES.pending;
  const pendingCount = data.pendingChangeCount ?? 0;
  const isWorldEntity = data.scope === 'world' || worldLocation;

  return (
    <NodeShell
      id={data.entityId}
      data={data}
      selected={selected}
      isConnectable={isConnectable}
      className="w-103 flex flex-col pt-[var(--padding-card-top)]"
      // Locations only output (set as scene backdrop) — no target handle.
      sourceHandle={{
        id: HANDLE_IDS.location.source,
        colorClass: '!bg-emerald-500 !border-gray-900',
        title: 'Connect to a scene to set this as the scene\'s location',
      }}
    >
      <NodeShellHeader
        icon={<MapPin className="w-4 h-4" />}
        label={resolvedLocation.name || 'Unnamed Location'}
        pendingCount={pendingCount}
      />

      <div className="p-0 flex-1">
        <div className={`w-full h-full border-b flex items-center justify-center overflow-hidden ${styleClass}`}>
          {assets?.location_image?.data ? (
            <img
              src={resolvePublicUrl(assets.location_image.data)}
              alt={resolvedLocation.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <MapPin className="w-12 h-12 text-border" />
          )}
        </div>

        {isWorldEntity && (
          <Badge className="absolute bottom-2 right-2 bg-indigo-900/80 text-indigo-200 border border-indigo-700 backdrop-blur-sm shadow-md">
            {`@${worldName}`}
          </Badge>
        )}
      </div>

      <div className="p-2 py-4 flex font-mono flex-col gap-2">
        {data.status === 'generating' ? (
          <div className="space-y-1.5 mt-1">
            <Skeleton className="h-2 w-full bg-muted/50" />
            <Skeleton className="h-2 w-4/5 bg-muted/50" />
          </div>
        ) : (
          <div className="px-3 text-xs text-muted-foreground line-clamp-2 leading-snug">
            {assets['description']?.data}
          </div>
        )}
      </div>
    </NodeShell>
  );
}