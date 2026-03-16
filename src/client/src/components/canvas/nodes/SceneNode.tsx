import React, { useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Clapperboard, Video, Image as ImageIcon, MessageSquareWarning, Settings2, AlertTriangle, MapPin, Users } from 'lucide-react';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import { NODE_STATUS_STYLES } from '../../../domain/canvas/NodeTypes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { resolvePublicUrl } from '../../../../../shared/utils/utils.js';
import { Badge } from '#/components/ui/badge.js';
import { useDroppable } from '@dnd-kit/core';
import { VideoPlayer } from '#/components/ui/video-player.js';
import { useShallow } from 'zustand/react/shallow';
import { Skeleton } from '#/components/ui/skeleton.js';
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.js';
import { useSceneNodeAssets } from '#/hooks/use-scene-node-assets.js';
import type { ProjectStoreState } from '../../../store/useProjectStore.js';
import type { Character } from '../../../../../shared/types/index.js';

const EMPTY_IDS: readonly string[] = [];
const EMPTY_CHARS: Character[] = [];

export const createSceneNodeSelector = (entityId: string) => {
  let prevIds: readonly string[] = EMPTY_IDS;
  let prevCharRefs: ReadonlyArray<Character | undefined> = [];
  let stableChars: Character[] = EMPTY_CHARS;

  return (state: ProjectStoreState) => {
    const scene = state.scenes.get(entityId)!;

    const location = state.locations.get(scene.locationId);

    // ✅ Never allocates new []. Uses module-level EMPTY_IDS when empty/undefined.
    const ids: readonly string[] =
      scene.characterIds && scene.characterIds.length > 0
        ? scene.characterIds
        : EMPTY_IDS;

    let dirty = ids !== prevIds;
    if (!dirty) {
      for (let i = 0; i < ids.length; i++) {
        if (state.characters.get(ids[i]) !== prevCharRefs[i]) { dirty = true; break; }
      }
    }

    if (dirty) {
      prevIds = ids;
      prevCharRefs = ids.map(id => state.characters.get(id));
      const resolved = prevCharRefs.filter((c): c is Character => c !== undefined);
      // ✅ Never allocates new [] for empty case
      stableChars = resolved.length > 0 ? resolved : EMPTY_CHARS;
    }

    return { scene, location, characters: stableChars };
  };
};

