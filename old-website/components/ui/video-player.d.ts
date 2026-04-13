import 'media-chrome';
import React from 'react';
interface VideoPlayerProps {
    src: string;
    poster?: string;
    class?: string;
    playOnHover?: boolean;
    hoverRef?: React.RefObject<HTMLElement | null>;
}
export declare const VideoPlayer: React.ForwardRefExoticComponent<VideoPlayerProps & React.RefAttributes<HTMLVideoElement>>;
export { };
//# sourceMappingURL=video-player.d.ts.map