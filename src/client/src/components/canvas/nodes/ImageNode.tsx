// src/client/src/components/canvas/nodes/ImageNode.tsx
import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { Image as ImageIcon, Sparkles, Wand2, BookOpenText } from 'lucide-react';
import type { CanvasNode, ImageNodeFlag } from '#/domain/canvas/NodeTypes.js';
import { HANDLE_IDS } from '#/domain/canvas/NodeTypes.js';
import { useAssetStore } from '#/store/useAssetStore.js';
import { getAllBestAssets } from '../../../../../shared/utils/assets-utils.js';
import { NodeShell, NodeShellHeader } from './NodeShell.js';

// ── Flag metadata ─────────────────────────────────────────────────────────────

const FLAG_CONFIG: Record<
  ImageNodeFlag,
  { icon: React.ReactNode; label: string; sourceColorClass: string }
> = {
  style_reference: {
    icon: <Sparkles className="w-4 h-4 text-purple-400" />,
    label: 'Style Reference',
    sourceColorClass: '!bg-purple-500 !border-gray-900',
  },
  lore: {
    icon: <BookOpenText className="w-4 h-4 text-slate-400" />,
    label: 'Lore Image',
    sourceColorClass: '!bg-slate-500 !border-gray-900',
  },
  import: {
    icon: <ImageIcon className="w-4 h-4 text-blue-400" />,
    label: 'Imported Image',
    sourceColorClass: '!bg-blue-500 !border-gray-900',
  },
  composite_output: {
    icon: <Wand2 className="w-4 h-4 text-fuchsia-400" />,
    label: 'Composite Image',
    sourceColorClass: '!bg-fuchsia-500 !border-gray-900',
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function ImageNode({ data, isConnectable, selected }: NodeProps<CanvasNode>) {
  const assets = useAssetStore((state) => state.assets.get(data.entityId) ?? null);
  const bestAssets = getAllBestAssets(assets);
  const imgSrc = bestAssets?.image_file?.data;

  const flagRaw = (data.nodeTypeFlag ?? 'import') as ImageNodeFlag;
  const config = FLAG_CONFIG[flagRaw];
  const isCompositeOutput = flagRaw === 'composite_output';
  const pendingCount = data.pendingChangeCount ?? 0;

  const showPlaceholder = !imgSrc && !isCompositeOutput;

  return (
    <NodeShell
      data={data}
      selected={selected}
      isConnectable={isConnectable}
      className="w-86"
      // composite_output images accept incoming composite feed; others have no target.
      targetHandle={
        isCompositeOutput
          ? {
            id: HANDLE_IDS.image.target,
            colorClass: '!bg-fuchsia-500 !border-gray-900',
            title: 'Receives composite output',
          }
          : undefined
      }
      // All image types can connect outward to scenes or composites.
      sourceHandle={{
        id: HANDLE_IDS.image.source,
        colorClass: config.sourceColorClass,
        title: `Connect to a scene or composite node as a ${config.label.toLowerCase()}`,
      }}
    >
      <NodeShellHeader
        icon={config.icon}
                label={data.label || config.label}
        pendingCount={pendingCount}
      />

      <div className="p-0 relative group">
        {imgSrc ? (
          <div className="w-full bg-gray-950 flex items-center justify-center overflow-hidden">
            <img src={imgSrc} alt="Node Media" className="w-full h-auto" />
          </div>
        ) : (
          <div className="aspect-square w-full bg-gray-950 flex items-center justify-center overflow-hidden">
            <ImageIcon className={showPlaceholder ? 'w-12 h-12 text-gray-600 animate-pulse' : 'w-12 h-12 text-gray-700'} />
          </div>
        )}
      </div>
    </NodeShell>
  );
}