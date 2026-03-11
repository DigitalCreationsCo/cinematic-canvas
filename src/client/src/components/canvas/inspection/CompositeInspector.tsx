import React, { useState } from 'react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { useNodeStore } from '../../../store/useNodeStore.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { Label } from '../../ui/label.js';
import { Textarea } from '../../ui/textarea.js';
import { Input } from '../../ui/input.js';
import { Button } from '../../ui/button.js';
import { Slider } from '../../ui/slider.js';
import { Layers } from 'lucide-react';

export function CompositeInspector({ node }: { node: CanvasNode; }) {
  // Composite nodes don't have a backing entity in EntityStore until the output completes
  // Their state is largely derived from edges + local node data
  const edges = useNodeStore(state => state.edges);
  const nodes = useNodeStore(state => state.nodes);
  const { characters, locations, scenes } = useProjectStore();

  // Find all nodes connected to our input handles ('in1', 'in2', 'in3')
  const incomingEdges = edges.filter(e => e.target === node.id);
  const getEntityForNode = (nId: string) => {
    return characters.get(nId) || locations.get(nId) || scenes.get(nId);
  };

  const inputs = incomingEdges.map(e => {
    const srcNode = nodes.find(n => n.id === e.source);
    if (!srcNode) return null;
    const entity = getEntityForNode(srcNode.data.entityId);
    return {
      handleId: e.targetHandle,
      name: entity?.name || (entity && 'sceneIndex' in entity ? `Scene ${(entity as any).sceneIndex + 1}` : 'Unknown Input'),
      type: srcNode.type
    };
  }).filter(Boolean);

  const [ prompt, setPrompt ] = useState(node.data.compositePrompt as string || '');
  const [ weight, setWeight ] = useState([ 50 ]);

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
          <Label className="text-gray-400 text-xs uppercase font-semibold">Connected Inputs</Label>
          { inputs.length === 0 ? (
            <div className="p-3 bg-gray-900 border border-gray-800 border-dashed rounded text-sm text-gray-500 text-center">
              Connect Character, Location, or Scene nodes to the input handles on the canvas.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              { inputs.map((inp, idx) => (
                <div key={ idx } className="flex items-center justify-between p-2 bg-gray-900 border border-gray-800 rounded">
                  <span className="text-sm">{ inp?.name }</span>
                  <Badge variant="outline" className="text-[10px] bg-gray-800">{ inp?.type }</Badge>
                </div>
              )) }
            </div>
          ) }
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-800">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <Label className="text-gray-400 text-xs uppercase">Blend Weight</Label>
              <span className="text-[10px] text-fuchsia-400">{ weight[ 0 ] }% Input / { 100 - weight[ 0 ] }% Prompt</span>
            </div>
            <Slider
              value={ weight }
              onValueChange={ setWeight }
              max={ 100 }
              step={ 1 }
              className="py-4"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-400 text-xs uppercase">Composite Prompt</Label>
            <Textarea
              className="resize-none h-32 bg-gray-900 border-gray-700 focus:border-fuchsia-500 transition-colors"
              value={ prompt }
              onChange={ (e) => setPrompt(e.target.value) }
              placeholder="Describe how the inputs should be combined..."
            />
          </div>
        </div>
      </div>

      <div className="pt-4 mt-auto border-t border-gray-800">
        <Button
          className="w-full bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white shadow-lg border-0 h-10"
        >
          <Layers className="w-4 h-4 mr-2" /> Generate Output
        </Button>
      </div>
    </div>
  );
}

// Ensure Badge is imported if used above
import { Badge } from '../../ui/badge.js';
