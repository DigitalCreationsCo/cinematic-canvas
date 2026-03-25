import { Button } from "#/components/ui/button.js";
import { Play, Square } from "lucide-react";
import { useProjectStore } from "../store/useProjectStore.js";
import { usePipelineStore } from "../store/usePipelineStore.js";
import { useAssetStore } from "../store/useAssetStore.js";
import { getAssetUrl } from "../../../shared/utils/assets-utils.js";
import { useMemo } from "react";

interface DashboardToolbarProps {
  title: string;
  handleStart: () => void;
  handleStop: () => void;
  handleResume: () => void;
  onPause: () => void;
  handleResetDashboard: () => void;
}

export default function DashboardToolbar({ title, handleStart, handleStop, handleResume, onPause, handleResetDashboard }: DashboardToolbarProps) {
  const status = usePipelineStore((s) => s.status);
  const metadata = useProjectStore((s) => s.metadata);
  const scenes = useProjectStore((s) => s.scenes);
  const assets = useAssetStore((s) => s.assets);

  const isRunning = status === "generating" || status === "analyzing" || status === "evaluating";

  const displayTitle = title || metadata?.title || "Untitled Project";

  const progress = useMemo(() => {
    const scenesList = Array.from(scenes.values());
    if (!scenesList.length) return undefined;
    const scenesWithVideo = scenesList.filter((s) => {
      const registry = assets.get(s.id);
      return !!getAssetUrl(registry, 'scene_video');
    });
    return {
      current: scenesWithVideo.length,
      total: scenesList.length,
    };
  }, [scenes, assets]);

  return (
    <header className="h-14   bg-background/95  px-4 flex items-center justify-between gap-4 shrink-0" data-testid="pipeline-header">
      <div className="flex items-center gap-4 min-w-0">
        <h1 className=" font-heading font-normal tracking-[.05rem] text-base truncate capitalize" data-testid="text-title">{displayTitle}</h1>
        <div className="h-6 w-px bg-/60 hidden sm:block" />
        {/* <div className="flex items-center gap-2">
          <span className=" text-muted-foreground font-mono    ">
            Status
          </span>FRe
          <StatusBadge status={ status } size="sm" />
        </div> */}
      </div>

      {progress && (
        <div className="flex items-center gap-2">
          <span className="h-6 w-px bg-/60 hidden sm:block" />
          <span className=" text-muted-foreground font-mono    " data-testid="text-progress">
            {progress.current}/{progress.total} Scenes
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 shrink-0">

        <div className="flex items-center gap-2">
          {!isRunning ? (
            <Button
              size="sm"
              type="button"
              onClick={() => {
                if (confirm('Are you sure you want to execute this?')) {
                  if (scenes.size === 0) {
                    handleStart();
                  } else {
                    handleResume();
                  }
                }
              }
              }>
              <Play className="w-3.5 h-3.5 mr-1.5" />
              {scenes.size === 0 ? "Start Pipeline" : "Resume Project"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              className=" font-mono   animate-pulse"
              onClick={() => { confirm('Are you sure you want to stop this? \n(Pending jobs will be cancelled. Current jobs will continue to run)') && handleStop(); }}
            >
              <Square className="w-3.5 h-3.5 mr-1.5" />
              Stop Project
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
