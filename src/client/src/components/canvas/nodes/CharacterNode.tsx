// src/client/src/components/canvas/nodes/CharacterNode.tsx
import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { User } from 'lucide-react';
import type { CanvasNode } from '#/domain/canvas/NodeTypes.js';
import { NODE_STATUS_STYLES, HANDLE_IDS } from '#/domain/canvas/NodeTypes.js';
import { useProjectStore } from '#/store/useProjectStore.js';
import { Badge } from '#/components/ui/badge.js';
import { useCharacterAssets } from '#/store/useAssetStore.js';
import { resolvePublicUrl } from '../../../../../shared/utils/utils.js';
import { NodeShell, NodeShellHeader } from './NodeShell.js';

export function CharacterNode({ data, isConnectable, selected }: NodeProps<CanvasNode>) {
  const character = useProjectStore((s) => s.characters.get(data.entityId));
  const { bestAssets: assets } = useCharacterAssets(character?.id ?? null);

  if (!character) return null;

  const styleClass = NODE_STATUS_STYLES.pending;
  const pendingCount = data.pendingChangeCount ?? 0;

  return (
    <NodeShell
      data={data}
      selected={selected}
      isConnectable={isConnectable}
      className="w-56 pt-[var(--padding-card-top)]"
      // Characters only output (cast into scenes) — no target handle.
      sourceHandle={{
        id: HANDLE_IDS.character.source,
        colorClass: '!bg-amber-500 !border-gray-900',
        title: 'Connect to a scene to cast this character',
      }}
    >
      <NodeShellHeader
        icon={<User className="w-4 h-4" />}
        label={character.name || 'Unnamed Character'}
        pendingCount={pendingCount}
        extras={
          data.scope === 'world'
            ? <Badge variant="secondary" className="bg-accent/80 text-accent-foreground border border-accent backdrop-blur-sm text-[10px]">WORLD</Badge>
            : undefined
        }
      />

      <div className="p-0 relative">
        <div className={`aspect-square w-full border-b-2 flex items-center justify-center overflow-hidden ${styleClass}`}>
          {assets?.character_image?.data ? (
            <img
              src={resolvePublicUrl(assets.character_image.data)}
              alt={character.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-12 h-12 text-gray-700" />
          )}
        </div>
      </div>
    </NodeShell>
  );
}