import { useEffect, useRef } from 'react';
import { getAssetUrl } from '../../../shared/utils/assets-utils.js';
import { useAssetStore } from '#/store/useAssetStore.js';
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { resolvePublicUrl } from '../../../shared/utils/utils.js';

/**
 * Preloads assets for the current scene window to ensure smooth
 * playback and instant thumbnails.
 *
 */
export function useMediaPreloader(scenes: any[], currentSceneId?: string) {
    const preloadedUrls = useRef<Set<string>>(new Set());

    const targetSceneIds = (() => {
        if (!scenes.length) return [];
        const currentIndex = scenes.findIndex((s) => s.id === currentSceneId);
        const startIndex = currentIndex === -1 ? 0 : currentIndex;
        return scenes.slice(startIndex, startIndex + 3).map((s) => s.id);
    })();

    const sceneRegistries = useStoreWithEqualityFn(
        useAssetStore,
        (state) =>
            targetSceneIds.map((id) => ({
                sceneId: id,
                registry: state.assets.get(id) ?? null,
            })),
        (a, b) => {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (a[ i ].sceneId !== b[ i ].sceneId) return false;
                // Compare registry object references. If immer produced a new Map,
                // the .get() call returns a new reference only if that specific key
                // was modified. So this is correct.
                if (a[ i ].registry !== b[ i ].registry) return false;
            }
            return true;
        }
    );

    useEffect(() => {
        sceneRegistries.forEach(({ registry }, index) => {
            if (!registry) return;

            // Priority 1: Start frame (thumbnail)
            const startFrame = getAssetUrl(registry, "scene_start_frame");
            if (startFrame) preloadImage(resolvePublicUrl(startFrame));

            // Priority 2: Video (only for current + next 2 to save bandwidth)
            const video = getAssetUrl(registry, "scene_video");
            if (video) preloadVideo(resolvePublicUrl(video));

            // Priority 3: End frame (used for hover/transitions)
            const endFrame = getAssetUrl(registry, "scene_end_frame");
            if (endFrame) preloadImage(resolvePublicUrl(endFrame));
        });
    }, [ sceneRegistries ]);

    const preloadImage = (url: string) => {
        if (preloadedUrls.current.has(url)) return;

        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = url;
        document.head.appendChild(link);

        // Backup method using Image object
        const img = new Image();
        img.src = url;

        preloadedUrls.current.add(url);
    };

    const preloadVideo = (url: string) => {
        if (preloadedUrls.current.has(url)) return;

        // Using <link rel="preload" as="video"> is the most "resource-light" way 
        // as it respects the browser's download manager better than creating hidden video elements.
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'video';
        link.href = url;
        link.type = 'video/mp4'; // Assumption, but safe for generated videos usually
        document.head.appendChild(link);

        // Also create a detached video element to force buffering if preload link is ignored (some browsers)
        // We only do this for the *immediate* next video to minimize memory usage
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.src = url;

        preloadedUrls.current.add(url);
    };
}
