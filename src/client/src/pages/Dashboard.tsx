import { useShallow } from 'zustand/shallow';
import { useEffect, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs.js";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.js";
import { ScrollArea } from "#/components/ui/scroll-area.js";
import { Button } from "#/components/ui/button.js";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "#/components/ui/resizable.js";
import {
  Film,
  Users,
  MapPin,
  BarChart3,
  MessageSquare,
  Zap,
  Clock,
  RefreshCw,
  CheckCircle,
  Bug
} from "lucide-react";
import { getAllBestAssets, getAssetUrl } from "../../../shared/utils/assets-utils.js";
import { resolvePublicUrl } from "../../../shared/utils/utils.js";
import PipelineHeader from "#/components/PipelineHeader.js";
import SceneCard from "#/components/SceneCard.js";
import SceneDetailPanel from "#/components/SceneDetailPanel.js";
import Timeline from "#/components/Timeline.js";
import PlaybackControls from "#/components/PlaybackControls.js";
import MessageLog from "#/components/MessageLog.js";
import CharacterCard from "#/components/CharacterCard.js";
import LocationCard from "#/components/LocationCard.js";
import CharacterDetailPanel from "#/components/CharacterDetailPanel.js";
import LocationDetailPanel from "#/components/LocationDetailPanel.js";
import MetricCard from "#/components/MetricCard.js";
import DebugStatePanel from "#/components/DebugStatePanel.js";
import { usePipelineEvents } from "#/hooks/use-pipeline-events.js";
import { useProjectAssets, useSceneAssets, useStore } from "#/lib/store.js";
import {
    selectCurrentCharacter,
    selectCurrentLocation,
    selectSelectedCharacterId,
    selectSelectedLocationId
} from "#/lib/store.js";
import { getSceneAssets, regenerateScene, resumePipeline, startPipeline, stopPipeline } from "#/lib/api.js";
import { Skeleton } from "#/components/ui/skeleton.js";
import { useMediaPreloader } from "#/hooks/use-media-preloader.js";
import MetricsPanel from "#/components/MetricsPanel.js";
import { useStoreWithEqualityFn } from 'zustand/traditional';



const SCENE_SKELETONS = Array.from({ length: 6 }).map((_, i) => (
  <SceneCard key={i} scene={{} as any} status="pending" isLoading={true} />
));

const CHARACTER_SKELETONS = Array.from({ length: 4 }).map((_, i) => (
  <CharacterCard key={i} character={{} as any} onSelect={() => { }} isLoading={true} />
));

const LOCATION_SKELETONS = Array.from({ length: 6 }).map((_, i) => (
  <LocationCard key={i} location={{} as any} onSelect={() => { }} isLoading={true} />
));

const METRIC_SKELETONS = (
  <>
    <MetricCard label="" value="" subValue="" isLoading={true} />
    <MetricCard label="" value="" subValue="" isLoading={true} />
    <MetricCard label="" value="" subValue="" isLoading={true} />
    <MetricCard label="" value="" subValue="" isLoading={true} />
  </>
);

const DETAIL_LOADING_SKELETON = (
  <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
    <Skeleton className="w-12 h-12 mb-4 " />
    <Skeleton className="h-4 w-48" />
  </div>
);

const DETAIL_EMPTY_STATE = (
  <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
    <p className=" text-center">Select a scene to view details</p>
  </div>
);

export default function Dashboard() {
  // --------------------------------------------------------------------------
  // STORE — narrow selectors, one subscription per logical slice.
  // subscribeWithSelector is already on the store; each useStore(selector) call
  // re-renders this component ONLY when that selector's output changes.
  // --------------------------------------------------------------------------

  // --- project & pipeline state-------------------------------------------
  const selectedProject = useStore((s) => s.selectedProject);
  const project = useStore((s) => s.project);
  const projectStatus = useStore((s) => s.projectStatus);
  const isLoading = useStore((s) => s.isLoading);
  const setProjectStatus = useStore((s) => s.setProjectStatus);
  const assets = useStore((s) => s.assets);
  // --- UI state -----------------------------------------------------------
  const isDark = useStore((s) => s.isDark);
  const setIsDark = useStore((s) => s.setIsDark);
  const selectedSceneIndex = useStore((s) => s.selectedSceneIndex);
  const setSelectedSceneIndex = useStore((s) => s.setSelectedSceneIndex);
    const selectedCharacterId = useStore(selectSelectedCharacterId);
    const setSelectedCharacterId = useStore((s) => s.setSelectedCharacterId);
    const selectedLocationId = useStore(selectSelectedLocationId);
    const setSelectedLocationId = useStore((s) => s.setSelectedLocationId);

  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const currentPlaybackTime = useStore((s) => s.currentPlaybackTime);
  const setCurrentPlaybackTime = useStore((s) => s.setCurrentPlaybackTime);
  const isPlaying = useStore((s) => s.isPlaying);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const interruptState = useStore((s) => s.interruptState);
  const setInterruptState = useStore((s) => s.setInterruptState);

  // --- messages -----------------------------------------------------------
  const messages = useStore((s) => s.messages);
  const addMessage = useStore((s) => s.addMessage);
  const clearMessages = useStore((s) => s.clearMessages);
  const removeMessage = useStore((s) => s.removeMessage);

  // --- actions ------------------------------------------------------------
  const resetDashboard = useStore((s) => s.resetDashboard);
  const updateSceneClientSide = useStore((s) => s.updateSceneClientSide);

  // --------------------------------------------------------------------------
  // DERIVED STATE — selectors that compute from multiple store slices.
  // `useShallow` prevents re-render when the output array/object is structurally
  // identical to the previous one, even though .map() produces new refs.
  // --------------------------------------------------------------------------

  /**
   * Scene list with video - aware status.
   * Reads project.scenes AND assets.get(sceneId) in one pass so it correctly
    * re - derives whenever either the scene list or any scene's asset registry
      * changes.
   */
  const currentScenesMap = useStoreWithEqualityFn(
    useStore,
    (s) => {
      if (!s.project?.scenes) return null;

      const map = new Map<string, typeof s.project.scenes[0] & { status: string; }>();
      s.project.scenes.forEach((scene) => {
        const registry = s.assets.get(scene.id);
        const hasVideo = !!getAssetUrl(registry, "scene_video");
        const status = hasVideo ? "complete" : scene.status || "pending";
        map.set(scene.id, { ...scene, status });
      });
      return map;
    },
    scenesMapEqual
  );

  const currentScenes = currentScenesMap
    ? Array.from(currentScenesMap.values())
    : [];

  /** Characters & locations — direct reads, no derivation needed. */
  const currentCharacters = useStore(useShallow((s) => s.project?.characters ?? []));
  const currentLocations = useStore(useShallow((s) => s.project?.locations ?? []));

  /** Project-level metadata & metrics — simple property reads. */
  const currentMetadata = useStore(useShallow((s) => s.project?.metadata));
  const currentMetrics = useStore(useShallow((s) => s.project?.metrics));

  // --------------------------------------------------------------------------
  // ASSET HOOKS — use the store-provided hooks, never read .assets on entities.
  // --------------------------------------------------------------------------

  const { getAssetUrl: getProjectAssetUrl } = useProjectAssets();
  const currentVideoSrc = resolvePublicUrl(getProjectAssetUrl("render_video"));

  // --------------------------------------------------------------------------
  // SIMPLE DERIVATIONS — no useMemo needed; these are single property lookups
  // on values that are already stable from their selectors.
  // --------------------------------------------------------------------------

  const audioGcsUri = project?.metadata?.audioGcsUri;
  const initialPrompt = project?.metadata?.initialPrompt;

  /** "Loading" means the network request is in-flight AND we have no project yet. */
  const clientIsLoading = isLoading && !project;

  /**
   * Selected scene + its related characters/location.
   * Derived inline — the upstream arrays (currentScenes, currentCharacters,
   * currentLocations) are already selector-stable, so .find() here is O(n)
   * on small arrays and doesn't warrant useMemo.
   */
  const selectedScene = currentScenes.find((s) => s.sceneIndex === selectedSceneIndex) ?? null;

  const selectedSceneCharacters = selectedScene
    ? currentCharacters.filter((c) => selectedScene.characterIds.includes(c.id))
    : [];

  const selectedSceneLocation = selectedScene
    ? currentLocations.find((l) => l.id === selectedScene.locationId)
    : undefined;

  /**
   * The scene whose time-range contains the current playback cursor.
   * Used by the preloader to know what to prefetch next.
   */
  const activeTimebarScene =
    currentScenes.find(
      (s) => currentPlaybackTime >= s.startTime && currentPlaybackTime < s.endTime
    ) ?? null;

  /**
   * Playback offset: if we have a render_video, seek to the active scene's
   * start time; otherwise 0.  Reads the video URL from the project asset hook
   * — never from project.assets directly.
   */
  const playbackOffset = currentVideoSrc ? (activeTimebarScene?.startTime ?? 0) : 0;

  // --------------------------------------------------------------------------
  // HOOKS
  // --------------------------------------------------------------------------

  usePipelineEvents({ projectId: selectedProject });
  useMediaPreloader(currentScenes, activeTimebarScene?.id ?? selectedScene?.id ?? undefined);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const handleStartPipeline = useCallback(async () => {
    if (!selectedProject) {
      console.error("Cannot start pipeline: missing project.");
      return;
    }
    if (!initialPrompt) {
      console.error("Cannot start pipeline: missing creative prompt.");
      return;
    }
    try {
      setProjectStatus("analyzing");
      await startPipeline({
        projectId: selectedProject,
        payload: {
          audioGcsUri,
          initialPrompt
        },
      });
    } catch (error) {
      console.error("Failed to start pipeline:", error);
      addMessage({ id: Date.now().toString(), type: "error", message: `Failed to start pipeline: ${(error as Error).message}`, timestamp: new Date() });
      setProjectStatus("error");
    }
  }, [selectedProject, audioGcsUri, initialPrompt, setProjectStatus, addMessage]);

  const handleStopPipeline = useCallback(async () => {
    if (!selectedProject) {
      console.error("Cannot stop pipeline: no project selected.");
      return;
    }
    try {
      await stopPipeline({ projectId: selectedProject });
      setProjectStatus("ready");
      addMessage({ id: Date.now().toString(), type: "info", message: "Pipeline stop command issued.", timestamp: new Date() });
    } catch (error) {
      console.error("Failed to stop pipeline:", error);
      addMessage({ id: Date.now().toString(), type: "error", message: `Failed to stop pipeline: ${(error as Error).message}`, timestamp: new Date() });
    }
  }, [selectedProject, setProjectStatus, addMessage]);

  const handleResume = useCallback(async () => {
    if (!selectedProject) return;
    setProjectStatus("analyzing");

    interruptState?.type === "user_approval" ?
      await resumePipeline({ projectId: selectedProject, payload: { resumeValue: true } }) :
      await resumePipeline({ projectId: selectedProject, payload: {} });
      
    setInterruptState(null);
  }, [selectedProject, setProjectStatus, interruptState, setInterruptState]);

  const handlePause = useCallback(() => setProjectStatus("paused"), [setProjectStatus]);

  const handleResetDashboard = useCallback(() => {
    resetDashboard();
    clearMessages();
  }, [resetDashboard, clearMessages]);

  const handleDismissMessage = useCallback((id: string) => removeMessage(id), [removeMessage]);
  const handleClearMessages = useCallback(() => clearMessages(), [clearMessages]);

  const handleRegenerateScene = useCallback(async (promptModification: string) => {
    if (!selectedProject || !selectedScene) return;
    updateSceneClientSide(selectedScene.id, { status: "generating" });

    try {
      await regenerateScene({
        projectId: selectedProject,
        payload: {
          sceneId: selectedScene.id,
          forceRegenerate: true,
          promptModification,
        },
      });

      addMessage({
        id: Date.now().toString(),
        type: "info",
        message: `Regenerating scene ${selectedScene.id}...`,
        timestamp: new Date()
      });
    } catch (error) {
      console.error("Failed to regenerate scene:", error);
      updateSceneClientSide(selectedScene.id, { status: "error" });
      addMessage({
        id: Date.now().toString(),
        type: "error",
        message: `Failed to regenerate scene ${selectedScene.id}: ${(error as Error).message}`,
        timestamp: new Date()
      });
    }
  }, [selectedProject, selectedScene, updateSceneClientSide, addMessage]);

  const handleSceneSelect = useCallback((sceneIndex: number) => {
    setSelectedSceneIndex(sceneIndex);
    const sceneToSeek = currentScenes.find(s => s.sceneIndex === sceneIndex);
    if (sceneToSeek) setCurrentPlaybackTime(sceneToSeek.startTime);
  }, [setSelectedSceneIndex, setCurrentPlaybackTime, currentScenes]);

  const handlePlayScene = useCallback((sceneIndex: number) => {
    console.log("Play scene ", sceneIndex);
  }, []);

  const handleCharacterSelect = useCallback((characterId: string) => {
      setSelectedCharacterId(characterId);
  }, [ setSelectedCharacterId ]);

  const handleLocationSelect = useCallback((locationId: string) => {
      setSelectedLocationId(locationId);
  }, [ setSelectedLocationId ]);

    // Navigation Handlers
    const handleNextCharacter = useCallback(() => {
        if (!selectedCharacterId) return;
        const currentIndex = currentCharacters.findIndex(c => c.id === selectedCharacterId);
        if (currentIndex < currentCharacters.length - 1) {
            setSelectedCharacterId(currentCharacters[ currentIndex + 1 ].id);
        }
    }, [ selectedCharacterId, currentCharacters, setSelectedCharacterId ]);

    const handlePrevCharacter = useCallback(() => {
        if (!selectedCharacterId) return;
        const currentIndex = currentCharacters.findIndex(c => c.id === selectedCharacterId);
        if (currentIndex > 0) {
            setSelectedCharacterId(currentCharacters[ currentIndex - 1 ].id);
        }
    }, [ selectedCharacterId, currentCharacters, setSelectedCharacterId ]);

    const handleNextLocation = useCallback(() => {
        if (!selectedLocationId) return;
        const currentIndex = currentLocations.findIndex(l => l.id === selectedLocationId);
        if (currentIndex < currentLocations.length - 1) {
            setSelectedLocationId(currentLocations[ currentIndex + 1 ].id);
        }
    }, [ selectedLocationId, currentLocations, setSelectedLocationId ]);

    const handlePrevLocation = useCallback(() => {
        if (!selectedLocationId) return;
        const currentIndex = currentLocations.findIndex(l => l.id === selectedLocationId);
        if (currentIndex > 0) {
            setSelectedLocationId(currentLocations[ currentIndex - 1 ].id);
        }
    }, [ selectedLocationId, currentLocations, setSelectedLocationId ]);

  const handleNextScene = useCallback(() => {
    if (selectedSceneIndex === null || selectedSceneIndex === undefined) return;
    // Find next index
    const nextIndex = selectedSceneIndex + 1;
    // Check if exists in currentScenes (assuming contiguous indices for simplicity, but robustness is better)
    // A safer way is to find the index in the currentScenes array and go to next array element
    const currentArrayIdx = currentScenes.findIndex(s => s.sceneIndex === selectedSceneIndex);
    if (currentArrayIdx !== -1 && currentArrayIdx < currentScenes.length - 1) {
      const nextScene = currentScenes[ currentArrayIdx + 1 ];
      handleSceneSelect(nextScene.sceneIndex);
    }
  }, [ selectedSceneIndex, currentScenes, handleSceneSelect ]);

  const handlePrevScene = useCallback(() => {
    if (selectedSceneIndex === null || selectedSceneIndex === undefined) return;
    const currentArrayIdx = currentScenes.findIndex(s => s.sceneIndex === selectedSceneIndex);
    if (currentArrayIdx > 0) {
      const prevScene = currentScenes[ currentArrayIdx - 1 ];
      handleSceneSelect(prevScene.sceneIndex);
    }
  }, [ selectedSceneIndex, currentScenes, handleSceneSelect ]);

    const selectedCharacter = useStore(selectCurrentCharacter);
    const selectedLocation = useStore(selectCurrentLocation);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* ------------------------------------------------------------------ */}
      {/* HEADER                                                              */}
      {/* ------------------------------------------------------------------ */}
      <PipelineHeader
        title={clientIsLoading ? "Loading..." : currentMetadata?.title || ""}
        handleStart={handleStartPipeline}
        handleStop={handleStopPipeline}
        handleResume={handleResume}
        onPause={handlePause}
        handleResetDashboard={handleResetDashboard}
      />

      {/* ------------------------------------------------------------------ */}
      {/* BODY — two-column resizable layout                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* -------------------------------------------------------------- */}
          {/* LEFT PANEL — timeline + tabbed content                          */}
          {/* -------------------------------------------------------------- */}
          <ResizablePanel defaultSize={65} minSize={40}>
            <div className="h-full flex flex-col">
              {/* Timeline + playback controls */}
              <div className="p-4 pb-2  shrink-0 space-y-3">
                <Timeline
                  scenes={currentScenes}
                  selectedSceneIndex={selectedSceneIndex ?? undefined}
                  totalDuration={currentMetadata?.duration || 0}
                  onSceneSelect={handleSceneSelect}
                  isLoading={clientIsLoading}
                  isPlaying={isPlaying}
                  currentTime={currentPlaybackTime}
                />
                <PlaybackControls
                  scenes={currentScenes}
                  totalDuration={currentMetadata?.duration || 0}
                  videoSrc={currentVideoSrc}
                  playbackOffset={playbackOffset}
                  onTimeUpdate={setCurrentPlaybackTime}
                  isLoading={clientIsLoading}
                  isPlaying={isPlaying}
                  setIsPlaying={setIsPlaying}
                  selectedSceneIndex={selectedSceneIndex ?? undefined}
                />
              </div>

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 pt-3 text-sm shrink-0">
                  <TabsList className=" bg-muted/50 p-1 h-9">
                    <TabsTrigger 
                      value="scenes" 
                      data-testid="tab-scenes"
                      className="  font-mono     data-[state=active]:bg-background data-[state=active]:"
                    >
                      Scenes
                    </TabsTrigger>
                    <TabsTrigger 
                      value="characters" 
                      data-testid="tab-characters"
                      className="  font-mono     data-[state=active]:bg-background data-[state=active]:"
                    >
                      Characters
                    </TabsTrigger>
                    <TabsTrigger 
                      value="locations" 
                      data-testid="tab-locations"
                      className="  font-mono     data-[state=active]:bg-background data-[state=active]:"
                    >
                      Locations
                    </TabsTrigger>
                    <TabsTrigger 
                      value="metrics" 
                      data-testid="tab-metrics"
                      className="  font-mono     data-[state=active]:bg-background data-[state=active]:"
                    >
                      Metrics
                    </TabsTrigger>
                    <TabsTrigger 
                      value="logs" 
                      data-testid="tab-logs"
                      className="  font-mono     data-[state=active]:bg-background data-[state=active]:"
                    >
                      Logs
                      <div className="relative">
                        <MessageSquare className="absolute top-0 right-0 w-3.5 h-3.5">
                          { messages.length > 0 && (
                            <span className="absolute top-0 right-0 bg-primary text-primary-foreground px-1.5 font-mono">
                              { messages.length }
                            </span>
                          ) }
                        </MessageSquare>
                      </div>
                    </TabsTrigger>
                    {import.meta.env.MODE === "development" && (
                      <TabsTrigger 
                        value="debug" 
                        data-testid="tab-debug"
                        className="  font-mono     data-[state=active]:bg-background data-[state=active]:"
                      >
                        Debug
                      </TabsTrigger>
                    )}
                  </TabsList>
                </div>

                {/* -------------------------------------------------------- */}
                {/* SCENES TAB                                                */}
                {/* -------------------------------------------------------- */}
                <TabsContent value="scenes" className="flex-1 overflow-hidden mt-0 p-3">
                  <ScrollArea className="h-full">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 p-1 pb-4">
                      {clientIsLoading && SCENE_SKELETONS}
                      {!clientIsLoading &&
                        (currentScenes.length ? (
                          currentScenes.map((scene, index) => (
                            <SceneCard
                              key={scene.id}
                              scene={scene}
                              status={scene.status}
                              isSelected={scene.sceneIndex === selectedSceneIndex}
                              onSelect={handleSceneSelect}
                              onPlay={handlePlayScene}
                              isLoading={false}
                              priority={index < 6}
                            />
                          ))
                        ) : (
                          <div className=" text-muted-foreground px-4">
                            No scenes have been created yet
                          </div>
                        ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* -------------------------------------------------------- */}
                {/* CHARACTERS TAB                                            */}
                {/* -------------------------------------------------------- */}
                <TabsContent value="characters" className="flex-1 overflow-hidden mt-0 p-4">
                  <ScrollArea className="h-full">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
                      {clientIsLoading && CHARACTER_SKELETONS}
                      {!clientIsLoading &&
                        (currentCharacters.length ? (
                          currentCharacters.map((char, index) => (
                            <CharacterCard
                              key={char.id}
                              character={char}
                              onSelect={handleCharacterSelect}
                              isLoading={false}
                              priority={index < 8}
                                  isSelected={ char.id === selectedCharacterId }
                            />
                          ))
                        ) : (
                          <div className=" text-muted-foreground px-4">
                            No characters have been created yet
                          </div>
                        ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* -------------------------------------------------------- */}
                {/* LOCATIONS TAB                                             */}
                {/* -------------------------------------------------------- */}
                <TabsContent value="locations" className="flex-1 overflow-hidden mt-0 p-4">
                  <ScrollArea className="h-full">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pb-4">
                      {clientIsLoading && LOCATION_SKELETONS}
                      {!clientIsLoading &&
                        (currentLocations.length ? (
                          currentLocations.map((loc, index) => (
                            <LocationCard
                              key={loc.id}
                              location={loc}
                              onSelect={handleLocationSelect}
                              isLoading={false}
                              priority={index < 6}
                                  isSelected={ loc.id === selectedLocationId }
                            />
                          ))
                        ) : (
                          <div className=" text-muted-foreground px-4">
                            No locations have been created yet
                          </div>
                        ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* -------------------------------------------------------- */}
                {/* METRICS TAB                                               */}
                {/* -------------------------------------------------------- */}
                <TabsContent value="metrics" className="flex-1 overflow-hidden mt-0">
                  <MetricsPanel
                    scenes={currentScenes}
                    metrics={currentMetrics}
                    selectedSceneId={selectedScene?.id}
                    isLoading={clientIsLoading}
                  />
                </TabsContent>

                {/* -------------------------------------------------------- */}
                {/* LOGS TAB                                                  */}
                {/* -------------------------------------------------------- */}
                <TabsContent value="logs" className="flex-1 overflow-hidden mt-0 p-4">
                  <Card className="h-full">
                    <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2">
                      <CardTitle className=" font-semibold">Pipeline Messages</CardTitle>
                      <Button size="sm" variant="ghost" onClick={handleClearMessages} data-testid="button-clear-logs">
                        Clear
                      </Button>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <MessageLog
                        messages={messages}
                        maxHeight="calc(100vh - 28rem)"
                        onDismiss={handleDismissMessage}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* -------------------------------------------------------- */}
                {/* DEBUG TAB (dev only)                                      */}
                {/* -------------------------------------------------------- */}
                {import.meta.env.DEV && (
                  <TabsContent value="debug" className="flex-1 overflow-hidden mt-0">
                    <DebugStatePanel />
                  </TabsContent>
                )}
              </Tabs>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* -------------------------------------------------------------- */}
          {/* RIGHT PANEL — scene detail                                      */}
          {/* -------------------------------------------------------------- */}
          <ResizablePanel defaultSize={35} minSize={25}>
                      { selectedCharacter ? (
                          <CharacterDetailPanel
                              character={ selectedCharacter }
                              projectId={ selectedProject! }
                              isLoading={ clientIsLoading }
                              onNext={ handleNextCharacter }
                              onPrevious={ handlePrevCharacter }
                              hasNext={ currentCharacters.findIndex(c => c.id === selectedCharacter?.id) < currentCharacters.length - 1 }
                              hasPrevious={ currentCharacters.findIndex(c => c.id === selectedCharacter?.id) > 0 }
                          />
                      ) : selectedLocation ? (
                          <LocationDetailPanel
                              location={ selectedLocation }
                              projectId={ selectedProject! }
                              isLoading={ clientIsLoading }
                              onNext={ handleNextLocation }
                              onPrevious={ handlePrevLocation }
                              hasNext={ currentLocations.findIndex(l => l.id === selectedLocation?.id) < currentLocations.length - 1 }
                              hasPrevious={ currentLocations.findIndex(l => l.id === selectedLocation?.id) > 0 }
                          />
                      ) : selectedScene ? (
              <SceneDetailPanel
                projectId={selectedProject!}
                scene={selectedScene}
                status={selectedScene.status}
                characters={selectedSceneCharacters}
                location={selectedSceneLocation}
                isLoading={clientIsLoading}
                isGenerating={
                  selectedScene.status === "generating" || selectedScene.status === "evaluating"
                }
                    onNext={ handleNextScene }
                    onPrevious={ handlePrevScene }
                    hasNext={ !!selectedScene && currentScenes.findIndex(s => s.sceneIndex === selectedSceneIndex) < currentScenes.length - 1 }
                    hasPrevious={ !!selectedScene && currentScenes.findIndex(s => s.sceneIndex === selectedSceneIndex) > 0 }
              />
            ) : clientIsLoading ? (
              DETAIL_LOADING_SKELETON
            ) : (
              DETAIL_EMPTY_STATE
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function scenesMapEqual(
  a: Map<string, any> | null,
  b: Map<string, any> | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.size !== b.size) return false;

  for (const [id, sceneA] of a.entries()) {
    const sceneB = b.get(id);
    if (!sceneB) return false;
    // Only compare fields that actually change when assets update
    if (sceneA.status !== sceneB.status) return false;
    if (sceneA.sceneIndex !== sceneB.sceneIndex) return false;
  }

  return true;
}
