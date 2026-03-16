// src/client/src/components/canvas/nodes/SceneNode.tsx
import React, { useMemo } from 'react';
import type { NodeProps } from '@xyflow/react';
import {
  Video, MessageSquareWarning, MapPin, Users, Blend,
} from 'lucide-react';
import type { CanvasNode } from '#/domain/canvas/NodeTypes.js';
import { NODE_STATUS_STYLES, HANDLE_IDS } from '#/domain/canvas/NodeTypes.js';
import { useProjectStore } from '#/store/useProjectStore.js';
import { resolvePublicUrl } from '../../../../../shared/utils/utils.js';
import { Badge } from '#/components/ui/badge.js';
import { useDroppable } from '@dnd-kit/core';
import { VideoPlayer } from '#/components/ui/video-player.js';
import { useShallow } from 'zustand/react/shallow';
import { Skeleton } from '#/components/ui/skeleton.js';
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.js';
import { useSceneNodeAssets } from '#/hooks/useSceneNodeAssets.js';
import { useNodeStore } from '#/store/useNodeStore.js';
import { NodeShell, NodeShellHeader } from './NodeShell.js';
import { createSceneNodeSelector } from '#/store/selectors/sceneNodeSelector.js';
import type { Character } from '../../../../../shared/types/index.js';

// ============================================================================
// COMPONENT
// ============================================================================

