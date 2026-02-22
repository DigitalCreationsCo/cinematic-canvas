"use client";

import 'media-chrome';
import React from 'react';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
}

export function VideoPlayer({ src, poster, className }: VideoPlayerProps) {
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
        playsInline
      />
      {/* @ts-ignore */}
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
    </media-controller>
  );
}
