// @ts-nocheck
"use client";

import 'media-chrome';
import React, { forwardRef, useCallback, useEffect, useRef } from 'react';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  playOnHover?: boolean;
  controls?: boolean;
  hoverRef?: React.RefObject<HTMLElement | null>;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({ 
  src, 
  poster, 
  className,
  playOnHover = false,
  controls = true,
  hoverRef
}, forwardedRef) => {

  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const internalControllerRef = useRef<HTMLElement>(null);

  const setVideoRef = useCallback((element: HTMLVideoElement) => {
    internalVideoRef.current = element;
    if (typeof forwardedRef === 'function') {
      forwardedRef(element);
    } else if (forwardedRef) {
      forwardedRef.current = element;
    }
  }, [forwardedRef]);

  useEffect(() => {
    if (!playOnHover) return;

    const targetElement = hoverRef?.current || internalControllerRef.current;
    if (!targetElement) return;

    const handleMouseEnter = async () => {
      if (!internalVideoRef.current) return;
      try {
        await internalVideoRef.current.play();
      } catch (err) {
        console.error("Playback failed:", err);
      }
    };

    const handleMouseLeave = () => {
      if (!internalVideoRef.current) return;
      try {
        internalVideoRef.current.pause();
      } catch (err) {
        console.error("Pause failed:", err);
      }
    };

    targetElement.addEventListener('mouseenter', handleMouseEnter);
    targetElement.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      targetElement.removeEventListener('mouseenter', handleMouseEnter);
      targetElement.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [playOnHover, hoverRef]);

  // media-chrome uses --media-object-fit to control the video object-fit
  // We detect if 'object-cover' is passed in className and apply the variable
  const isCover = className?.includes('object-cover');
  const style = isCover ? { '--media-object-fit': 'cover' } as React.CSSProperties : undefined;

  return (
    <media-controller ref={internalControllerRef} className={className} style={style}>
      <video
        ref={setVideoRef}
        slot="media"
        src={src}
        poster={poster}
        crossOrigin="anonymous"
        playsInline
      />

      {controls && (
        <media-control-bar>
          <media-play-button></media-play-button>
          <media-mute-button></media-mute-button>
          <media-volume-range></media-volume-range>
          <media-time-range></media-time-range>
          <media-fullscreen-button></media-fullscreen-button>
        </media-control-bar>
      )}
    </media-controller>
  );
});

VideoPlayer.displayName = "VideoPlayer";
