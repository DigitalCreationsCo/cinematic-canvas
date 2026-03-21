// @ts-nocheck
"use client";

import 'media-chrome';
import React, { forwardRef, useCallback, useEffect, useRef } from 'react';

interface AudioPlayerProps {
  src: string;
  title?: string;
  className?: string;
  autoplay?: boolean;
  loop?: boolean;
  controls?: boolean;
}

export const AudioPlayer = forwardRef<HTMLAudioElement, AudioPlayerProps>(({
  src,
  title,
  className,
  autoplay = false,
  loop = false,
  controls = true,
}, forwardedRef) => {

  const internalAudioRef = useRef<HTMLAudioElement>(null);
  const internalControllerRef = useRef<HTMLElement>(null);

  const setAudioRef = useCallback((element: HTMLAudioElement) => {
    internalAudioRef.current = element;
    if (typeof forwardedRef === 'function') {
      forwardedRef(element);
    } else if (forwardedRef) {
      forwardedRef.current = element;
    }
  }, [forwardedRef]);

  useEffect(() => {
    if (!internalAudioRef.current) return;
    internalAudioRef.current.autoplay = autoplay;
    internalAudioRef.current.loop = loop;
  }, [autoplay, loop]);

  return (
    <media-controller 
      ref={internalControllerRef} 
      className={className}
      audio
    >
      <audio
        ref={setAudioRef}
        slot="media"
        src={src}
      />

      {controls && (
        <media-control-bar className="w-full bg-gradient-to-r from-cyan-500/10 via-transparent to-transparent">
          <media-play-button className="text-cyan-400 hover:text-cyan-300"></media-play-button>
          <media-time-display className="text-xs text-cyan-400/70"></media-time-display>
          <media-time-range className="flex-1 [--media-range-track-background:rgba(34,211,238,0.2)]"></media-time-range>
          <media-duration-display className="text-xs text-cyan-400/70"></media-duration-display>
          <media-mute-button className="text-cyan-400 hover:text-cyan-300"></media-mute-button>
          <media-volume-range className="w-20"></media-volume-range>
        </media-control-bar>
      )}
    </media-controller>
  );
});

AudioPlayer.displayName = "AudioPlayer";
