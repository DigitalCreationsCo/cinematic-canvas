import React from 'react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useSceneAssets } from '../../../store/useAssetStore.js';
import { RbacBanner } from './RbacBanner.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.js';
import { Label } from '../../ui/label.js';
import { Textarea } from '../../ui/textarea.js';
import { Badge } from '../../ui/badge.js';

export function SceneInspector({ node }: { node: CanvasNode; }) {
  const scene = useProjectStore((state) => state.scenes.get(node.data.entityId));
  const updateScene = useProjectStore((state) => state.updateScene);
  const { assets } = useSceneAssets(node.data.entityId);
  const isLocked = node.data.isLocked;

  if (!scene) return <div className="p-4 text-gray-500">Scene not found</div>;

  return (
    <div className="p-4 flex flex-col h-full bg-gray-950 text-gray-200">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-blue-400 font-bold uppercase tracking-wider">Scene { scene.sceneIndex + 1 }</span>
          <Badge variant="outline" className="text-xs border-gray-700 bg-gray-900">{ scene.status }</Badge>
        </div>
      </div>

      <RbacBanner isLocked={ isLocked } entityType="scene" />

      <Tabs defaultValue="prompt" className="flex-1 overflow-auto">
        <TabsList className="w-full grid border-b border-gray-800 bg-transparent rounded-none h-10 p-0">
          <TabsTrigger value="prompt" className="flex-1 data-[state=active]:bg-gray-800 data-[state=active]:text-white rounded-none border-t border-x border-transparent data-[state=active]:border-gray-700">Prompt</TabsTrigger>
          <TabsTrigger value="camera" className="flex-1 data-[state=active]:bg-gray-800 data-[state=active]:text-white rounded-none border-t border-x border-transparent data-[state=active]:border-gray-700">Camera</TabsTrigger>
          <TabsTrigger value="gen" className="flex-1 data-[state=active]:bg-gray-800 data-[state=active]:text-white rounded-none border-t border-x border-transparent data-[state=active]:border-gray-700">Gen Status</TabsTrigger>
        </TabsList>

        <TabsContent value="prompt" className="p-2 pt-4 flex flex-col gap-4">
          <div className="space-y-2">
            <Label className="text-gray-400 text-xs uppercase cursor-pointer">Description</Label>
            <Textarea
              className="resize-none h-32 bg-gray-900 border-gray-700 disabled:opacity-60"
              value={ scene.description || '' }
              onChange={ (e) => updateScene(scene.id, { description: e.target.value }) }
              disabled={ isLocked }
              placeholder="Descriptive narrative of the scene..."
            />
          </div>
          <div className="space-y-2">
            <Label className="text-blue-400 text-xs uppercase cursor-pointer flex justify-between">
              <span>Optimized Prompt</span>
              <span className="text-gray-600">(Read-only sync)</span>
            </Label>
            <Textarea
              className="resize-none h-48 bg-gray-950 border-gray-800 opacity-80"
              value={ assets?.scene_prompt?.versions?.[ 0 ]?.data || '' }
              readOnly
            />
          </div>
        </TabsContent>

        <TabsContent value="camera" className="p-2 pt-4">
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs">Shot Type</Label>
              <div className="text-sm bg-gray-900 p-2 rounded border border-gray-800">{ scene.shotType || 'Auto' }</div>
            </div>
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs">Camera Movement</Label>
              <div className="text-sm bg-gray-900 p-2 rounded border border-gray-800">{ scene.cameraMovement || 'Auto' }</div>
            </div>
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs">Lighting</Label>
              <div className="text-sm bg-gray-900 p-2 rounded border border-gray-800">{ scene.lighting?.quality?.hardness || 'Auto' }</div>
            </div>
            <p className="text-xs text-gray-500 mt-4 italic">Camera settings are determined by the semantic analysis pass during pipeline execution.</p>
          </div>
        </TabsContent>

        <TabsContent value="gen" className="p-2 pt-4">
          <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg text-center text-sm text-gray-400">
            Generative process log would appear here...
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
