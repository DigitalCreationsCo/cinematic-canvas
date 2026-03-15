import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.js";
import { Badge } from "#/components/ui/badge.js";
import { Button } from "#/components/ui/button.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs.js";
import { ScrollArea } from "#/components/ui/scroll-area.js";
import { RefreshCw, FileText, MapPin, Info, Thermometer, Cloud, ChevronLeft, ChevronRight, Sun } from "lucide-react";
import { useState, memo } from "react";
import type { Location, AssetKey, AssetVersion } from "../../../shared/types/index.js";
import FramePreview from "./FramePreview.js";
import { Skeleton } from "#/components/ui/skeleton.js";
import { AssetHistoryPicker } from "./AssetHistoryPicker.js";
import { patchAsset } from "#/lib/api.js";
import { useToast } from "#/hooks/use-toast.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip.js";
import { useAssetStore, useLocationAssets } from "../store/useAssetStore.js";
import { resolvePublicUrl } from "../../../shared/utils/utils.js";


interface LocationDetailPanelProps {
    location: Omit<Location, "assets">;
    projectId: string;
    isLoading?: boolean;
    onNext?: () => void;
    onPrevious?: () => void;
    hasNext?: boolean;
    hasPrevious?: boolean;
}

const LocationDetailPanel = memo(function LocationDetailPanel({
    location,
    projectId,
    isLoading = false,
    onNext,
    onPrevious,
    hasNext = false,
    hasPrevious = false,
}: LocationDetailPanelProps) {
    const { toast } = useToast();
    const setAssets = useAssetStore((state) => state.setAssets);

    const [historyPickerOpen, setHistoryPickerOpen] = useState(false);
    const [pickerType, setPickerType] = useState<AssetKey>("location_image");
    const [isGenerating, setIsGenerating] = useState(false);

    // Location assets
    const { bestAssets: assets, assets: registry } = useLocationAssets(location.id);

    const handleHistoryClick = (assetKey: AssetKey) => {
        setPickerType(assetKey);
        setHistoryPickerOpen(true);
    };

    const handleSelectAsset = async (asset: AssetVersion) => {
        const previousRegistry = registry;

        // Optimistic update
        if (registry && registry[pickerType]) {
            const updatedRegistry = {
                ...registry,
                [pickerType]: {
                    ...registry[pickerType]!,
                    best: asset.version,
                }
            };
            setAssets(location.id, updatedRegistry);
            try {
                await patchAsset(location.id, {
                    projectId,
                    entityType: 'location',
                    assetKey: pickerType,
                    version: asset.version,
                });
            } catch (error) {
                if (previousRegistry) {
                    setAssets(location.id, previousRegistry);
                }
                toast({
                    title: "Error",
                    description: `Failed to restore asset: ${error instanceof Error ? error.message : String(error)}`,
                    variant: "destructive",
                });
            }
        }
    };

    const handleRegenerateClick = () => {
        // TODO: Implement location regeneration
        toast({
            title: "Not Implemented",
            description: "Location regeneration coming soon.",
        });
    };

    const handleDeleteAsset = (assetKey: AssetKey, version: number) => {
        // TODO: Implement delete
        toast({
            title: "Not Implemented",
            description: "Asset deletion coming soon.",
        });
    };


    return (
        <>
            <AssetHistoryPicker
                entityId={location.id}
                entityType="location"
                assetType={pickerType}
                projectId={projectId}
                isOpen={historyPickerOpen}
                onOpenChange={setHistoryPickerOpen}
                onSelect={handleSelectAsset}
                currentUrl={assets[pickerType]?.data}
            />
            <div className="h-full flex flex-col" data-testid={`panel-location-detail-${location.id}`}>
                <div className="p-4  flex items-center justify-between gap-4 shrink-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        {isLoading ? (
                            <Skeleton className="h-10 w-10 " />
                        ) : (
                            <div className="h-10 w-10  bg-primary/10 flex items-center justify-center shrink-0">
                                <MapPin className="h-5 w-5 text-primary" />
                            </div>
                        )}
                        <div className="min-w-0">
                            {isLoading ? (
                                <Skeleton className="h-6 w-32 mb-1" />
                            ) : (
                                <h2 className=" font-semibold     truncate">{location.name}</h2>
                            )}
                            {isLoading ? (
                                <Skeleton className="h-4 w-20" />
                            ) : (
                                <div className=" text-muted-foreground truncate">{location.type}</div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {(hasPrevious || hasNext) &&
                            <>
                                <Button
                                    size="icon"
                                    onClick={onPrevious}
                                    disabled={!hasPrevious || isLoading}
                                    title="Previous Location"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    onClick={onNext}
                                    disabled={!hasNext || isLoading}
                                    title="Next Location"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </>
                        }
                    </div>
                </div>

                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-4">
                        <div className="flex flex-col gap-3">
                            <FramePreview
                                title="Location Visualization"
                                imageUrl={resolvePublicUrl(assets['location_image']?.data)}
                                alt={location.name}
                                isLoading={isLoading}
                                onRegenerate={handleRegenerateClick}
                                onDelete={() => handleDeleteAsset("location_image", assets["location_image"]?.version || 0)}
                                onHistory={() => handleHistoryClick("location_image")}
                                isGenerating={isGenerating}
                                priority={true}
                            />
                        </div>

                        <Tabs defaultValue="details" className="w-full">
                            <TabsList className="w-full grid grid-cols-3">
                                <TabsTrigger value="details">Details</TabsTrigger>
                                <TabsTrigger value="state">Environment</TabsTrigger>
                                <TabsTrigger value="prompt">Prompt</TabsTrigger>
                            </TabsList>

                            <TabsContent value="details" className="mt-4 space-y-4">
                                <Card>
                                    <CardHeader className="p-3 pb-2">
                                        <div className="flex items-center gap-2">
                                            <Info className="w-4 h-4 text-muted-foreground" />
                                            <CardTitle className=" font-medium">Attributes</CardTitle>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0 space-y-3">
                                        <div className="">
                                            <span className="text-muted-foreground">Type:</span>
                                            <span className="ml-2 capitalize">{location.type}</span>
                                        </div>
                                        <div className="">
                                            <span className="text-muted-foreground">Mood:</span>
                                            <span className="ml-2">{location.mood}</span>
                                        </div>
                                        <div>
                                            <span className=" text-muted-foreground block mb-1">Architecture:</span>
                                            <div className="flex flex-wrap gap-1">
                                                {location.architecture.map((item, i) => (
                                                    <Badge key={i}>{item}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <span className=" text-muted-foreground block mb-1">Elements:</span>
                                            <div className="flex flex-wrap gap-1">
                                                {[...location.naturalElements, ...location.manMadeObjects].map((item, i) => (
                                                    <Badge key={i} variant="secondary">{item}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="state" className="mt-4 space-y-4">
                                <Card>
                                    <CardHeader className="p-3 pb-2">
                                        <div className="flex items-center gap-2">
                                            <Cloud className="w-4 h-4 text-muted-foreground" />
                                            <CardTitle className=" font-medium">Environment</CardTitle>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0 space-y-3">
                                        <div className="grid grid-cols-1 gap-2 ">
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">Time</span>
                                                <span className="font-medium">{location.state.timeOfDay}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">Weather</span>
                                                <span className="font-medium">{location.state.weather}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">Season</span>
                                                <span className="font-medium capitalize">{location.state.season}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">Ground</span>
                                                <span className="font-medium capitalize">{location.state.groundCondition.wetness}</span>
                                            </div>
                                        </div>

                                        {/* Lighting Details */}
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Sun className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium">Lighting</span>
                                            </div>
                                            <div className="grid grid-cols-1 gap-2 text-muted-foreground">
                                                <div className="flex items-center justify-between">
                                                    Type: <span className="text-foreground">{location.state.lighting.direction.keyLightPosition}</span></div>
                                                <div className="flex items-center justify-between">
                                                    Quality: <span className="text-foreground">{location.state.lighting.quality.hardness}</span></div>
                                                <div className="flex items-center justify-between">
                                                    Source: <span className="text-foreground">{location.state.lighting.motivatedSources.primaryLight}</span></div>
                                                <div className="flex items-center justify-between">
                                                    Color: <span className="text-foreground">{location.state.lighting.quality.colorTemperature}</span></div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="prompt" className="mt-4">
                                <Card>
                                    <CardHeader className="p-3 pb-2">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-muted-foreground" />
                                            <CardTitle className=" font-medium">Prompt</CardTitle>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0">
                                        {assets['location_prompt']?.data ? (
                                            <p className=" font-mono whitespace-pre-wrap p-2 ">
                                                {assets['location_prompt'].data}
                                            </p>
                                        ) : (
                                            <p className=" text-muted-foreground">No prompt available</p>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </div>
                </ScrollArea>
            </div>
        </>
    );
}
);

export default LocationDetailPanel;
