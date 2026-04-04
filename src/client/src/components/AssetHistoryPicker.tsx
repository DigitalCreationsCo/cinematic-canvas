// client/src/components/AssetHistoryPicker.optimized.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "#client/components/ui/dialog.js";
import { ScrollArea } from "#client/components/ui/scroll-area.js";
import { Badge } from "#client/components/ui/badge.js";
import { Button } from "#client/components/ui/button.js";
import { useEffect, useState, useMemo, useCallback, memo, useRef } from "react";
import { getSceneAssets, getCharacterAssets, getLocationAssets, getProjectAssets } from "#client/lib/api.js";
import { Skeleton } from "#client/components/ui/skeleton.js";
import { Clock, Play, Filter, SortAsc, SortDesc, CheckCircle2 } from "lucide-react";
import { VideoPlayer } from "#client/components/ui/video-player.js";
import { AssetKey, AssetVersion, AssetRegistry, EntityType } from "../../../shared/types/index.js";
import { useProjectStore, selectCurrentScene } from "../store/useProjectStore.js";
import { useAssetStore } from "../store/useAssetStore.js";
import useSWR from 'swr';
import {
    getAllAssetVersions,
    isAssetEvaluated,
    getAssetQualityScore,
    getAssetUrl,
} from "../../../shared/utils/assets-utils.js";
import { resolvePublicUrl } from "../../../shared/utils/utils.js";
// Selector imported above from useProjectStore
import { extractErrorMessage } from "../../../shared/utils/errors.js";

interface AssetHistoryPickerProps {
    entityId: string;
    entityType?: EntityType;
    assetType: AssetKey;
    projectId: string;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (asset: AssetVersion) => void;
    currentUrl?: string;
}

type SortOption = 'newest' | 'oldest' | 'quality-high' | 'quality-low';
type FilterOption = 'all' | 'evaluated' | 'unevaluated';

