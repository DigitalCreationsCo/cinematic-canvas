import { Button } from "#/components/ui/button.js";
import { Play, Pause, RotateCcw, Moon, Sun, Square } from "lucide-react";
import StatusBadge from "./StatusBadge.js";
import ConnectionStatus from "./ConnectionStatus.js";
import { useStore } from "#/lib/store.js";
import { useCallback } from "react";
import { useShallow } from 'zustand/shallow';
import { getAssetUrl } from "../../../shared/utils/assets-utils.js";

interface PipelineHeaderProps {
  title: string;
  handleStart: () => void;
  handleStop: () => void;
  handleResume: () => void;
  onPause: () => void;
  handleResetDashboard: () => void;
}

export default function PipelineHeader({ title, handleStart, handleStop, handleResume, onPause, handleResetDashboard }: PipelineHeaderProps) {
  const {
    project,
    projectStatus,
    connectionStatus,
    isDark,
    setIsDark
  } = useStore();

  const isRunning = projectStatus === "generating" || projectStatus === "analyzing" || projectStatus === "evaluating";

  title = title || project?.storyboard?.metadata.title || "Untitled Project";

  const progress = useStore(useShallow((state) => {
    if (!state.project?.scenes) return undefined;
    const scenesWithVideo = state.project.scenes.filter((s) => {
      const registry = state.assets.get(s.id);
      return !!getAssetUrl(registry, 'scene_video');
    });
    return {
      current: scenesWithVideo.length,
      total: state.project.scenes.length,
    };
  }));

  const handleToggleTheme = useCallback(() => setIsDark(!isDark), [ isDark, setIsDark ]);

  return (
    <header className="h-14   bg-background/95  px-4 flex items-center justify-between gap-4 shrink-0" data-testid="pipeline-header">
      <div className="flex items-center gap-4 min-w-0">
        <h1 className=" font-heading font-medium text-base truncate capitalize" data-testid="text-title">{ title }</h1>
        <div className="h-6 w-px bg-/60 hidden sm:block" />
        {/* <div className="flex items-center gap-2">
          <span className=" text-muted-foreground font-mono    ">
            Status
          </span>FRe
          <StatusBadge status={ projectStatus } size="sm" />
        </div> */}
      </div>

      { progress && (
        <div className="flex items-center gap-2">
          <span className="h-6 w-px bg-/60 hidden sm:block" />
          <span className=" text-muted-foreground font-mono    " data-testid="text-progress">
            { progress.current }/{ progress.total } Scenes
          </span>
        </div>
      ) }

      <div className="flex items-center gap-2 shrink-0">

        <div className="flex items-center gap-2">
          { !isRunning ? (
            <Button
              size="sm"
              type="button"
              onClick={ () => {
                if (confirm('Are you sure you want to execute this?')) {
                  handleResume();
                }
              }
              }>
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Resume Project
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
                className=" font-mono   animate-pulse"
              onClick={ () => { confirm('Are you sure you want to stop this? \n(Pending jobs will be cancelled. Current jobs will continue to run)') && handleStop(); } }
            >
              <Square className="w-3.5 h-3.5 mr-1.5" />
                Stop Project
            </Button>
          ) }
        </div>

        <Button 
          size="icon" 
          variant="ghost"
          className=" h-8 w-8 "
          onClick={ handleToggleTheme } 
          data-testid="button-theme"
        >
          { isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" /> }
        </Button>
      </div>
    </header>
  );
}
