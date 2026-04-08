// src/client/src/components/canvas/nodes/SceneNode.tsx
import React, { useMemo } from 'react';
import type { NodeProps } from '@xyflow/react';
import {
  Video, MessageSquareWarning, MapPin, Users, Blend,
  Loader2,
} from 'lucide-react';
import type { CanvasNode } from '#client/domain/canvas/NodeTypes.js';
import { NODE_STATUS_STYLES, HANDLE_IDS } from '#client/domain/canvas/NodeTypes.js';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { useShallow } from 'zustand/react/shallow';
import { resolvePublicUrl } from '../../../../../shared/utils/utils.js';
import { Badge } from '#client/components/ui/badge.js';
import { useDroppable } from '@dnd-kit/core';
import { VideoPlayer } from "#client/components/ui/video-player.js";
import { Skeleton } from '#client/components/ui/skeleton.js';
import { Card, CardContent, CardHeader, CardTitle } from '#client/components/ui/card.js';
import { useSceneNodeAssets } from '#client/hooks/useSceneNodeAssets.js';
import { useNodeStore } from '#client/store/useNodeStore.js';
import { NodeShell, NodeShellHeader, type NodeHandleConfig } from './NodeShell.js';
import type { Character } from '../../../../../shared/types/index.js';
import { Loader } from '#client/components/Loader.js';

const HANDLE_STYLES = {
  frameInput: '!bg-cyan-400 !border-cyan-200',
  entityInput: '!bg-amber-400 !border-amber-200',
  frameOutput: '!bg-indigo-400 !border-indigo-200',
};

