// @ts-nocheck
"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import 'media-chrome';
import { forwardRef, useCallback, useEffect, useRef } from 'react';
export const VideoPlayer = forwardRef(({ src, poster, className, playOnHover = false, hoverRef }, forwardedRef) => {
    const internalVideoRef = useRef(null);
    const internalControllerRef = useRef(null);
    const setVideoRef = useCallback((element) => {
        internalVideoRef.current = element;
        if (typeof forwardedRef === 'function') {
            forwardedRef(element);
        }
        else if (forwardedRef) {
            forwardedRef.current = element;
        }
    }, [forwardedRef]);
    useEffect(() => {
        if (!playOnHover)
            return;
        const targetElement = hoverRef?.current || internalControllerRef.current;
        if (!targetElement)
            return;
        const handleMouseEnter = async () => {
            if (!internalVideoRef.current)
                return;
            try {
                await internalVideoRef.current.play();
            }
            catch (err) {
                console.error("Playback failed:", err);
            }
        };
        const handleMouseLeave = () => {
            if (!internalVideoRef.current)
                return;
            try {
                internalVideoRef.current.pause();
            }
            catch (err) {
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
    const style = isCover ? { '--media-object-fit': 'cover' } : undefined;
    return (_jsxs("media-controller", { ref: internalControllerRef, className: className, style: style, children: [_jsx("video", { ref: setVideoRef, slot: "media", src: src, poster: poster, crossOrigin: "anonymous", playsInline: true }), _jsxs("media-control-bar", { children: [_jsx("media-play-button", {}), _jsx("media-mute-button", {}), _jsx("media-volume-range", {}), _jsx("media-time-range", {}), _jsx("media-fullscreen-button", {})] })] }));
});
VideoPlayer.displayName = "VideoPlayer";
//# sourceMappingURL=video-player.js.map