export function SceneNode({ data, isConnectable, selected }: NodeProps<CanvasNode>) {
  const { isOver, setNodeRef } = useDroppable({
    id: `scene-drop-${data.entityId}`,
    data: { accepts: ['character', 'location', 'audio', 'image'] },
  });

  const selector = useMemo(
    () => createSceneNodeSelector(data.entityId),
    [data.entityId],
  );

  const result = useProjectStore(useShallow(selector));

  const characterIds = useMemo(
    () => result?.characters?.map((c: Character) => c.id) ?? [],
    [result?.characters],
  );

  const { sceneAssets, locationAssets } = useSceneNodeAssets(
    data.entityId,
    result?.location?.id ?? null,
    characterIds,
  );

  if (!result || !result.scene) {
    return (
      <div ref={setNodeRef}>
        <NodeShell
          data={data}
          selected={selected}
          isConnectable={isConnectable}
          className="w-80 pt-[var(--padding-card-top)]"
          targetHandle={{
            id: HANDLE_IDS.scene.target,
            colorClass: '!bg-violet-500 !border-gray-900',
            title: 'Accepts characters, locations, images, audio, and scene continuity',
          }}
        >
          <NodeShellHeader
            icon={<Video className="w-4 h-4" />}
            label="Loading..."
            pendingCount={data.pendingChangeCount ?? 0}
          />
          <div className="p-0 relative">
            <div className="aspect-video w-full border-b-2 flex items-center justify-center overflow-hidden border-gray-600 bg-gray-900/50">
              <Video className="w-12 h-12 text-gray-600 animate-pulse" />
            </div>
          </div>
        </NodeShell>
      </div>
    );
  }

  const { scene, location, characters } = result;
  const styleClass = NODE_STATUS_STYLES[scene.status] || NODE_STATUS_STYLES.pending;
  const isGenerating = scene.status === 'generating' || scene.status === 'evaluating';
  const hasVideo = !!sceneAssets['scene_video']?.data;
  const hasError = scene.status === 'error';
  const pendingCount = data.pendingChangeCount ?? 0;
  const sceneLabel = `${(scene.sceneIndex + 1).toString().padStart(2, '0')}: ${scene.name}`;

  return (
    <div ref={setNodeRef}>
      <NodeShell
        data={data}
        selected={selected}
        isConnectable={isConnectable}
        className="w-80 pt-[var(--padding-card-top)]"
        // Single pill target: accepts chars, locs, images, audio, AND scene continuity.
        targetHandle={{
          id: HANDLE_IDS.scene.target,
          colorClass: '!bg-muted !border-border hover:!bg-primary/30',
          pill: true,
          title: 'Connect characters, locations, images, audio, or a preceding scene',
        }}
        // Single circle source: emits end-frame for scene continuity.
        sourceHandle={{
          id: HANDLE_IDS.scene.source,
          colorClass: '!bg-indigo-400 !border-indigo-200',
          title: 'End frame — connect to the next scene\'s input for visual continuity',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <NodeShellHeader
          label={sceneLabel}
          pendingCount={pendingCount}
          extras={<FrameContinuityIndicator sceneId={data.entityId} />}
        />

        {/* ── Frame thumbnails: start + end when available ──────────────────────── */}
        {!isGenerating && !hasError && (sceneAssets?.scene_start_frame?.data || sceneAssets?.scene_end_frame?.data) && (
          <div className="h-16 bg-border flex w-full">
            {sceneAssets?.scene_start_frame?.data && (
              <div className="h-full w-1/2 relative overflow-hidden">
                <img
                  src={resolvePublicUrl(sceneAssets.scene_start_frame.data)}
                  className="w-full h-full object-cover"
                  alt="Start frame"
                />
                <div className="absolute bottom-0 left-0 bg-black/70 px-1 py-0.5 text-[8px] text-white">
                  START
                </div>
              </div>
            )}
            {sceneAssets?.scene_end_frame?.data && (
              <div className="h-full w-1/2 relative overflow-hidden">
                <img
                  src={resolvePublicUrl(sceneAssets.scene_end_frame.data)}
                  className="w-full h-full object-cover"
                  alt="End frame"
                />
                <div className="absolute bottom-0 right-0 bg-black/70 px-1 py-0.5 text-[8px] text-white">
                  END
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Main video area ──────────────────────────────────────────────── */}
        <div className={`aspect-[16/8] w-full border-b-2 flex flex-col items-center justify-center overflow-hidden relative ${styleClass}`}>
          {hasVideo && (
            <VideoPlayer
              key={`scene_video_${scene.id}`}
              src={resolvePublicUrl(sceneAssets['scene_video']?.data)}
              className="w-full h-full object-cover"
              controls
            />
          )}
          {!hasVideo && !isGenerating && (
            <div className="flex flex-col items-center gap-2 text-gray-700">
              <Video className="w-12 h-12" />
              <span className="text-xs uppercase font-semibold">No Media</span>
            </div>
          )}
          {isGenerating && (
            <div className="absolute inset-0 bg-muted/60 backdrop-blur-sm flex flex-col items-center justify-center">
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

        {/* ── Details ──────────────────────────────────────────────────────── */}
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

          <div className="flex flex-col gap-1 mt-1 border-t border-border pt-2 w-full">
            {location && (
              <Card className="w-full">
                <CardHeader className="p-3 pb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="font-medium">{location.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  {data.status === 'generating' ? (
                    <Skeleton className="h-4 w-full" />
                  ) : (
                    <p className="text-muted-foreground">
                      {locationAssets?.['location_description']?.data}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
            {characters.length > 0 && (
              <Card className="w-full">
                <CardHeader className="p-3 pb-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="font-medium">Characters</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  {data.status === 'generating' ? (
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-16" />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {characters.map((char: Character) => (
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
      </NodeShell>
    </div>
  );
}

// ── Frame Continuity Indicator ────────────────────────────────────────────────
// Lights up when this scene has an incoming scene_sequence edge.

function FrameContinuityIndicator({ sceneId }: { sceneId: string }) {
  const hasIncoming = useNodeStore((s) =>
    s.edges.some(
      (e) => e.target === sceneId && e.type === 'scene_sequence',
    ),
  );
  if (!hasIncoming) return null;
  return (
    <span
      title="Frame continuity — start frame inherited from preceding scene"
      className="inline-flex items-center gap-1 text-[10px] text-indigo-400 font-mono"
    >
      <Blend className="w-3 h-3" />
      <span className="hidden sm:inline">CONT</span>
    </span>
  );
}