function createTargetHandle(
  id: string,
  title: string,
  topPixels: number,
  colorClass: string,
): NodeHandleConfig {
  return {
    id,
    title,
    colorClass,
    style: { top: `${topPixels}px` },
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export function SceneNode({ data, isConnectable, selected }: NodeProps<CanvasNode>) {
  const dropData = useMemo(() => ({ accepts: ['character', 'location', 'audio', 'image'] }), []);

  const { isOver, setNodeRef } = useDroppable({
    id: `scene-drop-${data.entityId}`,
    data: dropData,
  });

  const { scene, location } = useProjectStore(
    useShallow((s) => {
      const scene = s.scenes.get(data.entityId);
      if (!scene) return { scene: null, location: null };
      const location = scene.locationId ? s.locations.get(scene.locationId) ?? null : null;
      return { scene, location };
    }),
  );

  const characterIds = scene?.characterIds ?? [];

  const characters = useProjectStore(
    useShallow((s) => {
      if (!characterIds.length) return [];
      return characterIds
        .map((id) => s.characters.get(id))
        .filter((c): c is Character => c !== undefined);
    }),
  );

  const { sceneAssets, locationAssets } = useSceneNodeAssets(
    data.entityId,
    location?.id ?? null,
    characterIds,
  );

  const targetHandles: NodeHandleConfig[] = [
    createTargetHandle(
      HANDLE_IDS.scene.frameInput,
      'Start frame — connect images or scene end-frames',
      100,
      HANDLE_STYLES.frameInput,
    ),
    createTargetHandle(
      HANDLE_IDS.scene.entityInput,
      'Entities — characters, locations, audio, style refs, images',
      214,
      HANDLE_STYLES.entityInput,
    ),
  ];

  if (!scene) {
    return (
      <div ref={setNodeRef}>
        <NodeShell
          id={data.entityId}
          data={data}
          selected={selected}
          isConnectable={isConnectable}
          className="w-76 h-120 pt-[var(--padding-card-top)]"
          additionalTargetHandles={targetHandles}
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

  const styleClass = NODE_STATUS_STYLES[scene.status] || NODE_STATUS_STYLES.pending;
  const isGenerating = scene.status === 'generating' || scene.status === 'evaluating';
  const hasVideo = !!sceneAssets['scene_video']?.data;
  const hasError = scene.status === 'error';
  const pendingCount = data.pendingChangeCount ?? 0;
  const sceneLabel = `${(scene.sceneIndex + 1).toString().padStart(3, '0')}: ${scene.name}`;

  return (
    <div ref={setNodeRef}>
      <NodeShell
        id={data.entityId}
        data={data}
        selected={selected}
        isConnectable={isConnectable}
        className="w-86 pt-[var(--padding-card-top)]"
        additionalTargetHandles={targetHandles}
        sourceHandle={{
          id: HANDLE_IDS.scene.frameOutput,
          colorClass: HANDLE_STYLES.frameOutput,
          title: 'Output frame — emits end frame for continuity or to other nodes',
          style: { top: '100px' }
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <NodeShellHeader
          label={sceneLabel}
          pendingCount={pendingCount}
          extras={<FrameContinuityIndicator sceneId={data.entityId} />}
        >
          {isGenerating && (
            <div className="flex gap-2 items-center">
              <Loader />
              <span className="text-xs text-muted-foreground font-medium text-center">
                {scene.progressMessage}
              </span>
            </div>
          )}
        </NodeShellHeader>

        {/* ── Frame thumbnails: start + end when available ──────────────────────── */}
        <div className="h-auto bg-border flex w-full">
          <div className="h-full w-1/2 relative overflow-hidden">
            {sceneAssets?.scene_start_frame?.data ? <img
              src={resolvePublicUrl(sceneAssets.scene_start_frame.data)}
              className="w-full h-full object-contain"
              alt="Start frame"
            /> : <div className="w-full h-full text-gray-600 animate-pulse" />}
            <div className="absolute bottom-0 left-0 bg-black/70 px-1 py-0.5 text-[8px] text-white">
              START
            </div>
          </div>
          <div className="h-full w-1/2 relative overflow-hidden">
            {sceneAssets?.scene_end_frame?.data ? <img
              src={resolvePublicUrl(sceneAssets.scene_end_frame.data)}
              className="w-full h-full object-contain"
              alt="End frame"
            /> : <div className="w-full h-full text-gray-600 animate-pulse" />}
            <div className="absolute bottom-0 right-0 bg-black/70 px-1 py-0.5 text-[8px] text-white">
              END
            </div>
          </div>
        </div>

        {/* ── Main video area ──────────────────────────────────────────────── */}
        <div className={`aspect-[16/8] w-full border-b flex flex-col items-center justify-center overflow-hidden relative ${styleClass}`}>
          {hasVideo && (
            <VideoPlayer
              key={`scene_video_${scene.id}`}
              src={resolvePublicUrl(sceneAssets['scene_video']?.data)}
              className="w-full h-full object-cover"
              playOnHover
              controls={false}
            />
          )}
          {!hasVideo && !isGenerating && (
            <div className="flex flex-col items-center gap-2 text-border">
              <Video className="w-12 h-12" />
              <span className="text-xs uppercase font-semibold">No Media</span>
            </div>
          )}
          {!hasVideo && isGenerating && (
            <div className="absolute inset-0 bg-muted/60 backdrop-blur-sm flex flex-col items-center justify-center">
              <Loader />
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
        <div className="p-2 py-4 flex flex-col gap-2">
          {data.status === 'generating' ? (
            <div className="space-y-1.5 mt-1">
              <Skeleton className="h-2 w-full bg-muted/50" />
              <Skeleton className="h-2 w-4/5 bg-muted/50" />
            </div>
          ) : (
            <div className="px-3 text-xs text-muted-foreground font-mono line-clamp-2 leading-snug">
              {sceneAssets['description']?.data}
            </div>
          )}

          <div className="flex flex-col gap-1 mt-1 border-t border-border pt-2 w-full">
            {location && (
              <div className="w-full">
                <CardHeader className="p-3 pb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="font-medium">{location.name}</CardTitle>
                  </div>
                </CardHeader>
              </div>
            )}
            {characters.length > 0 && (
              <div className="w-full">
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
                      {characters.map((char: Character, i: number) => (
                        <Badge key={`char-${char.id}-${i}`} variant="secondary">{char.name}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </div>
            )}
            {isOver && (
              <div className="flex items-center gap-1 bg-primary/20 text-primary px-1.5 py-0.5 rounded-none text-[9px] font-mono border border-primary/30 animate-pulse">
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
      (e) => e.target === sceneId && (e.type === 'scene_sequence' || e.type === 'frame_input'),
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