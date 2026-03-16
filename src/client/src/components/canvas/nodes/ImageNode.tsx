// src/client/src/components/canvas/nodes/ImageNode.tsx
import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { Image as ImageIcon, Sparkles, Wand2, BookOpenText } from 'lucide-react';
import type { CanvasNode, ImageNodeFlag } from '#/domain/canvas/NodeTypes.js';
import { HANDLE_IDS } from '#/domain/canvas/NodeTypes.js';
import { useProjectStore } from '#/store/useProjectStore.js';
import { useLocationAssets } from '#/store/useAssetStore.js';
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
  const entity = useProjectStore((s) => s.locations.get(data.entityId));
  const { bestAssets } = useLocationAssets(data.entityId);

  const flagRaw = (data.nodeTypeFlag ?? 'import') as ImageNodeFlag;
  const config = FLAG_CONFIG[flagRaw];
  const isCompositeOutput = flagRaw === 'composite_output';
  const pendingCount = data.pendingChangeCount ?? 0;

  if (!entity && !isCompositeOutput) {
    return (
      <NodeShell
        data={data}
        selected={selected}
        isConnectable={isConnectable}
        className="w-48"
        sourceHandle={{
          id: HANDLE_IDS.image.source,
          colorClass: config.sourceColorClass,
          title: `Connect to a scene or composite node as a ${config.label.toLowerCase()}`,
        }}
      >
        <div className="bg-gray-800 p-2 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center gap-2 px-1">
            {config.icon}
            <span className="font-semibold text-xs text-gray-400 uppercase tracking-wider">
              {config.label}
            </span>
          </div>
        </div>
        <div className="p-0 relative">
          <div className="aspect-square w-full bg-gray-900/50 flex items-center justify-center overflow-hidden border-gray-600">
            <ImageIcon className="w-12 h-12 text-gray-600 animate-pulse" />
          </div>
        </div>
      </NodeShell>
    );
  }

  const imgSrc = bestAssets?.location_image?.data;

  return (
    <NodeShell
      data={data}
      selected={selected}
      isConnectable={isConnectable}
      className="w-48"
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
      {/* Header */}
      <div className="bg-gray-800 p-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-2 px-1">
          {config.icon}
          <span className="font-semibold text-xs text-gray-400 uppercase tracking-wider">
            {config.label}
          </span>
        </div>
        {/* Pending badge delegated to NodeShellHeader — inline here since header
            uses non-standard bg colour and doesn't use NodeShellHeader */}
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
            {pendingCount}
          </span>
        )}
      </div>

      {/* Image */}
      <div className="p-0 relative">
        <div className="aspect-square w-full bg-gray-950 flex items-center justify-center overflow-hidden">
          {imgSrc ? (
            <img src={imgSrc} alt="Node Media" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-12 h-12 text-gray-700" />
          )}
        </div>
      </div>
    </NodeShell>
  );
}