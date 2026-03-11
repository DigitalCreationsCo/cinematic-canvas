import React from 'react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useCharacterAssets } from '../../../store/useAssetStore.js';
import { RbacBanner } from './RbacBanner.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.js';
import { Label } from '../../ui/label.js';
import { Textarea } from '../../ui/textarea.js';
import { Input } from '../../ui/input.js';

export function CharacterInspector({ node }: { node: CanvasNode; }) {
  const character = useProjectStore((state) => state.characters.get(node.data.entityId));
  const updateCharacter = useProjectStore((state) => state.updateCharacter);
  const { assets } = useCharacterAssets(node.data.entityId);
  const isLocked = node.data.isLocked;

  if (!character) return <div className="p-4 text-gray-500">Character not found</div>;

  return (
    <div className="p-4 flex flex-col h-full bg-gray-950 text-gray-200">
      <div className="mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          { character.name || 'Unnamed Character' }
        </h2>
        { node.data.scope === 'world' && <span className="text-xs text-indigo-400 uppercase font-semibold mt-1">World Library Entity</span> }
      </div>

      <RbacBanner isLocked={ isLocked } entityType="character" />

      <Tabs defaultValue="traits" className="flex-1 overflow-auto">
        <TabsList className="w-full grid border-b border-gray-800 bg-transparent rounded-none h-10 p-0">
          <TabsTrigger value="traits" className="flex-1 data-[state=active]:bg-gray-800 data-[state=active]:text-white rounded-none border-t border-x border-transparent data-[state=active]:border-gray-700">Traits & Details</TabsTrigger>
          <TabsTrigger value="gen" className="flex-1 data-[state=active]:bg-gray-800 data-[state=active]:text-white rounded-none border-t border-x border-transparent data-[state=active]:border-gray-700">Gen Models</TabsTrigger>
        </TabsList>

        <TabsContent value="traits" className="p-2 pt-4 flex flex-col gap-4">
          <div className="space-y-2">
            <Label className="text-gray-400 text-xs uppercase">Name</Label>
            <Input
              className="bg-gray-900 border-gray-700 disabled:opacity-60"
              value={ character.name }
              onChange={ (e) => updateCharacter(character.id, { name: e.target.value }) }
              disabled={ isLocked }
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-400 text-xs uppercase">Description</Label>
            <Textarea
              className="resize-none h-32 bg-gray-900 border-gray-700 disabled:opacity-60"
              value={ assets?.character_description?.versions?.[ 0 ]?.data || '' }
              onChange={ (e) => { } /* Update would go through an asset patch now */ }
              disabled={ true /* Until we implement asset updating */ }
              placeholder="Physical description, clothing, mannerisms..."
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-gray-800">
            <h4 className="text-xs font-semibold uppercase text-gray-500 mb-2">Physical Traits</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-gray-400 text-[10px] uppercase">Age</Label>
                <Input disabled={ isLocked } placeholder="e.g. 35" className="h-8 bg-gray-900 border-gray-800 text-sm" value={ character.physicalTraits?.age || '' } />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-[10px] uppercase">Gender</Label>
                <Input disabled={ isLocked } placeholder="e.g. Female" className="h-8 bg-gray-900 border-gray-800 text-sm" value={ character.physicalTraits?.gender || '' } />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-[10px] uppercase">Build</Label>
                <Input disabled={ isLocked } placeholder="e.g. Athletic" className="h-8 bg-gray-900 border-gray-800 text-sm" value={ character.physicalTraits?.build || '' } />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-[10px] uppercase">Hair</Label>
                <Input disabled={ isLocked } placeholder="e.g. Short dark" className="h-8 bg-gray-900 border-gray-800 text-sm" value={ character.physicalTraits?.hair || '' } />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="gen" className="p-2 pt-4">
          <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg text-center text-sm text-gray-400">
            Generation model overrides and LoRA settings would appear here.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
