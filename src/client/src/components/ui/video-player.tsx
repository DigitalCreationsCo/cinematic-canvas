import 'media-chrome';
import React, { forwardRef } from 'react';

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
  playsInline = true
}, ref) => {
  // media-chrome uses --media-object-fit to control the video object-fit
  // We detect if 'object-cover' is passed in className and apply the variable
  const isCover = className?.includes('object-cover');
  const style = isCover ? { '--media-object-fit': 'cover' } as React.CSSProperties : undefined;

  return (
    // @ts-ignore
    <media-controller className={className} style={style}>
      <video
        slot="media"
        src={src}
        poster={poster}
        crossOrigin="anonymous"
        playsInline={playsInline}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        ref={ref}
      />
      {controls && (
        // @ts-ignore
        <media-control-bar>
          {/* @ts-ignore */}
          <media-play-button></media-play-button>
          {/* @ts-ignore */}
          <media-mute-button></media-mute-button>
          {/* @ts-ignore */}
          <media-volume-range></media-volume-range>
          {/* @ts-ignore */}
          <media-time-range></media-time-range>
          {/* @ts-ignore */}
          <media-fullscreen-button></media-fullscreen-button>
        </media-control-bar>
      )}
    </media-controller>
  );
});

VideoPlayer.displayName = "VideoPlayer";
