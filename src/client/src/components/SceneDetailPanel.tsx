import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.js";
import { Badge } from "#/components/ui/badge.js";
import { Button } from "#/components/ui/button.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs.js";
import { ScrollArea } from "#/components/ui/scroll-area.js";
import { Play, Pause, RefreshCw, Camera, Video, Sun, Music, Users, MapPin, FileText, ChevronLeft, ChevronRight, User } from "lucide-react";
import { useRef, useState, useEffect, useCallback, RefObject, memo, useMemo } from "react";
import type { Scene, AssetStatus, Character, Location, QualityEvaluationResult, AssetVersion, AssetRegistry, AssetKey, AssetHistory } from "../../../shared/types/index.js";
import StatusBadge from "./StatusBadge.js";
import QualityEvaluationPanel from "./QualityEvaluationPanel.js";
import FramePreview from "./FramePreview.js";
import { Skeleton } from "#/components/ui/skeleton.js";
import { RegenerateFrameDialog } from "./RegenerateFrameDialog.js";
import { RegenerateSceneDialog } from "./RegenerateSceneDialog.js";
import { AssetHistoryPicker } from "./AssetHistoryPicker.js";
import { regenerateFrame, patchAsset, regenerateScene, getSceneAssets } from "#/lib/api.js";
import { useToast } from "#/hooks/useToast.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip.js";
import { Trash2, History } from "lucide-react";
import { useProjectStore } from "../store/useProjectStore.js";
import { useAssetStore, useSceneAssets, useLocationAssets } from "../store/useAssetStore.js";
import { getAllBestAssets } from "../../../shared/utils/assets-utils.js";
import { resolvePublicUrl } from "../../../shared/utils/utils.js";
import { VideoPlayer } from "#/components/ui/video-player.js";

interface SceneDetailPanelProps {
  scene: Scene;
  status: AssetStatus;
  characters?: Character[];
  location?: Location;
  isGenerating: boolean;
  isLoading?: boolean;
  projectId: string;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
}