export function SceneNode({ data, isConnectable, selected }: NodeProps<CanvasNode>) {
  const { isOver, setNodeRef } = useDroppable({
    id: `scene-drop-${data.entityId}`,
    data: { accepts: ['character', 'location', 'audio', 'image'] }
  });

  const selector = useMemo(
    () => createSceneNodeSelector(data.entityId),
    [data.entityId]
  );
  const selectNode = useCanvasUIStore((s) => s.selectNode);
  const result = useProjectStore(useShallow(selector));

  const { scene, location, characters } = result;

  const characterIds = useMemo(
    () => characters?.map(c => c.id) ?? [],
    [characters]
  );

  const { sceneAssets, locationAssets, characterAssets } = useSceneNodeAssets(
    data.entityId,
    location?.id ?? null,
    characterIds,
  );

  if (!result || !scene) return null;

  const styleClass = NODE_STATUS_STYLES[scene.status] || NODE_STATUS_STYLES.pending;
  const isSelectedForPipeline = data.pipelineSelected;
  const isGenerating = scene.status === 'generating' || scene.status === 'evaluating';
  const hasVideo = !!sceneAssets['scene_video']?.data;
  const hasError = scene.status === 'error';

  return (
    <div
      className={`
        card-cinematic-glass pt-[var(--padding-card-top)] w-80 flex flex-col overflow-hidden
        transition-all duration-200 
        ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background node-selected' : 'node'}
        ${isSelectedForPipeline ? 'node-selected' : ''}
      `}
      onClick={() => selectNode(data.entityId)}
      onDoubleClick={() => /* Trigger pipeline for just this scene */ undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-3 h-6 rounded-sm bg-muted border-border -ml-1.5"
      />
      <Handle type="source" position={Position.Right} id="sequence" className="w-3 h-3 bg-blue-500 border-2 border-gray-900" />

      {/* Header */}
      <div className="p-2 border-b-2 border-border flex justify-between items-center">
        <div className="flex items-center gap-2 px-1 overflow-hidden">
          <div className="text-sm font-sans truncate" title={scene.name}>
            {`${(scene.sceneIndex + 1).toString().padStart(2, '0')}: ${scene.name}`}
          </div>
        </div>
      </div>

      <div className="p-0 relative">
        {/* Thumbnail Row (End Frame if it exists) */}
        {!isGenerating && !hasError && sceneAssets?.scene_end_frame?.data && (
          <div className="h-12 bg-border flex gap-1 p-1 overflow-x-auto">
            <div className="h-full aspect-video rounded overflow-hidden relative border border-gray-700 shrink-0">
              <img
                src={resolvePublicUrl(sceneAssets.scene_end_frame.data)}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 right-0 bg-black/70 px-1 py-0.5 text-[8px] text-white">END</div>
            </div>
          </div>
        )}
      </div>



      {/* Reference Images Area - Start and End frames */}
      {/* <div className="flex bg-black/50 border-b border-border divide-x divide-border h-16">
        <div className="flex-1 relative flex items-center justify-center group overflow-hidden">
          <span className="absolute top-0.5 left-1 text-[8px] font-mono bg-black/60 px-1 rounded z-10 text-white/70">START REF</span>
          {data.status === 'complete' || (data.status === 'generating') ? (
            <img src={thumb || scene1} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
          ) : (
            <div className="flex flex-col items-center opacity-30 text-white">
              <ImageIcon size={12} />
            </div>
          )}
        </div>
        <div className="flex-1 relative flex items-center justify-center group overflow-hidden">
          <span className="absolute top-0.5 right-1 text-[8px] font-mono bg-black/60 px-1 rounded z-10 text-white/70">END REF</span>
          {data.status === 'complete' || (data.status === 'generating') ? (
            <img src={thumb || scene2} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
          ) : (
            <div className="flex flex-col items-center opacity-30 text-white">
              <ImageIcon size={12} />
            </div>
          )}
        </div>
      </div> */}

      {/* Main Video Thumbnail Area */}
      <div className={`aspect-[16/8] w-full border-b-2 flex flex-col items-center justify-center overflow-hidden relative ${styleClass}`}>

        {hasVideo && (
          <VideoPlayer
            key={`scene_video_${scene.id}`}
            src={resolvePublicUrl(sceneAssets['scene_video']?.data)}
            className={`w-full h-full object-cover`}
            controls={true}
          />
        )}
        {!hasVideo && !isGenerating && (
          <div className="flex flex-col items-center gap-2 text-gray-700">
            <Video className="w-12 h-12" />
            <span className="text-xs uppercase font-semibold">No Media</span>
          </div>
        )}

        {/* Overlays */}
        {isGenerating && (
          <div className="absolute inset-0 bg-muuted/60 backdrop-blur-sm flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-t-2 border-r-2 border-primary rounded-full animate-spin mb-2" />
            <span className="text-xs text-muted-foreground font-medium px-4 text-center">
              {scene.progressMessage || 'Generating...'}
            </span>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 bg-red-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-center p-4">
            <MessageSquareWarning className="w-8 h-8 text-red-200 mb-2" />
            <span className="text-xs text-red-100 font-medium line-clamp-2">
              {scene.progressMessage || 'Generation failed'}
            </span>
          </div>
        )}
      </div>

      {/* Details Area */}
      <div className="p-2 flex flex-col gap-2">
        {data.status === 'generating' ? (
          <div className="space-y-1.5 mt-1">
            <Skeleton className="h-2 w-full bg-muted/50" />
            <Skeleton className="h-2 w-4/5 bg-muted/50" />
          </div>
        ) : (
          <div className="text-xs text-muted-foreground line-clamp-2 leading-snug">
            {sceneAssets['scene_description']?.data}
          </div>
        )}

        {/* { data.errorMessage && (
          <div className="text-[10px] text-destructive bg-destructive/10 p-1.5 rounded border border-destructive/20 flex items-start gap-1.5">
            <AlertTriangle size={ 12 } className="shrink-0 mt-0.5" />
            <span className="leading-tight">{ data.errorMessage }</span>
          </div>
        ) } */}

        {/* Connected Assets indicators */}
        <div className="flex items-center justify-between mt-1 border-t border-border pt-2 gap-1 flex-wrap w-full">
          {location && (
            <Card className="w-full">
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className=" font-medium">{location.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {data.status === 'generating' ? <Skeleton className="h-4 w-full" /> : <p className=" text-muted-foreground">{locationAssets['location_description']?.data}</p>}
              </CardContent>
            </Card>
          )}
          {characters.length > 0 && (
            <Card className="w-full">
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className=" font-medium">Characters</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {data.status === 'generating' ? (
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-16 " />)}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {characters.map((char) => (
                      <Badge key={char.id} variant="secondary">{char.name}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {isOver && (
            <div className="flex items-center gap-1 bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[9px] font-mono border border-primary/30 animate-pulse">
              DROP TO ASSIGN
            </div>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="w-3 h-6 rounded-sm bg-muted border-border -mr-1.5"
      />
    </div>
  );
}
