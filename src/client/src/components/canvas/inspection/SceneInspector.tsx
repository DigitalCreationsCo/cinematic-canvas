import React, { useMemo } from 'react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useSceneAssets } from '../../../store/useAssetStore.js';
import { RbacBanner } from './RbacBanner.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.js';
import { Label } from '../../ui/label.js';
import { Textarea } from '../../ui/textarea.js';
import { Badge } from '../../ui/badge.js';
import SceneDetailPanel from '#client/components/SceneDetailPanel.js';
import { useShallow } from 'zustand/react/shallow';
import { useCanvasUIStore } from '#client/store/useCanvasUIStore.js';

export function SceneInspector({ node }: { node: CanvasNode; }) {
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);

  const scene = useProjectStore((state) => state.scenes.get(node.data.entityId));
  const location = useProjectStore((state) => state.locations.get(scene?.locationId || ''));
  const allCharacters = useProjectStore(useShallow((s) => Array.from(s.characters.values())));
  const isLoading = useCanvasUIStore(s => s.isLoading) && !selectedProjectId;

  const sceneCharacters = useMemo(
    () => (scene ? allCharacters.filter((c) => scene.characterIds.includes(c.id)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene?.id, allCharacters]
  );

  const updateScene = useProjectStore((state) => state.updateScene);
  const { assets } = useSceneAssets(node.data.entityId);

  if (!selectedProjectId) return <div className="p-4 text-muted-foreground">No project selected</div>;
  if (!scene) return <div className="p-4 text-muted-foreground">Scene not found</div>;

  const isLocked = node.data.isLocked;
  const isGenerating = scene.status === 'generating' || scene.status === 'evaluating';

  return (
    <div className="flex flex-col h-full">
      <RbacBanner isLocked={isLocked} entityType="scene" />
      <SceneDetailPanel
        scene={scene}
        status={scene.status}
        characters={sceneCharacters}
        location={location}
        isGenerating={isGenerating}
        isLoading={isLoading}
        projectId={selectedProjectId}
      />
    </div>
  );
}
