// src/client/src/components/canvas/nodes/CompositeNode.tsx
import React, { useMemo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Layers } from 'lucide-react';
import type { CanvasNode } from '#client/domain/canvas/NodeTypes.js';
import { HANDLE_IDS } from '#client/domain/canvas/NodeTypes.js';
import { Button } from '#client/components/ui/button.js';
import { NodeShell, NodeShellHeader } from './NodeShell.js';
import { useNodeStore } from '#client/store/useNodeStore.js';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { useAssetStore } from '#client/store/useAssetStore.js';
import { usePipelineStore } from '#client/store/usePipelineStore.js';
import { useCanvasUIStore } from '#client/store/useCanvasUIStore.js';
import { generateComposites } from '#client/lib/api.js';
import { getAllBestAssets } from '../../../../../shared/utils/assets-utils.js';
import type { AssetKey } from '../../../../../shared/types/assets.types.js';
import type { ReferenceType } from '../../../../../shared/lm/provider.js';

export function CompositeNode({ data, id, isConnectable, selected }: NodeProps<CanvasNode>) {
  const pendingCount = data.pendingChangeCount ?? 0;
  const edges = useNodeStore(state => state.edges);
  const nodes = useNodeStore(state => state.nodes);
  const selectedProjectId = useProjectStore(state => state.selectedProjectId);
  const addMessage = usePipelineStore(state => state.pushEvent);
  const isLoading = useCanvasUIStore(s => s.isLoading);

  const compositePrompt = (data.compositePrompt as string) || '';
  const compositeWeights = (data.compositeWeights as number[]) || [50, 50, 50];

  const inputImages = useMemo(() => {
    if (!selectedProjectId) return [];

    const incomingEdges = edges.filter(e => e.target === id);
    const images: Array<{
      src: string;
      entityId: string;
      assetKey: AssetKey;
      version: number;
      weight: number;
      blendMode: 'normal' | 'overlay' | 'multiply' | 'screen' | 'soft-light';
      type: ReferenceType;
    }> = [];

    incomingEdges.forEach((edge, idx) => {
      const srcNode = nodes.find(n => n.id === edge.source);
      if (!srcNode) return;

      const entityId = srcNode.data.entityId;
      const assets = useAssetStore.getState().assets.get(entityId);
      const bestAssets = getAllBestAssets(assets);

      if (!bestAssets) return;

      const imageData = bestAssets.image_file?.data ||
        bestAssets.character_image?.data ||
        bestAssets.location_image?.data ||
        bestAssets.scene_start_frame?.data ||
        bestAssets.scene_end_frame?.data;

      if (!imageData) return;

      let assetKey: AssetKey = 'image_file';
      let refType: ReferenceType = 'base';

      if (srcNode.type === 'character') {
        assetKey = 'character_image';
        refType = 'style';
      } else if (srcNode.type === 'location') {
        assetKey = 'location_image';
        refType = 'style';
      } else if (srcNode.type === 'scene') {
        assetKey = 'scene_start_frame';
        refType = 'content';
      } else if (srcNode.type === 'file') {
        assetKey = 'image_file';
        const flag = srcNode.data.nodeTypeFlag;
        refType = flag === 'style_reference' ? 'style' : flag === 'lore' ? 'content' : 'base';
      }

      const bestAsset = bestAssets[assetKey];
      const version = bestAsset?.version || 1;
      const weight = compositeWeights[idx] ?? 50;

      images.push({
        src: imageData,
        entityId,
        assetKey,
        version,
        weight,
        blendMode: 'normal',
        type: refType,
      });
    });

    return images;
  }, [edges, nodes, id, selectedProjectId, compositeWeights]);

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!selectedProjectId) {
      addMessage({ id: Date.now().toString(), type: 'error', message: 'No project selected', timestamp: new Date() });
      return;
    }

    if (inputImages.length === 0) {
      addMessage({ id: Date.now().toString(), type: 'error', message: 'Connect at least one image node to generate composite', timestamp: new Date() });
      return;
    }

    if (!compositePrompt.trim()) {
      addMessage({ id: Date.now().toString(), type: 'error', message: 'Enter a composite prompt', timestamp: new Date() });
      return;
    }

    try {
      addMessage({ id: Date.now().toString(), type: 'info', message: 'Generating composite image...', timestamp: new Date() });

      await generateComposites({
        imageId: data.entityId,
        inputImages,
        prompt: compositePrompt,
        numberOfOutputs: 1,
      });

      addMessage({ id: Date.now().toString(), type: 'success', message: 'Composite generation queued', timestamp: new Date() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to queue composite generation';
      addMessage({ id: Date.now().toString(), type: 'error', message, timestamp: new Date() });
    }
  };

  return (
    <NodeShell
      id={data.entityId}
      data={data}
      selected={selected}
      isConnectable={isConnectable}
      className="w-64"
      additionalTargetHandles={[
        {
          id: HANDLE_IDS.composite.in1,
          colorClass: '!bg-fuchsia-500/50 !border-fuchsia-400',
          style: { top: '30%' },
          title: 'Composite input 1',
        },
        {
          id: HANDLE_IDS.composite.in2,
          colorClass: '!bg-fuchsia-500/50 !border-fuchsia-400',
          style: { top: '50%' },
          title: 'Composite input 2',
        },
        {
          id: HANDLE_IDS.composite.in3,
          colorClass: '!bg-fuchsia-500/50 !border-fuchsia-400',
          style: { top: '70%' },
          title: 'Composite input 3',
        },
      ]}
      sourceHandle={{
        id: HANDLE_IDS.composite.source,
        colorClass: '!bg-fuchsia-500 !border-white',
        title: 'Composite output — connect to a scene',
      }}
    >
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-2 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-fuchsia-400" />
            <span className="font-bold text-sm text-gray-100 tracking-wide">
              COMPOSITE MERGE
            </span>
          </div>
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-none text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
              {pendingCount}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className="text-xs text-center text-gray-400 mb-2 font-mono bg-black/40 py-1 rounded">
          {inputImages.length > 0
            ? `${inputImages.length} input(s) connected`
            : '<< Select to adjust weights'}
        </div>
        <Button
          size="sm"
          className="w-full bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white shadow-md border-0 disabled:opacity-50"
          onClick={handleGenerate}
          disabled={isLoading || inputImages.length === 0}
        >
          Generate Output
        </Button>
      </div>
    </NodeShell>
  );
}