const SceneDetailPanel = memo(function SceneDetailPanel({
  scene,
  status,
  characters = [],
  location,
  isGenerating,
  isLoading = false,
  projectId,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false,
}: SceneDetailPanelProps) {
  const { toast } = useToast();
  const updateScene = useProjectStore((state) => state.updateScene);
  const setAssets = useAssetStore((state) => state.setAssets);
  // Select the real action — Zustand action references are stable (created once
  // in the store factory), so this never causes a spurious re-render or effect fire.
  const addViewedScene = useProjectStore((state) => state.addViewedScene);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [regenerateSceneDialogOpen, setRegenerateSceneDialogOpen] = useState(false);
  const [historyPickerOpen, setHistoryPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState<AssetKey>("scene_start_frame");
  const [frameToRegenerate, setFrameToRegenerate] = useState<"start" | "end" | null>(null);
  const [isGeneratingFrame, setIsGeneratingFrame] = useState(false);

  // Normalized Asset Store Usage
  // No longer derived from props + useEffect
  const { bestAssets: assets, assets: registry } = useSceneAssets(scene.id);

  // Location assets
  const { bestAssets: locationAssets } = useLocationAssets(location?.id ?? null);

  const hasVideo = !!assets['scene_video']?.data;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLocalPlaying, setIsLocalPlaying] = useState(false);

  // Depend on scene.id (stable primitive) rather than assets['scene_video']
  // (always a new object reference from buildAssetAccessors). Using the object
  // reference was causing setIsLocalPlaying(false) to fire every render, which
  // is what triggered "max update depth exceeded".
  useEffect(() => {
    if (videoRef?.current) {
      videoRef.current.load();
      setIsLocalPlaying(false);
    }
  }, [scene.id]);

  // Track viewed scenes for preloading
  useEffect(() => {
    addViewedScene(scene.id);
  }, [scene.id, addViewedScene]);

  const handleLocalPlay = useCallback(() => {
    if (videoRef?.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(err => console.error("Error playing scene video:", err));
      } else {
        videoRef.current.pause();
      }
    }
  }, []);

  const handleRegenerateClick = (frameType: "start" | "end") => {
    setFrameToRegenerate(frameType);
    setDialogOpen(true);
  };

  const handleDeleteAsset = async (assetKey: Extract<AssetKey, "scene_video" | "scene_start_frame" | "scene_end_frame">, current: number) => {
    const previousRegistry = registry; // Save current registry

    // Optimistic update via store
    if (registry && registry[assetKey]) {
      const currentAsset = assets[assetKey];
      const updatedRegistry = {
        ...registry,
        [assetKey]: {
          ...registry[assetKey]!,
          best: 0,
          // Optimistically remove the version from the list so it disappears from history too
          versions: registry[assetKey]!.versions.filter(v => v.data !== currentAsset?.data)
        }
      };
      setAssets(scene.id, updatedRegistry);
    }

    try {
      await patchAsset(scene.id, {
        projectId,
        entityType: 'scene',
        assetKey: assetKey,
        version: null,
      });
      toast({
        title: "Asset Deleted",
        description: `The ${assetKey} has been removed from the scene.`,
        duration: 500,
      });
    } catch (error) {
      // Rollback
      if (previousRegistry) {
        setAssets(scene.id, previousRegistry);
      }
      toast({
        title: "Error",
        description: `Failed to delete asset: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    }
  };

  const handleHistoryClick = (assetKey: Extract<AssetKey, "scene_video" | "scene_start_frame" | "scene_end_frame">) => {
    setPickerType(assetKey);
    setHistoryPickerOpen(true);
  };

  const handleSelectAsset = async (asset: AssetVersion) => {
    const previousRegistry = registry; // Save current registry

    // Optimistic update via store
    if (registry && registry[pickerType]) {
      const updatedRegistry = {
        ...registry,
        [pickerType]: {
          ...registry[pickerType]!,
          best: asset.version,
        }
      };
      setAssets(scene.id, updatedRegistry);
    }

    try {
      await patchAsset(scene.id, {
        projectId,
        entityType: 'scene',
        assetKey: pickerType,
        version: asset.version,
      });
      toast({
        title: "Asset Restored",
        description: `Restored attempt #${asset.version} for ${pickerType}.`,
        duration: 500,
      });
    } catch (error) {
      // Rollback
      if (previousRegistry) {
        setAssets(scene.id, previousRegistry);
      }
      toast({
        title: "Error",
        description: `Failed to restore asset: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    }
  };

  const handleRegenerateSubmit = async (newPrompt: string, originalPrompt: string) => {
    if (!frameToRegenerate) return;
    if (pickerType !== "scene_start_frame" && pickerType !== "scene_end_frame") return;
    setIsGeneratingFrame(true);
    try {
      await regenerateFrame({
        projectId: projectId,
        payload: {
          assetKeys: [pickerType],
          sceneIds: [scene.id],
          promptModifications: [newPrompt],
        }
      });
      toast({
        title: "Frame Regeneration Started",
        description: `The ${frameToRegenerate} frame for scene ${(scene.sceneIndex + 1).toString().padStart(2, '0')} is being regenerated.`,
        duration: 500,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to start frame regeneration: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    } finally {
      setDialogOpen(false);
      setFrameToRegenerate(null);
      setIsGeneratingFrame(false);
    }
  };

  const handleSceneRegenerateSubmit = async (promptModification: string) => {
    updateScene(scene.id, { status: "generating" });
    try {
      await regenerateScene({
        projectId: projectId,
        payload: {
          sceneId: scene.id,
          forceRegenerate: true,
          promptModification,
        },
      });

      toast({
        title: "Scene Regeneration Started",
        description: `Regenerating scene ${scene.id}...`,
        duration: 500,
      });
    } catch (error) {
      console.error("Failed to regenerate scene:", error);
      updateScene(scene.id, { status: "error" });
      toast({
        title: "Error",
        description: `Failed to regenerate scene ${(scene.sceneIndex + 1).toString().padStart(2, '0')}: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    }
  };

  const toggleDialog = () => setDialogOpen(!dialogOpen);

  return (
    <>
      <RegenerateFrameDialog
        scene={scene}
        frameToRegenerate={frameToRegenerate}
        isOpen={dialogOpen}
        onOpenChange={toggleDialog}
        onSubmit={handleRegenerateSubmit}
      />
      <RegenerateSceneDialog
        scene={scene}
        isOpen={regenerateSceneDialogOpen}
        onOpenChange={setRegenerateSceneDialogOpen}
        onSubmit={handleSceneRegenerateSubmit}
      />
      <AssetHistoryPicker
        entityId={scene.id}
        entityType="scene"
        assetType={pickerType}
        projectId={projectId}
        isOpen={historyPickerOpen}
        onOpenChange={setHistoryPickerOpen}
        onSelect={handleSelectAsset}
        currentUrl={
          assets[pickerType]?.data
        }
      />
      <div className="h-full w-full flex flex-col" data-testid={`panel-scene-detail-${scene.id}`}>
        <div className="p-4 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {isLoading ? (
              <Skeleton className="h-5 w-12 " />
            ) : (
              <>
                <div className="h-10 w-10  bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="font-mono text-sm">{`${(scene.sceneIndex + 1).toString().padStart(2, '0')}`}</span>
                </div>
              </>
            )}
            {isLoading ? (
              <Skeleton className="h-6 w-1/2" />
            ) : (
              <>
                <h2 className="truncate">{scene.name}</h2>
              </>
            )}
            {isLoading ? <Skeleton className="h-5 w-16" /> : <StatusBadge status={status} />}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isLoading ? (
              <Skeleton className="h-8 w-8" />
            ) : (
              // Regenerate button moved to video player overlay
              <></>
            )}
            {(hasPrevious || hasNext) &&
              <>
                <Button
                  size="icon"
                  onClick={onPrevious}
                  disabled={!hasPrevious || isLoading}
                  title="Previous Scene"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  onClick={onNext}
                  disabled={!hasNext || isLoading}
                  title="Next Scene"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            }
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FramePreview
                title="Start"
                imageUrl={resolvePublicUrl(assets['scene_start_frame']?.data)}
                alt="Start frame"
                isLoading={isLoading}
                onRegenerate={() => handleRegenerateClick("start")}
                onDelete={() => handleDeleteAsset("scene_start_frame", assets["scene_start_frame"]?.version || 0)}
                onHistory={() => handleHistoryClick("scene_start_frame")}
                isGenerating={isGeneratingFrame}
                priority={true}
              />
              <FramePreview
                title="End"
                imageUrl={resolvePublicUrl(assets["scene_end_frame"]?.data)}
                alt="End frame"
                isLoading={isLoading}
                onRegenerate={() => handleRegenerateClick("end")}
                onDelete={() => handleDeleteAsset("scene_end_frame", assets["scene_end_frame"]?.version || 0)}
                onHistory={() => handleHistoryClick("scene_end_frame")}
                isGenerating={isGeneratingFrame}
                priority={true}
              />
            </div>

            {isLoading ? (
              <div>
                <Skeleton className="w-full aspect-[16/8] bg-muted " />
              </div>
            ) : (
              <div>
                <CardContent className="p-3 relative">
                  {isGenerating && (
                    <div className="absolute inset-3 flex items-center justify-center bg-background/80  z-10 ">
                      <div className="flex items-center gap-2  text-muted-foreground">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>{scene.progressMessage || "Generating scene..."}</span>
                      </div>
                    </div>
                  )}
                  <div
                    className="aspect-[16/8] bg-muted  overflow-hidden"
                  // This container's existence is now independent of hasVideo,
                  // ensuring a consistent layout space for the video/placeholder/overlay.
                  >
                    {hasVideo && (
                      <VideoPlayer
                        ref={videoRef}
                        key={`scene_video_${scene.id}`}
                        src={resolvePublicUrl(assets['scene_video']?.data)}
                        className={`w-full h-full object-cover`}
                      />
                    )}
                    {/* Show placeholder only when there's no video to display and we are not generating */}
                    {!hasVideo && !isGenerating && (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  {/* Video Controls Overlay */}
                  <div className="absolute top-3 right-3 flex gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 bg-background/50 hover:bg-background/80 " onClick={() => handleHistoryClick("scene_video")}>
                          <History className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View History</TooltipContent>
                    </Tooltip>
                    {(
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={!hasVideo} className="h-8 w-8 bg-background/50 hover:bg-background/80 hover:text-destructive " onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Are you sure you want to delete this video?")) {
                              handleDeleteAsset("scene_video", assets['scene_video']?.version || 0);
                            }
                          }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete Video</TooltipContent>
                      </Tooltip>
                    )}
                    {!isGenerating && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            className="h-8 w-8 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white hover:opacity-90 transition-opacity shadow-sm"
                            onClick={() => setRegenerateSceneDialogOpen(true)}
                            data-testid="button-regenerate"
                          >
                            <RefreshCw className="h-4 w-4" />
                            <span className="sr-only">Regenerate Scene</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Regenerate Scene</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </CardContent>
              </div>
            )}

            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full grid grid-cols-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger
                      value="details"
                    >Details</TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent>View scene technical details</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger value="quality" data-testid="tab-quality">Quality</TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent>View quality evaluation metrics</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger value="prompt" data-testid="tab-prompt">Prompt</TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent>View generation prompt</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger value="continuity" data-testid="tab-continuity">Continuity</TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent>View continuity analysis</TooltipContent>
                </Tooltip>
              </TabsList>

              <TabsContent value="details" className="mt-4 space-y-4">
                <Card>
                  <CardContent className="p-3">
                    {isLoading ? <Skeleton className="h-10 w-full" /> : <p className="font-medium text-muted-foreground">{assets['scene_description']?.data}</p>}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 ">
                      <Camera className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Camera:</span>
                      <span className="font-medium ml-auto">{isLoading ? <Skeleton className="h-4 w-20" /> : scene.shotType}</span>
                    </div>
                    <div className="flex items-center gap-2 ">
                      <Video className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Movement:</span>
                      <span className="font-medium ml-auto">{isLoading ? <Skeleton className="h-4 w-20" /> : scene.cameraMovement}</span>
                    </div>
                    <div className="flex items-center gap-2 ">
                      <Sun className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Lighting:</span>
                      <span className="font-medium ml-auto">{isLoading ? <Skeleton className="h-4 w-20" /> : scene.lighting.quality.hardness}</span>
                    </div>
                    <div className="flex items-center gap-2 ">
                      <Music className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Audio Sync:</span>
                      <span className="font-medium ml-auto">{isLoading ? <Skeleton className="h-4 w-20" /> : scene.audioSync}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="font-medium ml-auto">{isLoading ? <Skeleton className="h-4 w-12 inline-block" /> : scene.duration}s</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Time:</span>
                      <span className="font-medium ml-auto">{isLoading ? <Skeleton className="h-4 w-32 inline-block" /> : `${scene.startTime.toFixed(1)}s - ${scene.endTime.toFixed(1)}s`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Transition:</span>
                      <span className="font-medium ml-auto">{isLoading ? <Skeleton className="h-4 w-24 inline-block" /> : scene.transitionType}</span>
                    </div>
                  </div>
                </div>

                <Card>
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className=" font-medium text-muted-foreground  ">Mood</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    {isLoading ? <Skeleton className="h-10 w-full" /> : <p className="">{scene.mood}</p>}
                  </CardContent>
                </Card>

                {scene.lyrics && (
                  <Card>
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className=" font-medium text-muted-foreground  ">Lyrics</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      {isLoading ? <Skeleton className="h-8 w-full" /> : <p className=" italic">"{scene.lyrics}"</p>}
                    </CardContent>
                  </Card>
                )}

                {location && (
                  <Card>
                    <CardHeader className="p-3 pb-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <CardTitle className=" font-medium">{isLoading ? <Skeleton className="h-4 w-32" /> : location.name}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      {isLoading ? <Skeleton className="h-4 w-full" /> : <p className=" text-muted-foreground">{locationAssets['location_description']?.data}</p>}
                    </CardContent>
                  </Card>
                )}

                {characters.length > 0 && (
                  <Card>
                    <CardHeader className="p-3 pb-2">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <CardTitle className=" font-medium">Characters</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      {isLoading ? (
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-16 " />)}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {characters.map((char) => (
                            <Badge key={char.id} variant="secondary">{char.name}</Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="quality" className="mt-4">
                {isLoading ? (
                  <Card>
                    <CardHeader className="p-3 pb-2">
                      <Skeleton className="h-4 w-40" />
                    </CardHeader>
                    <CardContent className="p-6 text-center text-muted-foreground">
                      <Skeleton className="h-8 w-full mb-2" />
                      <Skeleton className="h-4 w-2/3 mx-auto" />
                    </CardContent>
                  </Card>
                ) : assets['scene_video']?.metadata.evaluation ? (
                  <QualityEvaluationPanel evaluation={assets['scene_video']?.metadata.evaluation} sceneId={scene.id} />
                ) : (
                  <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                      No quality evaluation available yet
                    </CardContent>
                  </Card>
                )}
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
                    {isLoading ? (
                      <Skeleton className="h-24 w-full" />
                    ) : assets['scene_prompt']?.data ? (
                      <p className=" font-mono whitespace-pre-wrap text-xs text-muted-foreground p-3 ">
                        {assets['scene_prompt'].data}
                      </p>
                    ) : (
                      <p className=" text-muted-foreground">No enhanced prompt generated yet</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="continuity" className="mt-4 space-y-4">
                <Card>
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className=" font-medium">Continuity Notes</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    {isLoading ? (
                      <ul className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => <li key={i} className=" text-muted-foreground flex items-start gap-2"><span className="text-muted-foreground/50">•</span><Skeleton className="h-3 w-full" /></li>)}
                      </ul>
                    ) : scene.continuityNotes.length > 0 ? (
                      <ul className="space-y-1">
                        {scene.continuityNotes.map((note, idx) => (
                          <li key={idx} className=" text-muted-foreground flex items-start gap-2">
                            <span className="text-muted-foreground/50">•</span>
                            {note}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className=" text-muted-foreground">No continuity notes</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className=" font-medium">Audio Details</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 space-y-2">
                    {isLoading ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between "><span className="text-muted-foreground">Type:</span><Skeleton className="h-5 w-16" /></div>
                        <div className="flex items-center justify-between "><span className="text-muted-foreground">Intensity:</span><Skeleton className="h-5 w-16" /></div>
                        <div className="flex items-center justify-between "><span className="text-muted-foreground">Tempo:</span><Skeleton className="h-5 w-16" /></div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between ">
                          <span className="text-muted-foreground">Type:</span>
                          <Badge>{scene.type}</Badge>
                        </div>
                        <div className="flex items-center justify-between ">
                          <span className="text-muted-foreground">Intensity:</span>
                          <Badge>{scene.intensity}</Badge>
                        </div>
                        <div className="flex items-center justify-between ">
                          <span className="text-muted-foreground">Tempo:</span>
                          <Badge>{scene.tempo}</Badge>
                        </div>
                      </>
                    )}
                    {isLoading ? (
                      <div className="pt-2 "><span className=" text-muted-foreground">Music Change:</span><Skeleton className="h-4 w-48 mt-1" /></div>
                    ) : (
                      scene.musicChange && (
                        <div className="pt-2 ">
                          <span className=" text-muted-foreground">Music Change:</span>
                          <p className=" mt-1">{scene.musicChange}</p>
                        </div>
                      )
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
});

export default SceneDetailPanel;