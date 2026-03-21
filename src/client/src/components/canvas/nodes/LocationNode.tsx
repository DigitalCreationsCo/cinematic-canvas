// src/client/src/components/canvas/nodes/LocationNode.tsx
import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { MapPin } from 'lucide-react';
import type { CanvasNode } from '#/domain/canvas/NodeTypes.js';
import { NODE_STATUS_STYLES, HANDLE_IDS } from '#/domain/canvas/NodeTypes.js';
import { useProjectStore } from '#/store/useProjectStore.js';
import { Badge } from '#/components/ui/badge.js';
import { useLocationAssets } from '#/store/useAssetStore.js';
import { resolvePublicUrl } from '../../../../../shared/utils/utils.js';
import { useWorldStore } from '#/store/useWorldStore.js';
import { NodeShell, NodeShellHeader } from './NodeShell.js';
import { useWorldEntities } from '#/hooks/useWorldEntities.js';

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
        data={data}
        selected={selected}
        isConnectable={isConnectable}
        className="w-97 h-80 pt-[var(--padding-card-top)]"
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
      data={data}
      selected={selected}
      isConnectable={isConnectable}
      className="w-103 pt-[var(--padding-card-top)]"
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

      <div className="p-0 relative group h-full">
        <div className={`h-full flex items-center justify-center overflow-hidden ${styleClass}`}>
          {assets?.location_image?.data ? (
            <img
              src={resolvePublicUrl(assets.location_image.data)}
              alt={resolvedLocation.name}
              className="h-full overflow-hidden object-cover"
            />
          ) : (
            <MapPin className="w-12 h-12 text-gray-600" />
          )}
        </div>

        {isWorldEntity && (
          <Badge className="absolute bottom-2 right-2 bg-indigo-900/80 text-indigo-200 border border-indigo-700 backdrop-blur-sm shadow-md">
            {`@${worldName}`}
          </Badge>
        )}
      </div>
    </NodeShell>
  );
}