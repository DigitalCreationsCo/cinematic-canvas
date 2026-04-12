import { Card, CardContent, CardHeader } from "#client/components/ui/card.js";
import { Button } from "#client/components/ui/button.js";
import { Badge } from "#client/components/ui/badge.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "#client/components/ui/tooltip.js";
import { Play, Camera, Sun, Music, Clock, RefreshCw } from "lucide-react";
import { cn } from "#client/lib/utils.js";
import type { Scene, StatusType } from "../../../shared/types/index.js";
import StatusBadge from "./StatusBadge.js";
import { Skeleton } from "#client/components/ui/skeleton.js";
import { memo } from "react";
import { useSceneAssets } from "#client/store/useAssetStore.js";
import { resolvePublicUrl } from "../../../shared/utils/utils.js";

interface SceneCardProps {
  scene: Scene;
  isSelected?: boolean;
  isLoading?: boolean;
  status: StatusType;
  onSelect?: (idx: number) => void;
  onPlay?: (idx: number) => void;
  priority?: boolean;
  className?: string;
}

const SceneCard = memo(function SceneCard({ scene, isSelected, isLoading, status, onSelect, onPlay, priority = false, className }: SceneCardProps) {
  const { bestAssets: assets } = useSceneAssets(scene.id);
  const videoUrl = resolvePublicUrl(assets['scene_video']?.data);
  const startFrame = resolvePublicUrl(assets['scene_start_frame']?.data);
  const endFrame = resolvePublicUrl(assets['scene_end_frame']?.data);

  const hasVideo = !!videoUrl;
  const hasStartFrame = !!startFrame;
  status = status || (hasVideo ? "complete" : "pending");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card
          className={cn(
            "cursor-pointer transition-all hover-elevate",
            isSelected && " ",
            isLoading && "animate-pulse",
            className
          )}
          onClick={() => onSelect?.(scene.sceneIndex)}
          onMouseEnter={() => {
            if (endFrame) {
              const img = new Image();
              img.src = endFrame;
            }
          }}
          data-testid={`card-scene-${scene.id}`}
        >
          <CardHeader className="p-2 flex flex-row items-center justify-between gap-2 space-y-0  ">
            <div className="flex items-center gap-2 min-w-0">
              <Badge className="shrink-0 font-mono  h-5 px-1.5  bg-background/10">
                {isLoading ? <Skeleton className="h-3 w-8" /> : `#${(scene.sceneIndex + 1).toString().padStart(2, '0')}`}
              </Badge>
              {isLoading ? <Skeleton className="h-4 w-24" /> : <span className=" font-semibold capitalize   truncate text-foreground/90">{scene.shotType}</span>}
            </div>
            {isLoading ? <Skeleton className="h-4 w-12" /> : <StatusBadge status={status} size="sm" />}
          </CardHeader>

          <CardContent className="p-0">
            <div
              className="relative aspect-video bg-muted overflow-hidden  "
              data-testid={`scene-thumbnail-${scene.id}`}
            >
              {isLoading || !hasStartFrame ? (
                <Skeleton className="w-full h-full " />
              ) : (
                <img
                  src={startFrame}
                  alt={`Scene ${scene.id} start frame`}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading={priority ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={priority ? "high" : "auto"}
                />
              )}

              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-2">
                {hasVideo && !isLoading && (
                  <Button
                    size="icon"
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10   bg-black/50 hover:bg-primary hover:text-primary-foreground hover: transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlay?.(scene.sceneIndex);
                    }}
                    data-testid={`button-play-scene-${scene.id}`}
                  >
                    <Play className="w-5 h-5" />
                  </Button>
                )}
              </div>

              {status === 'generating' && scene.progressMessage && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/10 z-10">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{scene.progressMessage}</span>
                  </div>
                </div>
              )}

              <div className="absolute top-2 right-2">
                {isLoading ? <Skeleton className="h-4 w-10" /> : (
                  <Badge variant="secondary" className=" font-mono h-4 px-1  bg-black/60 text-white  ">
                    {scene.duration}s
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-2 p-2  font-mono text-muted-foreground bg-muted/20">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <Camera className="w-3 h-3 shrink-0 text-foreground/50" />
                {isLoading ? <Skeleton className="h-3 w-20" /> : <span className="truncate capitalize">{scene.cameraMovement}</span>}
              </div>
              <div className="flex items-center gap-1.5 overflow-hidden">
                <Sun className="w-3 h-3 shrink-0 text-foreground/50" />
                {isLoading ? <Skeleton className="h-3 w-20" /> : <span className="truncate capitalize">{scene.lighting.quality.hardness}</span>}
              </div>
              <div className="flex items-center gap-1.5 overflow-hidden">
                <Music className="w-3 h-3 shrink-0 text-foreground/50" />
                {isLoading ? <Skeleton className="h-3 w-20" /> : <span className="truncate capitalize">{scene.audioSync}</span>}
              </div>
              <div className="flex items-center gap-1.5 overflow-hidden">
                <Clock className="w-3 h-3 shrink-0 text-foreground/50" />
                {isLoading ? <Skeleton className="h-3 w-12" /> : <span>{scene.startTime.toFixed(1)}s</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      </TooltipTrigger>
      <TooltipContent className="font-mono ">
        View Scene Details
      </TooltipContent>
    </Tooltip>
  );
});

export default SceneCard;
