import { useState, useRef, useEffect, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { Button } from "#/components/ui/button.js";
import { Slider } from "#/components/ui/slider.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip.js";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Repeat,
  Maximize,
  X,
  Volume,
  Volume1,
} from "lucide-react";
import { cn } from "#/lib/utils.js";
import type { Scene } from "../../../shared/types/index.js";
import { Skeleton } from "#/components/ui/skeleton.js";
import { VideoPlayer } from "#/components/ui/video-player.js";

interface PlaybackControlsProps {
  scenes: Scene[];
  totalDuration: number;
  videoSrc?: string;
  playbackOffset?: number;
  onTimeUpdate?: (time: number) => void;
  onPlayMainVideo?: () => void;
  isLoading?: boolean;
  isPlaying: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  selectedSceneIndex?: number;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const PlaybackControls = memo(function PlaybackControls({
  scenes,
  totalDuration,
  videoSrc,
  playbackOffset = 0,
  onTimeUpdate,
  onPlayMainVideo,
  isLoading,
  isPlaying,
  setIsPlaying,
  selectedSceneIndex,
}: PlaybackControlsProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isTheatreMode, setIsTheatreMode] = useState(false);
  const hiddenVideoRef = useRef<HTMLVideoElement>(null);
  const theatreVideoRef = useRef<HTMLVideoElement>(null);

  const getSceneAtTime = useCallback((time: number): Scene | undefined => {
    return scenes.find(s => time >= s.startTime && time < s.endTime);
  }, [scenes]);

  const playbackScene = isPlaying
    ? getSceneAtTime(currentTime)
    : (scenes.find(s => s.sceneIndex === selectedSceneIndex) || getSceneAtTime(currentTime));

  useEffect(() => {
    if (hiddenVideoRef.current) {
      if (isPlaying) {
        hiddenVideoRef.current.play().catch(err => console.error("Error playing video:", err));
      } else {
        hiddenVideoRef.current.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (hiddenVideoRef.current) {
      hiddenVideoRef.current.volume = isMuted ? 0 : volume;
      hiddenVideoRef.current.loop = isLooping;
    }
    if (theatreVideoRef.current) {
      theatreVideoRef.current.volume = isMuted ? 0 : volume;
      theatreVideoRef.current.loop = isLooping;
    }
  }, [volume, isMuted, isLooping]);

  useEffect(() => {
    onTimeUpdate?.(currentTime);
  }, [currentTime, onTimeUpdate]);

  useEffect(() => {
    if (isTheatreMode && theatreVideoRef.current) {
      if (Math.abs(theatreVideoRef.current.currentTime - currentTime) > 0.5) {
        theatreVideoRef.current.currentTime = currentTime;
      }
      if (isPlaying) {
        theatreVideoRef.current.play().catch(() => { });
      } else {
        theatreVideoRef.current.pause();
      }
    }
  }, [currentTime, isPlaying, isTheatreMode]);

  const handleTimeUpdate = useCallback(() => {
    if (hiddenVideoRef.current) {
      setCurrentTime(hiddenVideoRef.current.currentTime);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    if (isLooping && hiddenVideoRef.current) {
      hiddenVideoRef.current.play().catch(() => { });
      setIsPlaying(true);
    }
  }, [isLooping, setIsPlaying]);

  const handlePlayPause = () => {
    if (!videoSrc) return;
    if (onPlayMainVideo) {
      onPlayMainVideo();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    const newTime = value[0];
    setCurrentTime(newTime);
    if (hiddenVideoRef.current) {
      hiddenVideoRef.current.currentTime = newTime;
    }
  };

  const handleSkipBack = () => {
    const currentScene = getSceneAtTime(currentTime);
    if (!currentScene) {
      const newTime = 0;
      setCurrentTime(newTime);
      if (hiddenVideoRef.current) hiddenVideoRef.current.currentTime = newTime;
      return;
    }

    const currentIndex = scenes.findIndex(s => s.id === currentScene.id);
    let newTime = 0;
    if (currentIndex > 0) {
      const prevScene = scenes[currentIndex - 1];
      newTime = prevScene.startTime;
    }

    setCurrentTime(newTime);
    if (hiddenVideoRef.current) hiddenVideoRef.current.currentTime = newTime;
  };

  const handleSkipForward = () => {
    const currentScene = getSceneAtTime(currentTime);
    if (!currentScene) return;

    const currentIndex = scenes.findIndex(s => s.id === currentScene.id);
    if (currentIndex < scenes.length - 1) {
      const nextScene = scenes[currentIndex + 1];
      const newTime = nextScene.startTime;
      setCurrentTime(newTime);
      if (hiddenVideoRef.current) hiddenVideoRef.current.currentTime = newTime;
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const toggleLoop = () => {
    setIsLooping(!isLooping);
  };

  const openTheatreMode = useCallback(() => {
    setIsTheatreMode(true);
  }, []);

  const closeTheatreMode = useCallback(() => {
    setIsTheatreMode(false);
  }, []);

  const handleTheatrePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  if (isLoading) {
    return (
      <div className="bg-card p-3 space-y-3" data-testid="playback-controls-skeleton">
        <Skeleton className="h-4 w-full" />
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-card py-3 px-6 space-y-3" data-testid="playback-controls">
        <div className="relative -mx-6">
          <div className="absolute -top-1 left-0 right-0 h-1 flex w-full overflow-hidden">
            {totalDuration > 0 && scenes.map((scene) => {
              const width = (scene.duration / totalDuration) * 100;
              const isPlaybackScene = playbackScene?.id === scene.id;

              return (
                <div
                  key={scene.id}
                  className={cn(
                    "h-full transition-opacity",
                    isPlaybackScene ? "opacity-100" : "opacity-30"
                  )}
                  style={{
                    width: `${width}%`,
                    backgroundColor: isPlaybackScene ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'
                  }}
                />
              );
            })}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Slider
                value={[currentTime]}
                min={0}
                max={totalDuration}
                step={0.1}
                onValueChange={handleSeek}
                className="mt-2"
                data-testid="seekbar"
                disabled={!videoSrc}
              />
            </TooltipTrigger>
            <TooltipContent>Seek</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-muted-foreground font-mono justify-center">
            <span data-testid="text-current-time">Playhead: {formatTime(currentTime)}</span>
            <span>/</span>
            <span data-testid="text-total-duration">{formatTime(totalDuration)}</span>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSkipBack}
                  data-testid="button-skip-back"
                  disabled={!videoSrc}
                >
                  <SkipBack className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous Scene</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={handlePlayPause}
                  data-testid="button-play-pause"
                  disabled={!videoSrc || isLoading}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isPlaying ? "Pause" : "Play"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSkipForward}
                  data-testid="button-skip-forward"
                  disabled={!videoSrc}
                >
                  <SkipForward className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next Scene</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={toggleLoop}
                  className={cn(isLooping && "text-primary")}
                  data-testid="button-loop"
                  disabled={!videoSrc}
                >
                  <Repeat className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle Loop</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={openTheatreMode}
                  data-testid="button-theatre-mode"
                  disabled={!videoSrc}
                >
                  <Maximize className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fullscreen</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={toggleMute}
                  data-testid="button-mute"
                  disabled={!videoSrc}
                >
                  {(isMuted || volume === 0 && <Volume className="w-4 h-4" />) ||
                    (volume < 0.44 && <Volume1 className="w-4 h-4" />) ||
                    (<Volume2 className="w-4 h-4" />)
                  }
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isMuted ? "Unmute" : "Mute"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={handleVolumeChange}
                  className="w-20 cursor-pointer"
                  data-testid="volume-slider"
                  disabled={!videoSrc}
                />
              </TooltipTrigger>
              <TooltipContent>Volume</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <video
          ref={hiddenVideoRef}
          src={videoSrc}
          className="hidden"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          muted={isMuted}
        />
      </div>

      {isTheatreMode && videoSrc && createPortal(
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden">
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-4 right-4 text-white hover:bg-white/20 z-50"
            onClick={closeTheatreMode}
          >
            <X className="w-6 h-6" />
          </Button>

          <div className="relative w-full h-full flex items-center justify-center">
            <VideoPlayer
              ref={theatreVideoRef}
              src={videoSrc}
              className="max-h-full max-w-full w-full h-full"
              onPlay={handleTheatrePlayPause}
              onPause={handleTheatrePlayPause}
              controls={true}
              muted={isMuted}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
});

export default PlaybackControls;
