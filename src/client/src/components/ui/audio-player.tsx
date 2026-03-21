// @ts-nocheck
"use client";

import 'media-chrome';
import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { useProjectStore } from '#/store/useProjectStore.js';
import { Repeat } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  title?: string;
  className?: string;
  autoplay?: boolean;
  controls?: boolean;
  audioId: string;
}

export const AudioPlayer = forwardRef<HTMLAudioElement, AudioPlayerProps>(({
  src,
  title,
  className,
  autoplay = false,
  controls = true,
  audioId,
}, forwardedRef) => {

  const [isLooping, setIsLooping] = useState(false);
  const internalAudioRef = useRef<HTMLAudioElement>(null);
  const internalControllerRef = useRef<HTMLElement>(null);

  const activeAudioId = useProjectStore((s) => s.activeAudioId);
  const setActiveAudioId = useProjectStore((s) => s.setActiveAudioId);

  const isPlaying = activeAudioId === audioId;

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
  }, [autoplay]);

  useEffect(() => {
    if (!internalAudioRef.current) return;

    if (isPlaying) {
      internalAudioRef.current.play().catch(console.error);
    } else {
      internalAudioRef.current.pause();
      internalAudioRef.current.currentTime = 0;
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!internalAudioRef.current) return;
    internalAudioRef.current.loop = isLooping;
  }, [isLooping]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setActiveAudioId(null);
    } else {
      setActiveAudioId(audioId);
    }
  }, [isPlaying, audioId, setActiveAudioId]);

  const toggleLoop = useCallback(() => {
    setIsLooping((prev) => !prev);
  }, []);

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
          <button
            onClick={togglePlay}
            className="flex items-center justify-center w-8 h-8 text-cyan-400 hover:text-cyan-300 transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            <media-play-button className="[&::slotted]:hidden" />
            {isPlaying ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>

          <media-time-display className="text-xs text-cyan-400/70"></media-time-display>
          <media-time-range className="flex-1 [&]:!bg-transparent"></media-time-range>
          <media-duration-display className="text-xs text-cyan-400/70"></media-duration-display>

          <button
            onClick={toggleLoop}
            className={`flex items-center justify-center w-8 h-8 transition-colors ${
              isLooping ? 'text-cyan-400' : 'text-cyan-400/50 hover:text-cyan-300'
            }`}
            title={isLooping ? 'Loop: On' : 'Loop: Off'}
          >
            <Repeat className="w-4 h-4" />
          </button>

          <media-mute-button className="text-cyan-400 hover:text-cyan-300"></media-mute-button>
          <media-volume-range className="w-20"></media-volume-range>
        </media-control-bar>
      )}
    </media-controller>
  );
});

AudioPlayer.displayName = "AudioPlayer";
