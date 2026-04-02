import React from 'react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useCharacterAssets } from '../../../store/useAssetStore.js';
import { RbacBanner } from './RbacBanner.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.js';
import { Label } from '../../ui/label.js';
import { Textarea } from '../../ui/textarea.js';
import { Input } from '../../ui/input.js';
import CharacterDetailPanel from '#client/components/CharacterDetailPanel.js';
import { useCanvasUIStore } from '#client/store/useCanvasUIStore.js';

export function CharacterInspector({ node }: { node: CanvasNode; }) {
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const character = useProjectStore((state) => state.characters.get(node.data.entityId));
  const updateCharacter = useProjectStore((state) => state.updateCharacter);
  const { assets } = useCharacterAssets(node.data.entityId);
  const isLocked = node.data.isLocked;
  const isLoading = useCanvasUIStore(s => s.isLoading) && !selectedProjectId;

  if (!selectedProjectId) return <div className="p-4 text-gray-500">No project selected</div>;
  if (!character) return <div className="p-4 text-gray-500">Character not found</div>;

  return (
    <div className="flex flex-col h-full">
      <RbacBanner isLocked={isLocked} entityType="character" />
      <CharacterDetailPanel
        character={character}
        projectId={selectedProjectId}
        isLoading={isLoading}
      />
    </div>
  );
}
