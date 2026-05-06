import React, { useState, useCallback } from "react";
import { Label } from "#client/components/ui/label.js";
import { Textarea } from "#client/components/ui/textarea.js";
import { Button } from "#client/components/ui/button.js";
import { Slider } from "#client/components/ui/slider.js";
import { Layers, Image as ImageIcon } from "lucide-react";
import { Badge } from "#client/components/ui/badge.js";
import type { CanvasNode } from "#client/domain/canvas/NodeTypes.js";
import { getAllBestAssets } from "#shared/utils/assets.utils.js";
import { useAssetStore } from "#client/store/useAssetStore.js";
import { useNodeStore } from "#client/store/useNodeStore.js";
import { useProjectStore } from "#client/store/useProjectStore.js";

export function CompositeInspector({ node }: { node: CanvasNode }) {
  const edges = useNodeStore((state) => state.edges);
  const nodes = useNodeStore((state) => state.nodes);
  const updateNodeData = useNodeStore((state) => state.updateNodeData);
  const { characters, locations, scenes } = useProjectStore();

  const incomingEdges = edges.filter((e) => e.target === node.id);
  const getEntityForNode = (nId: string) => {
    return characters.get(nId) || locations.get(nId) || scenes.get(nId);
  };

  const inputs = incomingEdges
    .map((e) => {
      const srcNode = nodes.find((n) => n.id === e.source);
      if (!srcNode) return null;
      const entity = getEntityForNode(srcNode.data.entityId);
      return {
        handleId: e.targetHandle,
        name:
          entity?.name ||
          (entity && "sceneIndex" in entity
            ? `Scene ${(entity as any).sceneIndex + 1}`
            : "Unknown Input"),
        type: srcNode.type,
        srcNode,
      };
    })
    .filter(Boolean);

  const storedWeights = (node.data.compositeWeights as number[]) || [50, 50, 50];
  const [weights, setWeights] = useState<number[]>(storedWeights);
  const [prompt, setPrompt] = useState((node.data.compositePrompt as string) || "");

  const handleWeightChange = useCallback(
    (index: number, value: number) => {
      const newWeights = [...weights];
      newWeights[index] = value;
      setWeights(newWeights);
      updateNodeData(node.id, { compositeWeights: newWeights });
    },
    [weights, node.id, updateNodeData],
  );

  const handlePromptChange = useCallback(
    (value: string) => {
      setPrompt(value);
      updateNodeData(node.id, { compositePrompt: value });
    },
    [node.id, updateNodeData],
  );

  return (
    <div className="p-4 flex flex-col h-full bg-gray-950 text-gray-200">
      <div className="mb-6 pb-4 border-b border-gray-800">
        <h2 className="text-xl font-bold flex items-center gap-2 text-fuchsia-300">
          <Layers className="w-5 h-5" /> Composite Operation
        </h2>
        <span className="text-xs text-gray-400 capitalize tracking-widest mt-1 block">
          Multi-Image Merge
        </span>
      </div>

      <div className="space-y-6 flex-1 overflow-auto pe-2">
        <div className="space-y-3">
          <Label className="text-gray-400 text-xs uppercase font-semibold">
            Connected Inputs
          </Label>
          {inputs.length === 0 ? (
            <div className="p-3 bg-gray-900 border border-gray-800 border-dashed rounded-none text-sm text-gray-500 text-center">
              Connect Character, Location, or Scene nodes to the input handles on the
              canvas.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {inputs.map((inp, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-2 p-2 bg-gray-900 border border-gray-800 rounded"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{inp?.name}</span>
                    <Badge variant="outline" className="text-[10px] bg-gray-800">
                      {inp?.type}
                    </Badge>
                  </div>
                  {inp?.srcNode && <InputImagePreview node={inp.srcNode} />}
                  {idx < 3 && (
                    <div className="space-y-1 pt-2 border-t border-gray-700">
                      <div className="flex justify-between items-center">
                        <Label className="text-[10px] text-gray-500 uppercase">
                          Weight {idx + 1}
                        </Label>
                        <span className="text-[10px] text-fuchsia-400">
                          {weights[idx] ?? 50}%
                        </span>
                      </div>
                      <Slider
                        value={[weights[idx] ?? 50]}
                        onValueChange={(v) => handleWeightChange(idx, v[0])}
                        max={100}
                        step={5}
                        className="py-2"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-800">
          <div className="space-y-2">
            <Label className="text-gray-400 text-xs uppercase">Composite Prompt</Label>
            <Textarea
              className="resize-none h-32 bg-gray-900 border-gray-700 focus:border-fuchsia-500 transition-colors"
              value={prompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              placeholder="Describe how the inputs should be combined..."
            />
          </div>
        </div>
      </div>

      <div className="pt-4 mt-auto border-t border-gray-800">
        <Button
          className="w-full bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white shadow-lg border-0 h-10"
          disabled={inputs.length === 0}
        >
          <Layers className="w-4 h-4 mr-2" /> Generate Output
        </Button>
      </div>
    </div>
  );
}

function InputImagePreview({ node }: { node: CanvasNode }) {
  const assets = useAssetStore((state) => state.assets.get(node.data.entityId));
  const bestAssets = getAllBestAssets(assets);

  const imageData =
    bestAssets?.image_file?.data ||
    bestAssets?.character_image?.data ||
    bestAssets?.location_image?.data ||
    bestAssets?.scene_start_frame?.data ||
    bestAssets?.scene_end_frame?.data;

  if (!imageData) {
    return (
      <div className="w-full h-16 bg-gray-800 rounded flex items-center justify-center">
        <ImageIcon className="w-4 h-4 text-gray-600" />
      </div>
    );
  }

  return (
    <div className="w-full h-24 bg-gray-800 rounded overflow-hidden">
      <img src={imageData} alt="Input preview" className="w-full h-full object-cover" />
    </div>
  );
}
