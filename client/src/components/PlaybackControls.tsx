import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Scene } from "@shared/pipeline-types";

interface PlaybackControlsProps {
  scenes: Scene[];
  totalDuration: number;
  audioUrl?: string;
  onSeekSceneChange?: (sceneId: number) => void;
  onTimeUpdate?: (time: number) => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function PlaybackControls({
  scenes,
  totalDuration,
  audioUrl,
  onSeekSceneChange,
  onTimeUpdate,
}: PlaybackControlsProps) {
  const [ isPlaying, setIsPlaying ] = useState(false);
  const [ currentTime, setCurrentTime ] = useState(0);
  const [ volume, setVolume ] = useState(0.8);
  const [ isMuted, setIsMuted ] = useState(false);
  const [ isLooping, setIsLooping ] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const lastSceneIdRef = useRef<number | null>(null);

  const getSceneAtTime = useCallback((time: number): Scene | undefined => {
    return scenes.find(s => time >= s.startTime && time < s.endTime);
  }, [ scenes ]);

  const playbackScene = getSceneAtTime(currentTime);

  useEffect(() => {
    if (audioUrl && !audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.volume = isMuted ? 0 : volume;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [ audioUrl ]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [ volume, isMuted ]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = isLooping;
    }
  }, [ isLooping ]);

  const startPlayback = useCallback(() => {
    lastTimeRef.current = performance.now();

    const animate = (timestamp: number) => {
      const delta = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      setCurrentTime(prev => {
        const newTime = prev + delta;
        if (newTime >= totalDuration) {
          if (isLooping) {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
            }
            return 0;
          } else {
            setIsPlaying(false);
            return totalDuration;
          }
        }
        return newTime;
      });

      if (isPlaying) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [ totalDuration, isLooping, isPlaying ]);

  useEffect(() => {
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.currentTime = currentTime;
        audioRef.current.play().catch(() => { });
      }
      startPlayback();
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }
  }, [ isPlaying, startPlayback ]);

  useEffect(() => {
    onTimeUpdate?.(currentTime);

    if (playbackScene && playbackScene.id !== lastSceneIdRef.current) {
      lastSceneIdRef.current = playbackScene.id;
      onSeekSceneChange?.(playbackScene.id);
    }
  }, [ currentTime, playbackScene, onSeekSceneChange, onTimeUpdate ]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    const newTime = value[ 0 ];
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleSkipBack = () => {
    const currentScene = getSceneAtTime(currentTime);
    if (!currentScene) {
      setCurrentTime(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
      return;
    }

    const currentIndex = scenes.findIndex(s => s.id === currentScene.id);
    if (currentIndex > 0) {
      const prevScene = scenes[ currentIndex - 1 ];
      setCurrentTime(prevScene.startTime);
      if (audioRef.current) audioRef.current.currentTime = prevScene.startTime;
    } else {
      setCurrentTime(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
    }
  };

  const handleSkipForward = () => {
    const currentScene = getSceneAtTime(currentTime);
    if (!currentScene) return;

    const currentIndex = scenes.findIndex(s => s.id === currentScene.id);
    if (currentIndex < scenes.length - 1) {
      const nextScene = scenes[ currentIndex + 1 ];
      setCurrentTime(nextScene.startTime);
      if (audioRef.current) audioRef.current.currentTime = nextScene.startTime;
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[ 0 ];
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

  return (
    <div className="bg-card border rounded-md p-3 space-y-3" data-testid="playback-controls">
      <div className="relative">
        <div className="absolute -top-1 left-0 right-0 h-1 flex">
          { scenes.map((scene) => {
            const left = (scene.startTime / totalDuration) * 100;
            const width = (scene.duration / totalDuration) * 100;
            const isPlaybackScene = playbackScene?.id === scene.id;

            return (
              <div
                key={ scene.id }
                className={ cn(
                  "absolute h-full transition-opacity",
                  isPlaybackScene ? "opacity-100" : "opacity-30"
                ) }
                style={ {
                  left: `${left}%`,
                  width: `${width}%`,
                  backgroundColor: isPlaybackScene ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'
                } }
              />
            );
          }) }
        </div>

        <Slider
          value={ [ currentTime ] }
          min={ 0 }
          max={ totalDuration }
          step={ 0.1 }
          onValueChange={ handleSeek }
          className="mt-2"
          data-testid="seekbar"
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={ handleSkipBack }
            data-testid="button-skip-back"
          >
            <SkipBack className="w-4 h-4" />
          </Button>

          <Button
            size="icon"
            onClick={ handlePlayPause }
            data-testid="button-play-pause"
          >
            { isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            ) }
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={ handleSkipForward }
            data-testid="button-skip-forward"
          >
            <SkipForward className="w-4 h-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={ toggleLoop }
            className={ cn(isLooping && "text-primary") }
            data-testid="button-loop"
          >
            <Repeat className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono flex-1 justify-center">
          <span data-testid="text-current-time">{ formatTime(currentTime) }</span>
          <span>/</span>
          <span data-testid="text-total-duration">{ formatTime(totalDuration) }</span>
          { playbackScene && (
            <span className="ml-2 text-foreground">
              Playhead: Scene #{ playbackScene.id }
            </span>
          ) }
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={ toggleMute }
            data-testid="button-mute"
          >
            { isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            ) }
          </Button>

          <Slider
            value={ [ isMuted ? 0 : volume ] }
            min={ 0 }
            max={ 1 }
            step={ 0.01 }
            onValueChange={ handleVolumeChange }
            className="w-20"
            data-testid="volume-slider"
          />
        </div>
      </div>
    </div>
  );
}
