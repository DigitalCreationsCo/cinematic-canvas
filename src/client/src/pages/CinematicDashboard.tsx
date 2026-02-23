import { useShallow } from 'zustand/shallow';
import { useEffect, useCallback, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs.js";
import { ScrollArea } from "#/components/ui/scroll-area.js";
import { Button } from "#/components/ui/button.js";
import { cn } from "#/lib/utils.js";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "#/components/ui/resizable.js";
import {
  MessageSquare,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Clock,
  Zap,
  Activity,
  Layers,
  Film,
  Users,
  MapPin,
  ChevronLeft,
  ChevronRight
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



const GlassPanel = ({ className, children, ...props }: any) => (
  <div className={cn("glass-brick rounded-xl overflow-hidden", className)} {...props}>
    {children}
  </div>
);

const CinematicBackground = () => (
  <div className="fixed inset-0 z-[-1] bg-cinematic-bg overflow-hidden pointer-events-none">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(20,20,30,0.4),transparent_70%)] animate-breathing-gradient" />
    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50" />
    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-30" />
  </div>
);



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
    if (sceneA.status !== sceneB.status) return false;
    if (sceneA.sceneIndex !== sceneB.sceneIndex) return false;
  }
  return true;
}



export default function CinematicDashboard() {

  const selectedProject = useStore((s) => s.selectedProject);
  const project = useStore((s) => s.project);
  const projectStatus = useStore((s) => s.projectStatus);
  const isLoading = useStore((s) => s.isLoading);
  const setProjectStatus = useStore((s) => s.setProjectStatus);
  const assets = useStore((s) => s.assets);
  const isDark = useStore((s) => s.isDark);
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
  const messages = useStore((s) => s.messages);
  const addMessage = useStore((s) => s.addMessage);
  const clearMessages = useStore((s) => s.clearMessages);
  const removeMessage = useStore((s) => s.removeMessage);
  const resetDashboard = useStore((s) => s.resetDashboard);
  const updateSceneClientSide = useStore((s) => s.updateSceneClientSide);

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

  const currentScenes = currentScenesMap ? Array.from(currentScenesMap.values()) : [];
  const currentCharacters = useStore(useShallow((s) => s.project?.characters ?? []));
  const currentLocations = useStore(useShallow((s) => s.project?.locations ?? []));
  const currentMetadata = useStore(useShallow((s) => s.project?.metadata));
  const currentMetrics = useStore(useShallow((s) => s.project?.metrics));
  const { getAssetUrl: getProjectAssetUrl } = useProjectAssets();
  const currentVideoSrc = resolvePublicUrl(getProjectAssetUrl("render_video"));
  const audioGcsUri = project?.metadata?.audioGcsUri;
  const initialPrompt = project?.metadata?.initialPrompt;
  const clientIsLoading = isLoading && !project;

  const selectedScene = currentScenes.find((s) => s.sceneIndex === selectedSceneIndex) ?? null;
  const selectedSceneCharacters = selectedScene
    ? currentCharacters.filter((c) => selectedScene.characterIds.includes(c.id))
    : [];
  const selectedSceneLocation = selectedScene
    ? currentLocations.find((l) => l.id === selectedScene.locationId)
    : undefined;
  const activeTimebarScene = currentScenes.find(
    (s) => currentPlaybackTime >= s.startTime && currentPlaybackTime < s.endTime
  ) ?? null;
  const playbackOffset = currentVideoSrc ? (activeTimebarScene?.startTime ?? 0) : 0;
  const selectedCharacter = useStore(selectCurrentCharacter);
  const selectedLocation = useStore(selectCurrentLocation);

  usePipelineEvents({ projectId: selectedProject });
  useMediaPreloader(currentScenes, activeTimebarScene?.id ?? selectedScene?.id ?? undefined);


  const handleStartPipeline = useCallback(async () => {
    if (!selectedProject || !initialPrompt) return;
    try {
      setProjectStatus("analyzing");
      await startPipeline({
        projectId: selectedProject,
        payload: { audioGcsUri, initialPrompt },
      });
    } catch (error) {
      addMessage({ id: Date.now().toString(), type: "error", message: `Failed to start: ${(error as Error).message}`, timestamp: new Date() });
      setProjectStatus("error");
    }
  }, [selectedProject, audioGcsUri, initialPrompt, setProjectStatus, addMessage]);

  const handleStopPipeline = useCallback(async () => {
    if (!selectedProject) return;
    try {
      await stopPipeline({ projectId: selectedProject });
      setProjectStatus("ready");
      addMessage({ id: Date.now().toString(), type: "info", message: "Pipeline stop command issued.", timestamp: new Date() });
    } catch (error) {
      addMessage({ id: Date.now().toString(), type: "error", message: `Failed to stop: ${(error as Error).message}`, timestamp: new Date() });
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
  const handleResetDashboard = useCallback(() => { resetDashboard(); clearMessages(); }, [resetDashboard, clearMessages]);
  const handleDismissMessage = useCallback((id: string) => removeMessage(id), [removeMessage]);
  const handleClearMessages = useCallback(() => clearMessages(), [clearMessages]);

  const handleSceneSelect = useCallback((sceneIndex: number) => {
    setSelectedSceneIndex(sceneIndex);
    const sceneToSeek = currentScenes.find(s => s.sceneIndex === sceneIndex);
    if (sceneToSeek) setCurrentPlaybackTime(sceneToSeek.startTime);
  }, [setSelectedSceneIndex, setCurrentPlaybackTime, currentScenes]);

  const handlePlayScene = useCallback((sceneIndex: number) => console.log("Play scene ", sceneIndex), []);
  const handleCharacterSelect = useCallback((id: string) => setSelectedCharacterId(id), [setSelectedCharacterId]);
  const handleLocationSelect = useCallback((id: string) => setSelectedLocationId(id), [setSelectedLocationId]);

  const handleNextScene = useCallback(() => {
    if (selectedSceneIndex === null || selectedSceneIndex === undefined) return;
    const currentArrayIdx = currentScenes.findIndex(s => s.sceneIndex === selectedSceneIndex);
    if (currentArrayIdx !== -1 && currentArrayIdx < currentScenes.length - 1) {
      handleSceneSelect(currentScenes[currentArrayIdx + 1].sceneIndex);
    }
  }, [selectedSceneIndex, currentScenes, handleSceneSelect]);

  const handlePrevScene = useCallback(() => {
    if (selectedSceneIndex === null || selectedSceneIndex === undefined) return;
    const currentArrayIdx = currentScenes.findIndex(s => s.sceneIndex === selectedSceneIndex);
    if (currentArrayIdx > 0) {
      handleSceneSelect(currentScenes[currentArrayIdx - 1].sceneIndex);
    }
  }, [selectedSceneIndex, currentScenes, handleSceneSelect]);

  const handleNextCharacter = useCallback(() => {
    if (!selectedCharacterId) return;
    const idx = currentCharacters.findIndex(c => c.id === selectedCharacterId);
    if (idx < currentCharacters.length - 1) setSelectedCharacterId(currentCharacters[idx + 1].id);
  }, [selectedCharacterId, currentCharacters, setSelectedCharacterId]);

  const handlePrevCharacter = useCallback(() => {
    if (!selectedCharacterId) return;
    const idx = currentCharacters.findIndex(c => c.id === selectedCharacterId);
    if (idx > 0) setSelectedCharacterId(currentCharacters[idx - 1].id);
  }, [selectedCharacterId, currentCharacters, setSelectedCharacterId]);

  const handleNextLocation = useCallback(() => {
    if (!selectedLocationId) return;
    const idx = currentLocations.findIndex(l => l.id === selectedLocationId);
    if (idx < currentLocations.length - 1) setSelectedLocationId(currentLocations[idx + 1].id);
  }, [selectedLocationId, currentLocations, setSelectedLocationId]);

  const handlePrevLocation = useCallback(() => {
    if (!selectedLocationId) return;
    const idx = currentLocations.findIndex(l => l.id === selectedLocationId);
    if (idx > 0) setSelectedLocationId(currentLocations[idx - 1].id);
  }, [selectedLocationId, currentLocations, setSelectedLocationId]);

  return (
    <div className="h-screen flex flex-col bg-cinematic-bg text-cinematic-text-primary font-cinematic-body overflow-hidden">
      <CinematicBackground />

      <div className="glass-brick z-50 border-b-0 m-3 mb-0 rounded-xl">
        <PipelineHeader
          title={clientIsLoading ? "Loading..." : currentMetadata?.title || ""}
          handleStart={handleStartPipeline}
          handleStop={handleStopPipeline}
          handleResume={handleResume}
          onPause={handlePause}
          handleResetDashboard={handleResetDashboard}
        />
      </div>

      <div className="flex-1 overflow-hidden p-3 pt-3">
        <ResizablePanelGroup direction="horizontal" className="space-x-3">
          

          <ResizablePanel defaultSize={65} minSize={40} className="rounded-xl overflow-hidden glass-brick flex flex-col">
            

            <div className="p-4 pb-2 border-b border-white/5 bg-black/20">
              <div className="h-24 mb-4">
                <Timeline
                  scenes={currentScenes}
                  selectedSceneIndex={selectedSceneIndex ?? undefined}
                  totalDuration={currentMetadata?.duration || 0}
                  onSceneSelect={handleSceneSelect}
                  isLoading={clientIsLoading}
                  isPlaying={isPlaying}
                  currentTime={currentPlaybackTime}
                />
              </div>
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


            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-2 bg-white/5 border-b border-white/5">
                <TabsList className="bg-transparent gap-4 p-0 h-auto">
                  {["scenes", "characters", "locations", "metrics", "logs", "debug"].map((tab) => (
                    (tab !== "debug" || import.meta.env.MODE === "development") && (
                      <TabsTrigger
                        key={tab}
                        value={tab}
                        className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 hover:text-white/80 uppercase tracking-wider text-xs font-bold px-3 py-1.5 rounded-md transition-all"
                      >
                        {tab}
                        {tab === "logs" && messages.length > 0 && (
                          <span className="ml-2 bg-red-500/80 text-white text-[9px] px-1.5 rounded-full">
                            {messages.length > 99 ? "99+" : messages.length}
                          </span>
                        )}
                      </TabsTrigger>
                    )
                  ))}
                </TabsList>
              </div>

              <div className="flex-1 overflow-hidden bg-black/10 relative">
                <TabsContent value="scenes" className="h-full m-0 p-4">
                  <ScrollArea className="h-full pr-4">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
                      {clientIsLoading ? (
                         Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl bg-white/5" />)
                      ) : currentScenes.length ? (
                        currentScenes.map((scene, index) => (
                          <div key={scene.id} className={cn("glass-brick-interactive rounded-xl overflow-hidden p-0 group", scene.sceneIndex === selectedSceneIndex && "ring-1 ring-white/50 bg-white/10")}>
                             <SceneCard
                              scene={scene}
                              status={scene.status}
                              isSelected={scene.sceneIndex === selectedSceneIndex}
                              onSelect={handleSceneSelect}
                              onPlay={handlePlayScene}
                              isLoading={false}
                              priority={index < 6}
                              className="bg-transparent border-0 shadow-none no-default-hover-elevate"

                            />
                          </div>
                        ))
                      ) : (
                        <div className="text-cinematic-text-secondary text-center col-span-full py-20">No scenes generated</div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>


                <TabsContent value="characters" className="h-full m-0 p-4">
                  <ScrollArea className="h-full">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                       {currentCharacters.map(char => (
                         <div key={char.id} className="glass-brick-interactive rounded-xl p-2">
                           <CharacterCard character={char} onSelect={handleCharacterSelect} isLoading={false} isSelected={char.id === selectedCharacterId} />
                         </div>
                       ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="locations" className="h-full m-0 p-4">
                  <ScrollArea className="h-full">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                       {currentLocations.map(loc => (
                         <div key={loc.id} className="glass-brick-interactive rounded-xl p-2">
                           <LocationCard location={loc} onSelect={handleLocationSelect} isLoading={false} isSelected={loc.id === selectedLocationId} />
                         </div>
                       ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="metrics" className="h-full m-0 p-4">
                   <MetricsPanel scenes={currentScenes} metrics={currentMetrics} selectedSceneId={selectedScene?.id} isLoading={clientIsLoading} />
                </TabsContent>

                <TabsContent value="logs" className="h-full m-0 p-4">
                  <GlassPanel className="h-full flex flex-col">
                    <div className="flex justify-between items-center p-3 border-b border-white/10">
                      <span className="text-sm font-semibold">System Logs</span>
                      <Button size="sm" variant="ghost" onClick={handleClearMessages} className="hover:bg-white/10">Clear</Button>
                    </div>
                    <MessageLog messages={messages} maxHeight="100%" onDismiss={handleDismissMessage} />
                  </GlassPanel>
                </TabsContent>

                {import.meta.env.DEV && (
                  <TabsContent value="debug" className="h-full m-0 p-4">
                    <DebugStatePanel />
                  </TabsContent>
                )}
              </div>
            </Tabs>
          </ResizablePanel>

          <ResizableHandle className="bg-transparent w-3 hover:bg-white/10 transition-colors rounded-full" />


          <ResizablePanel defaultSize={35} minSize={25} className="glass-brick rounded-xl overflow-hidden bg-black/20">
            {selectedCharacter ? (
              <CharacterDetailPanel
                character={selectedCharacter}
                projectId={selectedProject!}
                isLoading={clientIsLoading}
                onNext={handleNextCharacter}
                onPrevious={handlePrevCharacter}
                hasNext={true}
                hasPrevious={true}
              />
            ) : selectedLocation ? (
              <LocationDetailPanel
                location={selectedLocation}
                projectId={selectedProject!}
                isLoading={clientIsLoading}
                onNext={handleNextLocation}
                onPrevious={handlePrevLocation}
                hasNext={true}
                hasPrevious={true}
              />
            ) : selectedScene ? (
              <SceneDetailPanel
                projectId={selectedProject!}
                scene={selectedScene}
                status={selectedScene.status}
                characters={selectedSceneCharacters}
                location={selectedSceneLocation}
                isLoading={clientIsLoading}
                isGenerating={selectedScene.status === "generating" || selectedScene.status === "evaluating"}
                onNext={handleNextScene}
                onPrevious={handlePrevScene}
                hasNext={true}
                hasPrevious={true}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-white/30">
                <Film className="w-12 h-12 mb-4 opacity-20" />
                <p>Select an item to view details</p>
              </div>
            )}
          </ResizablePanel>

        </ResizablePanelGroup>
      </div>
    </div>
  );
}
