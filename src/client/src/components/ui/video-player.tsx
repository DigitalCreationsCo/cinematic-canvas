import 'media-chrome';
import {
  MediaController,
  MediaControlBar,
  MediaPlayButton,
  MediaMuteButton,
  MediaVolumeRange,
  MediaTimeRange,
  MediaFullscreenButton,
} from 'media-chrome/react';
import React, { forwardRef, useCallback } from 'react';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
  playsInline?: boolean;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({
  src,
  poster,
  className,
  controls = true,
  autoPlay = false,
  muted = false,
  loop = false,
  onPlay,
  onPause,
  onEnded,
  onTimeUpdate,
  playsInline = true
}, ref) => {
  // media-chrome uses --media-object-fit to control the video object-fit
  // We detect if 'object-cover' is passed in className and apply the variable
  const isCover = className?.includes('object-cover');
  const mediaControllerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'block',
    '--media-object-fit': isCover ? 'cover' : 'contain',
  } as React.CSSProperties;

  const handleTimeUpdate = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    onTimeUpdate?.(video.currentTime);
  }, [onTimeUpdate]);

  const handleEnded = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    onEnded?.();
  }, [onEnded]);

  const handlePlay = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    onPlay?.();
  }, [onPlay]);

  const handlePause = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    onPause?.();
  }, [onPause]);

  if (!src) {
    return null;
  }

  return (
    <MediaController
      className={className}
      style={mediaControllerStyle}
    >
      <video
        slot="media"
        ref={ref}
        src={src}
        poster={poster}
        playsInline={playsInline}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onTimeUpdate={handleTimeUpdate}
        style={{ width: '100%', height: '100%' }}
      />
      {controls && (
        <MediaControlBar>
          <MediaPlayButton />
          <MediaMuteButton />
          <MediaVolumeRange />
          <MediaTimeRange />
          <MediaFullscreenButton />
        </MediaControlBar>
      )}
    </MediaController>
  );
});

VideoPlayer.displayName = "VideoPlayer";
