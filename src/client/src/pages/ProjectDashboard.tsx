import { useShallow } from 'zustand/shallow';
import { useEffect, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#client/components/ui/tabs.js";
import { ScrollArea } from "#client/components/ui/scroll-area.js";
import { cn } from "#client/lib/utils.js";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "#client/components/ui/resizable.js";
import {
  Film,
  Users,
  MapPin,
  BarChart3,
  Zap,
  Clock,
  RefreshCw,
  CheckCircle,
  Bug
} from "lucide-react";
import { getAssetUrl } from "../../../shared/utils/assets-utils.js";
import { resolvePublicUrl } from "../../../shared/utils/utils.js";
import DashboardToolbar from "#client/components/DashboardToolbar.js";
import SceneCard from "#client/components/SceneCard.js";
import Timeline from "#client/components/Timeline.js";
import PlaybackControls from "#client/components/PlaybackControls.js";
import CharacterCard from "#client/components/CharacterCard.js";
import { DetailDrawer } from "#client/components/DetailDrawer.js";
import LocationCard from "#client/components/LocationCard.js";
import MetricCard from "#client/components/MetricCard.js";
import DebugStatePanel from "#client/components/DebugStatePanel.js";
import { useState } from "react";
import { usePipelineEvents } from "#client/hooks/usePipelineEvents.js";
import { useProjectStore, selectCurrentCharacter, selectCurrentLocation } from "../store/useProjectStore.js";
import { useAssetStore, useProjectAssets } from "../store/useAssetStore.js";
import { usePipelineStore } from "../store/usePipelineStore.js";
import { useCanvasUIStore } from "../store/useCanvasUIStore.js";
import { selectMessagesSidebarOpen, useUIMenuStore } from "../store/useUIMenuStore.js";
import { useAuth } from "../lib/auth-context.js";
import { getSceneAssets, regenerateScene, resumePipeline, startPipeline, stopPipeline } from "#client/lib/api.js";
import { Skeleton } from "#client/components/ui/skeleton.js";
import { useMediaPreloader } from "#client/hooks/useMediaPreloader.js";
import MetricsPanel from "#client/components/MetricsPanel.js";
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { Scene } from '../../../shared/types/index.js';
import { useWorldStore } from '#client/store/useWorldStore.js';



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

  // --- project & pipeline state-------------------------------------------
  const selectedProject = useProjectStore((s) => s.selectedProjectId);
  const metadata = useProjectStore((s) => s.metadata);

  const isLoading = useCanvasUIStore((s) => s.isLoading);
  const setProjectStatus = usePipelineStore((s) => s.setStatus);

  // --- UI state -----------------------------------------------------------
  const selectedSceneIndex = useProjectStore((s) => s.selectedSceneIndex);
  const setSelectedSceneIndex = useProjectStore((s) => s.setSelectedSceneIndex);
  const selectedCharacterId = useProjectStore((s) => s.selectedCharacterId);
  const setSelectedCharacterId = useProjectStore((s) => s.setSelectedCharacterId);
  const selectedLocationId = useProjectStore((s) => s.selectedLocationId);
  const setSelectedLocationId = useProjectStore((s) => s.setSelectedLocationId);

  const activeTab = useCanvasUIStore((s) => s.activeTab);
  const setActiveTab = useCanvasUIStore((s) => s.setActiveTab);
  const currentPlaybackTime = useCanvasUIStore((s) => s.currentPlaybackTime);
  const setCurrentPlaybackTime = useCanvasUIStore((s) => s.setCurrentPlaybackTime);
  const isPlaying = useCanvasUIStore((s) => s.isPlaying);
  const setIsPlaying = useCanvasUIStore((s) => s.setIsPlaying);
  const messagesSidebarOpen = useUIMenuStore(selectMessagesSidebarOpen);
  const interrupt = usePipelineStore((s) => s.interrupt);
  const setInterrupt = usePipelineStore((s) => s.setInterrupt);

  // --- drawer state --------------------------------------------------------
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [showMessagesInDrawer, setShowMessagesInDrawer] = useState(false);

  // --- messages -----------------------------------------------------------
  const messages = usePipelineStore((s) => s.events);
  const addMessage = usePipelineStore((s) => s.pushEvent);
  const clearMessages = usePipelineStore((s) => s.clearEvents);

  // --- actions ------------------------------------------------------------
  const clearSession = useProjectStore((s) => s.clearSession);
  const updateScene = useProjectStore((s) => s.updateScene);
  const { activeTeamId, user } = useAuth();
  const worldId = useWorldStore((s) => s.worldId);

  useEffect(() => {
    if (messagesSidebarOpen) {
      setShowMessagesInDrawer(true);
      setDetailDrawerOpen(true);
    }
  }, [messagesSidebarOpen]);

  /**
   * Scene list with video - aware status.
   * Reads project.scenes AND assets.get(sceneId) in one pass so it correctly
    * re - derives whenever either the scene list or any scene's asset registry
      * changes.
   */
  const currentScenesMap = useStoreWithEqualityFn(
    useProjectStore,
    (s) => {
      const scenesValues: Scene[] = Array.from(s.scenes.values());
      if (!scenesValues.length) return null;

      const map = new Map<string, Scene & { status: string; }>();
      scenesValues.forEach((scene) => {
        const registry = useAssetStore.getState().assets.get(scene.id);
        const hasVideo = !!getAssetUrl(registry, "scene_video");
        const status = hasVideo ? "complete" : scene.status || "pending";
        map.set(scene.id, { ...scene, status });
      });
      return map;
    },
    scenesMapEqual
  );

  // The full asset Map (stable reference — Zustand/immer replaces it on any write).
  const allAssets = useAssetStore((s) => s.assets);

  // Memoized so that selectedScene, selectedSceneCharacters, and selectedSceneLocation
  // all get stable references between renders. Without this, Array.from() creates a
  // new array every render, making every .find()/.filter() downstream return a new
  // reference — which fires any useEffect in SceneDetailPanel that depends on those
  // props, causing a "max update depth exceeded" loop.
  const currentScenes = useMemo(
    () => (currentScenesMap ? Array.from(currentScenesMap.values()) : []),
    [currentScenesMap]
  );

  // MetricsPanel expects Record<string, AssetRegistry> keyed only by scene IDs.
  // The full asset Map also contains character, location, and project registries,
  // so we filter to scene IDs and convert to a plain Record in one memoized pass.
  // Dependencies: allAssets (changes when any asset is written) and currentScenes
  // (changes when scene list changes) — both are stable references until they change.
  const sceneRegistries = useMemo(() => {
    const record: Record<string, import('../../../shared/types/assets.types.js').AssetRegistry> = {};
    currentScenes.forEach((scene) => {
      const reg = allAssets.get(scene.id);
      if (reg) record[scene.id] = reg;
    });
    return record;
  }, [allAssets, currentScenes]);


  /** Characters & locations — direct reads, no derivation needed. */
  const currentCharacters = useProjectStore(useShallow((s) => Array.from(s.characters.values())));
  const currentLocations = useProjectStore(useShallow((s) => Array.from(s.locations.values())));

  // --------------------------------------------------------------------------
  // ASSET HOOKS — use the store-provided hooks, never read .assets on entities.
  // --------------------------------------------------------------------------

  const { getAssetUrl: getProjectAssetUrl } = useProjectAssets(selectedProject);
  const currentVideoSrc = resolvePublicUrl(getProjectAssetUrl("render_video"));

  // --------------------------------------------------------------------------
  // SIMPLE DERIVATIONS — no useMemo needed; these are single property lookups
  // on values that are already stable from their selectors.
  // --------------------------------------------------------------------------

  const audioGcsUri = metadata?.audioGcsUri;
  const initialPrompt = metadata?.initialPrompt;

  /** "Loading" means the network request is in-flight AND we have no project yet. */
  const clientIsLoading = isLoading && !selectedProject;

  /**
   * Selected scene + its related characters/location — all memoized so that
   * SceneDetailPanel receives stable prop references. .find() and .filter()
   * always return new references, so without useMemo any useEffect inside
   * SceneDetailPanel that depends on these props would fire every render.
   */
  const selectedScene = useMemo(
    () => currentScenes.find((s) => s.sceneIndex === selectedSceneIndex) ?? null,
    [currentScenes, selectedSceneIndex]
  );

  const selectedSceneCharacters = useMemo(
    () => (selectedScene ? currentCharacters.filter((c) => selectedScene.characterIds.includes(c.id)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedScene?.id, currentCharacters]
  );

  const selectedSceneLocation = useMemo(
    () => (selectedScene ? currentLocations.find((l) => l.id === selectedScene.locationId) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedScene?.id, currentLocations]
  );

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

  const handleStartPipeline = useCallback(async () => {
    if (!selectedProject) {
      console.error("Cannot start pipeline: missing project.");
      return;
    }
    if (!initialPrompt) {
      console.error("Cannot start pipeline: missing creative prompt.");
      return;
    }
    if (!activeTeamId) {
      console.error("Cannot start pipeline: missing team id.");
      return;
    }
    try {
      setProjectStatus("analyzing");
      await startPipeline({
        projectId: selectedProject,
        payload: {
          audioGcsUri,
          initialPrompt,
          teamId: activeTeamId,
          worldId: worldId || undefined,
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
      setProjectStatus("idle");
      addMessage({ id: Date.now().toString(), type: "info", message: "Pipeline stop command issued.", timestamp: new Date() });
    } catch (error) {
      console.error("Failed to stop pipeline:", error);
      addMessage({ id: Date.now().toString(), type: "error", message: `Failed to stop pipeline: ${(error as Error).message}`, timestamp: new Date() });
    }
  }, [selectedProject, setProjectStatus, addMessage]);

  const handleResume = useCallback(async () => {
    if (!selectedProject) return;
    setProjectStatus("analyzing");

    interrupt?.type === "user_approval_before_video_gen" || interrupt?.type === "user_approval_after_storyboard_gen" ?
      await resumePipeline({ projectId: selectedProject, payload: { resumeValue: true } }) :
      await resumePipeline({ projectId: selectedProject, payload: {} });

    setInterrupt(null);
  }, [selectedProject, setProjectStatus, interrupt, setInterrupt]);

  const handlePause = useCallback(() => setProjectStatus("paused"), [setProjectStatus]);

  const handleResetDashboard = useCallback(() => {
    clearSession();
    clearMessages();
  }, [clearSession, clearMessages]);

  const handleRegenerateScene = useCallback(async (promptModification: string) => {
    if (!selectedProject || !selectedScene) return;
    updateScene(selectedScene.id, { status: "generating" });

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
      updateScene(selectedScene.id, { status: "error" });
      addMessage({
        id: Date.now().toString(),
        type: "error",
        message: `Failed to regenerate scene ${selectedScene.id}: ${(error as Error).message}`,
        timestamp: new Date()
      });
    }
  }, [selectedProject, selectedScene, addMessage]);

  const handleSceneSelect = useCallback((sceneIndex: number) => {
    setSelectedSceneIndex(sceneIndex);
    setDetailDrawerOpen(true);
    const sceneToSeek = currentScenes.find(s => s.sceneIndex === sceneIndex);
    if (sceneToSeek) setCurrentPlaybackTime(sceneToSeek.startTime);
  }, [setSelectedSceneIndex, setCurrentPlaybackTime, currentScenes]);

  const handlePlayScene = useCallback((sceneIndex: number) => {
    console.log("Play scene ", sceneIndex);
  }, []);

  const handleCharacterSelect = useCallback((characterId: string) => {
    setSelectedCharacterId(characterId);
    setDetailDrawerOpen(true);
  }, [setSelectedCharacterId]);

  const handleLocationSelect = useCallback((locationId: string) => {
    setSelectedLocationId(locationId);
    setDetailDrawerOpen(true);
  }, [setSelectedLocationId]);

  // Navigation Handlers
  const handleNextCharacter = useCallback(() => {
    if (!selectedCharacterId) return;
    const currentIndex = currentCharacters.findIndex(c => c.id === selectedCharacterId);
    if (currentIndex < currentCharacters.length - 1) {
      setSelectedCharacterId(currentCharacters[currentIndex + 1].id);
    }
  }, [selectedCharacterId, currentCharacters, setSelectedCharacterId]);

  const handlePrevCharacter = useCallback(() => {
    if (!selectedCharacterId) return;
    const currentIndex = currentCharacters.findIndex(c => c.id === selectedCharacterId);
    if (currentIndex > 0) {
      setSelectedCharacterId(currentCharacters[currentIndex - 1].id);
    }
  }, [selectedCharacterId, currentCharacters, setSelectedCharacterId]);

  const handleNextLocation = useCallback(() => {
    if (!selectedLocationId) return;
    const currentIndex = currentLocations.findIndex(l => l.id === selectedLocationId);
    if (currentIndex < currentLocations.length - 1) {
      setSelectedLocationId(currentLocations[currentIndex + 1].id);
    }
  }, [selectedLocationId, currentLocations, setSelectedLocationId]);

  const handlePrevLocation = useCallback(() => {
    if (!selectedLocationId) return;
    const currentIndex = currentLocations.findIndex(l => l.id === selectedLocationId);
    if (currentIndex > 0) {
      setSelectedLocationId(currentLocations[currentIndex - 1].id);
    }
  }, [selectedLocationId, currentLocations, setSelectedLocationId]);

  const handleNextScene = useCallback(() => {
    if (selectedSceneIndex === null || selectedSceneIndex === undefined) return;
    // Find next index
    const nextIndex = selectedSceneIndex + 1;
    // Check if exists in currentScenes (assuming contiguous indices for simplicity, but robustness is better)
    // A safer way is to find the index in the currentScenes array and go to next array element
    const currentArrayIdx = currentScenes.findIndex(s => s.sceneIndex === selectedSceneIndex);
    if (currentArrayIdx !== -1 && currentArrayIdx < currentScenes.length - 1) {
      const nextScene = currentScenes[currentArrayIdx + 1];
      handleSceneSelect(nextScene.sceneIndex);
    }
  }, [selectedSceneIndex, currentScenes, handleSceneSelect]);

  const handlePrevScene = useCallback(() => {
    if (selectedSceneIndex === null || selectedSceneIndex === undefined) return;
    const currentArrayIdx = currentScenes.findIndex(s => s.sceneIndex === selectedSceneIndex);
    if (currentArrayIdx > 0) {
      const prevScene = currentScenes[currentArrayIdx - 1];
      handleSceneSelect(prevScene.sceneIndex);
    }
  }, [selectedSceneIndex, currentScenes, handleSceneSelect]);

  const selectedCharacter = useProjectStore(selectCurrentCharacter);
  const selectedLocation = useProjectStore(selectCurrentLocation);

  return (
    <div className="h-screen flex flex-col bg-background relative z-10">
      {/* ------------------------------------------------------------------ */}
      {/* HEADER                                                              */}
      {/* ------------------------------------------------------------------ */}
      <DashboardToolbar
        title={clientIsLoading ? "Loading..." : metadata?.title || ""}
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
                  totalDuration={metadata?.duration || 0}
                  onSceneSelect={handleSceneSelect}
                  isLoading={clientIsLoading}
                  isPlaying={isPlaying}
                  currentTime={currentPlaybackTime}
                />
                <PlaybackControls
                  scenes={currentScenes}
                  totalDuration={metadata?.duration || 0}
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
                              isSelected={char.id === selectedCharacterId}
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
                              isSelected={loc.id === selectedLocationId}
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
                    sceneRegistries={sceneRegistries}
                    totalSceneCount={currentScenes.length}
                    selectedSceneId={selectedScene?.id}
                    isLoading={clientIsLoading}
                  />
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

        </ResizablePanelGroup>
      </div>

      <DetailDrawer
        open={detailDrawerOpen}
        onOpenChange={(open) => {
          setDetailDrawerOpen(open);
          if (!open) setShowMessagesInDrawer(false);
        }}
        selectedScene={selectedScene}
        selectedSceneCharacters={selectedSceneCharacters}
        selectedSceneLocation={selectedSceneLocation}
        selectedCharacter={selectedCharacter}
        selectedLocation={selectedLocation}
        projectId={selectedProject!}
        isLoading={clientIsLoading}
        onNextScene={handleNextScene}
        onPrevScene={handlePrevScene}
        onNextCharacter={handleNextCharacter}
        onPrevCharacter={handlePrevCharacter}
        onNextLocation={handleNextLocation}
        onPrevLocation={handlePrevLocation}
        currentScenes={currentScenes}
        currentCharacters={currentCharacters}
        currentLocations={currentLocations}
        showMessages={showMessagesInDrawer}
      />
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
