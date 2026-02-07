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
    <header className="h-14 border-b bg-background px-4 flex items-center justify-between gap-4 shrink-0" data-testid="pipeline-header">
      <div className="flex items-center gap-4 min-w-0">
        <h1 className="text-lg font-semibold truncate" data-testid="text-title">{ title }</h1>
        <div>
          <span className="text-sm text-muted-foreground font-mono pr-2">
            Pipeline Status:
          </span>
          <StatusBadge status={ projectStatus } />
        </div>
        { progress && (
          <span className="text-sm text-muted-foreground font-mono" data-testid="text-progress">
            { progress.current }/{ progress.total } scenes
          </span>
        ) }
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <ConnectionStatus connected={ connectionStatus === 'connected' } />

        <div className="flex items-center gap-1">
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
              <Play className="w-4 h-4 mr-1" />
              { 'Resume Project' }
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              className={ "animate-pulse duration-2000" }
              onClick={ () => { confirm('Are you sure you want to stop this? \n(Pending jobs will be cancelled. Current jobs will continue to run)') && handleStop(); } }
            >
              <Square className="w-4 h-4 mr-1" />
              Stop Project
            </Button>
          ) }
        </div>

        <Button size="icon" variant="ghost" onClick={ handleToggleTheme } data-testid="button-theme">
          { isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" /> }
        </Button>
      </div>
    </header>
  );
}
