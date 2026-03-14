import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { User, Lock } from 'lucide-react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { NODE_STATUS_STYLES } from '../../../domain/canvas/NodeTypes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { Badge } from '../../ui/badge.js';
import { useCharacterAssets } from '../../../store/useAssetStore.js';
import { resolvePublicUrl } from '../../../../../shared/utils/utils.js';
import { Card } from '#/components/ui/card.js';

export function CharacterNode({ data, selected }: NodeProps<CanvasNode>) {
  const { selectNode } = useCanvasUIStore();
  const character = useProjectStore((state) => state.characters.get(data.entityId));

  if (!character) return null;

  const { bestAssets: assets } = useCharacterAssets(character.id);
  const styleClass = NODE_STATUS_STYLES.pending;
  // const styleClass = NODE_STATUS_STYLES[ character.status ] || NODE_STATUS_STYLES.pending;
  const isLocked = data.isLocked;
  const isSelectedForPipeline = data.pipelineSelected;

  return (
    <Card
      className={`
        w-56 card-cinematic-glass pt-[var(--padding-card-top)] overflow-hidden
        transition-all duration-200 
        ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
        ${isLocked ? 'border-muted opacity-80' : ''}
        ${isSelectedForPipeline ? '' : ''}
      `}
      onClick={() => selectNode(data.entityId)}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-gray-500" />

      {/* Header */}
      <div className="p-2 flex items-center justify-between border-b-2 relative">
        <div className="flex items-center gap-2 px-1">
          <User className="w-4 h-4" />
          <span className="text-sm truncate">
            {character.name || 'Unnamed Character'}
          </span>
        </div>
        {isLocked && <Lock className="w-3 h-3 text-red-400 absolute right-2 top-2" />}
      </div>

      {/* Content */}
      <div className="p-0 relative group">
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

        {data.scope === 'world' && (
          <Badge variant="secondary" className="absolute bottom-2 right-2 bg-accent/80 text-accent-foreground border border-accent backdrop-blur-sm shadow-md">
            WORLD
          </Badge>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-emerald-500 border-2 border-gray-900" />
    </Card>
  );
}