const AssetCard = memo(function AssetCard({
    asset,
    assetType,
    isCurrent,
    onClick,
}: {
    asset: AssetVersion;
    assetType: AssetKey;
    isCurrent: boolean;
    onClick: () => void;
}) {
    const qualityScore = getAssetQualityScore(asset);
    const hasEvaluation = isAssetEvaluated(asset);

    const hoverRef = useRef<HTMLDivElement>(null);

    return (
        <div
            ref={hoverRef}
            className={`group relative overflow-hidden cursor-pointer hover: ${isCurrent ? "" : ""
                }`}
            onClick={onClick}
        >
            <div className="aspect-video bg-muted relative">
                {assetType === "scene_video" ? (
                    <div className="w-full h-full flex items-center justify-center relative">
                        <VideoPlayer
                            playOnHover
                            hoverRef={hoverRef}
                            src={resolvePublicUrl(asset.data)}
                            className="w-full h-full object-cover"
                            controls={false}
                        />
                    </div>
                ) : (
                    <img
                        src={resolvePublicUrl(asset.data)}
                        alt={`Version ${asset.version}`}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                    />
                )}
            </div>

            <div className="absolute top-2 left-2 flex flex-col gap-1">
                <Badge
                    variant="secondary"
                    className=" bg-black/50 text-white  "
                >
                    #{asset.version}
                </Badge>
                {hasEvaluation && qualityScore !== undefined && (
                    <Badge
                        variant="secondary"
                        className=" bg-black/50 text-white  "
                    >
                        {(qualityScore * 100).toFixed(0)}%
                    </Badge>
                )}
            </div>

            {isCurrent && (
                <div className="absolute top-2 right-2">
                    <Badge variant="default" className="">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Current
                    </Badge>
                </div>
            )}

            <div className="p-2  text-muted-foreground bg-card">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 truncate">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">
                            {new Date(asset.createdAt).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </span>
                    </div>
                    {asset.metadata?.model && (
                        <span className=" text-muted-foreground/70 truncate">
                            {asset.metadata.model}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
});

export function AssetHistoryPicker({
    entityId,
    entityType = 'scene',
    assetType,
    projectId,
    isOpen,
    onOpenChange,
    onSelect,
    currentUrl,
}: AssetHistoryPickerProps) {
    const registry = useAssetStore((state) => state.assets.get(entityId));
    const setGlobalAssets = useAssetStore((state) => state.setAssets);

    const preloadedUrls = useRef<Set<string>>(new Set());
    const scenes = useProjectStore((s) => s.scenes);
    const viewedScenesHistory = useProjectStore((s) => s.viewedScenesHistory);
    const currentScene = useProjectStore(selectCurrentScene);

    const sceneIdsToPreload = useMemo(() => {
        if (!currentScene) return viewedScenesHistory.slice(-5);
        return [currentScene.id, ...viewedScenesHistory.filter(id => id !== currentScene.id).slice(-5)];
    }, [currentScene, viewedScenesHistory]);

    const scenesToPreload = useMemo(() => {
        const scenesList = Object.values(scenes);
        return scenesList.filter(s => sceneIdsToPreload.includes(s.id));
    }, [scenes, sceneIdsToPreload]);

    const preloadImage = (url: string) => {
        if (preloadedUrls.current.has(url)) return;
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = url;
        document.head.appendChild(link);
        const img = new Image();
        img.src = url;
        preloadedUrls.current.add(url);
    };

    const preloadVideo = (url: string) => {
        if (preloadedUrls.current.has(url)) return;
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'video';
        link.href = url;
        link.type = 'video/mp4';
        document.head.appendChild(link);
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.src = url;
        preloadedUrls.current.add(url);
    };

    useEffect(() => {
        if (entityType === 'scene') {
            scenesToPreload.forEach(scene => {
                const reg = useAssetStore.getState().assets.get(scene.id);
                if (reg) {
                    const startFrameUrl = getAssetUrl(reg, "scene_start_frame");
                    if (startFrameUrl) preloadImage(resolvePublicUrl(startFrameUrl));
                    const videoUrl = getAssetUrl(reg, "scene_video");
                    if (videoUrl) preloadVideo(resolvePublicUrl(videoUrl));
                    const endFrameUrl = getAssetUrl(reg, "scene_end_frame");
                    if (endFrameUrl) preloadImage(resolvePublicUrl(endFrameUrl));
                }
            });
        }
    }, [scenesToPreload, entityType]);

    const assets = useMemo(() =>
        getAllAssetVersions(registry, assetType),
        [registry, assetType]
    );

    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [filterBy, setFilterBy] = useState<FilterOption>('all');

    const swrKey = isOpen ? [`${entityType}-assets`, projectId, entityId] : null;

    const { isLoading, error } = useSWR(
        swrKey,
        ([, pId, eId]) => {
            switch (entityType) {
                case 'character':
                    return getCharacterAssets(pId, eId);
                case 'location':
                    return getLocationAssets(pId, eId);
                case 'project':
                    return getProjectAssets(pId);
                case 'scene':
                default:
                    return getSceneAssets(pId, eId);
            }
        },
        {
            onSuccess: (data: AssetRegistry) => {
                setGlobalAssets(entityId, data);
            },
            revalidateOnFocus: false
        }
    );

    const filteredAssets = useMemo(() => {
        let filtered = assets;

        if (filterBy === 'evaluated') {
            filtered = filtered.filter((a) => isAssetEvaluated(a));
        } else if (filterBy === 'unevaluated') {
            filtered = filtered.filter((a) => !isAssetEvaluated(a));
        }

        return filtered;
    }, [assets, filterBy]);

    const sortedAssets = useMemo(() => {
        const sorted = [...filteredAssets];

        switch (sortBy) {
            case 'newest':
                sorted.sort((a, b) => b.version - a.version);
                break;
            case 'oldest':
                sorted.sort((a, b) => a.version - b.version);
                break;
            case 'quality-high':
                sorted.sort((a, b) => {
                    const scoreA = getAssetQualityScore(a) ?? -1;
                    const scoreB = getAssetQualityScore(b) ?? -1;
                    return scoreB - scoreA;
                });
                break;
            case 'quality-low':
                sorted.sort((a, b) => {
                    const scoreA = getAssetQualityScore(a) ?? Infinity;
                    const scoreB = getAssetQualityScore(b) ?? Infinity;
                    return scoreA - scoreB;
                });
                break;
        }

        return sorted;
    }, [filteredAssets, sortBy]);

    const handleSelect = useCallback(
        (asset: AssetVersion) => {
            onSelect(asset);
            onOpenChange(false);
        },
        [onSelect, onOpenChange]
    );

    const displayName = useMemo(() => {
        switch (assetType) {
            case 'scene_start_frame':
                return 'Start Frame';
            case 'scene_end_frame':
                return 'End Frame';
            case 'scene_video':
                return 'Video';
            default:
                return assetType.replace(/_/g, ' ');
        }
    }, [assetType]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="border max-w-4xl h-[85vh] flex flex-col">
                <DialogHeader className='border-b pb-4'>
                    <div className="flex items-center justify-between">
                        <DialogTitle className="uppercase font-mono font-medium tracking-wider">
                            {displayName} History
                            {sortedAssets.length > 0 && (
                                <span className="ml-2  font-normal text-muted-foreground">
                                    ({sortedAssets.length})
                                </span>
                            )}
                        </DialogTitle>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1  ">
                                <Button
                                    variant={filterBy === 'all' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setFilterBy('all')}
                                    className="h-8 px-2"
                                >
                                    <Filter className="w-3 h-3 mr-1" />
                                    All
                                </Button>
                                <Button
                                    variant={filterBy === 'evaluated' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setFilterBy('evaluated')}
                                    className="h-8 px-2"
                                >
                                    Evaluated
                                </Button>
                                <Button
                                    variant={filterBy === 'unevaluated' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setFilterBy('unevaluated')}
                                    className="h-8 px-2"
                                >
                                    Unevaluated
                                </Button>
                            </div>

                            <div className="flex items-center gap-1  ">
                                <Button
                                    variant={sortBy === 'newest' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setSortBy('newest')}
                                    className="h-8 px-2"
                                >
                                    <SortDesc className="w-3 h-3 mr-1" />
                                    Newest
                                </Button>
                                <Button
                                    variant={sortBy === 'oldest' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setSortBy('oldest')}
                                    className="h-8 px-2"
                                >
                                    <SortDesc className="w-3 h-3 mr-1" />
                                    Oldest
                                </Button>
                                <Button
                                    variant={sortBy.startsWith('quality') ? 'secondary' : 'ghost'}
                                    size="sm"
                                    onClick={() =>
                                        setSortBy(sortBy === 'quality-high' ? 'quality-low' : 'quality-high')
                                    }
                                    className="h-8 px-2"
                                >
                                    Quality
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1 p-1">
                    {isLoading ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="space-y-2">
                                    <Skeleton className="aspect-video w-full " />
                                    <Skeleton className="h-4 w-3/4" />
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-full text-destructive p-4 text-center">
                            {extractErrorMessage(error)}
                        </div>
                    ) : sortedAssets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                            <p>No {filterBy === 'all' ? '' : filterBy} versions found.</p>
                            {filterBy !== 'all' && (
                                <Button

                                    size="sm"
                                    onClick={() => setFilterBy('all')}
                                >
                                    Show All Versions
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-2 gap-4 pb-4">
                            {sortedAssets.map((asset) => (
                                <AssetCard
                                    key={asset.version}
                                    asset={asset}
                                    assetType={assetType}
                                    isCurrent={currentUrl === asset.data}
                                    onClick={() => handleSelect(asset)}
                                />
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
