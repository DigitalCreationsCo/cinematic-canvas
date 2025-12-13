import { useEffect, useState, useCallback } from "react"; // Import useCallback
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@/components/ui/resizable";
import {
  Film,
  Users,
  MapPin,
  BarChart3,
  MessageSquare,
  ChevronLeft,
  Settings,
  Zap,
  Clock,
  RefreshCw,
  CheckCircle
} from "lucide-react";
import type {
  Scene,
  Character,
  Location,
  SceneStatus,
  PipelineStatus,
  PipelineMessage,
  WorkflowMetrics,
  GraphState,
  Storyboard
} from "@shared/pipeline-types";
import PipelineHeader from "@/components/PipelineHeader";
import SceneCard from "@/components/SceneCard";
import SceneDetailPanel from "@/components/SceneDetailPanel";
import Timeline from "@/components/Timeline";
import PlaybackControls from "@/components/PlaybackControls";
import MessageLog from "@/components/MessageLog";
import CharacterCard from "@/components/CharacterCard";
import LocationCard from "@/components/LocationCard";
import MetricCard from "@/components/MetricCard";
import { usePipelineEvents } from "@/hooks/use-pipeline-events";
import { useStore } from "@/lib/store";
import { useAppData } from "@/hooks/use-swr-api";
import { startPipeline, stopPipeline } from "@/lib/api"; // Import API functions
import { Skeleton } from "@/components/ui/skeleton"; // Import Skeleton for dashboard-level loading states

export default function Dashboard() {
  const { // Destructure new state fields
    isDark,
    pipelineStatus,
    selectedSceneId,
    activeTab,
    audioUrl,
    creativePrompt, // Destructure creativePrompt from store
    setIsDark,
    setPipelineStatus,
    setSelectedSceneId,
    setActiveTab,
    setCurrentPlaybackTime,
    resetDashboard,
    selectedProject,
  } = useStore();

  // Use pipelineState from the hook
  const { connected: sseConnected, pipelineState } = usePipelineEvents({ projectId: selectedProject || null });

  // If pipelineState is available from SSE, use it to update the store
  useEffect(() => {
    if (pipelineState) {
      // This is a simplified status update. A more robust solution would map specific graph states to PipelineStatus.
      setPipelineStatus(pipelineState.currentSceneIndex < (pipelineState.storyboardState?.scenes.length || 0) ? "generating" : "complete");
    }
  }, [ pipelineState, setPipelineStatus ]);

  // Fetch initial data only if no pipelineState from SSE yet
  const { data, isLoading, isError } = useAppData(selectedProject, !pipelineState); // Pass `selectedProject` as the first argument, and `!pipelineState` to conditionally fetch

  const [ messages, setMessages ] = useState<PipelineMessage[]>([]);

  useEffect(() => {
    if (data?.messages) {
      setMessages(data.messages);
    }
  }, [ data ]);

  // When a new event comes from SSE, add it to messages
  useEffect(() => {
    if (pipelineState?.errors && pipelineState.errors.length > messages.filter(m => m.type === "error").length) {
      const newError = pipelineState.errors[ pipelineState.errors.length - 1 ];
      setMessages(prev => [ { id: Date.now().toString(), type: "error", message: `Pipeline Error: ${newError}`, timestamp: new Date() }, ...prev ]);
    } else if (pipelineState?.storyboardState && pipelineState.currentSceneIndex > 0 && pipelineState.currentSceneIndex > messages.filter(m => m.type === "info" && m.message.includes("Processing Scene")).length) {
      const currentScene = pipelineState.storyboardState.scenes[ pipelineState.currentSceneIndex - 1 ];
      if (currentScene) {
        setMessages(prev => [ {
          id: Date.now().toString(),
          type: "info",
          message: `Processing Scene ${currentScene.id} - ${currentScene.description.substring(0, 50)}...`,
          timestamp: new Date(),
          sceneId: currentScene.id,
        }, ...prev ]);
      }
    } else if (pipelineState?.renderedVideoUrl && !messages.some(m => m.message.includes("Video generation complete"))) {
      setMessages(prev => [ { id: Date.now().toString(), type: "success", message: "Video generation complete!", timestamp: new Date() }, ...prev ]);
    }
  }, [ pipelineState, messages ]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [ isDark ]);

  // Handlers for pipeline control
  const handleStartPipeline = useCallback(async () => {
    if (!selectedProject || !audioUrl || !creativePrompt) {
      console.error("Cannot start pipeline: missing project, audio, or creative prompt.");
      return;
    }
    try {
      setPipelineStatus("analyzing");
      await startPipeline({ projectId: selectedProject, audioUrl, creativePrompt });
    } catch (error) {
      console.error("Failed to start pipeline:", error);
      setMessages(prev => [ { id: Date.now().toString(), type: "error", message: `Failed to start pipeline: ${(error as Error).message}`, timestamp: new Date() }, ...prev ]);
      setPipelineStatus("error");
    }
  }, [ selectedProject, audioUrl, creativePrompt, setPipelineStatus ]);

  const handleStopPipeline = useCallback(async () => {
    if (!selectedProject) {
      console.error("Cannot stop pipeline: no project selected.");
      return;
    }
    try {
      await stopPipeline({ projectId: selectedProject });
      setPipelineStatus("idle");
      setMessages(prev => [ { id: Date.now().toString(), type: "info", message: "Pipeline stop command issued.", timestamp: new Date() }, ...prev ]);
    } catch (error) {
      console.error("Failed to stop pipeline:", error);
      setMessages(prev => [ { id: Date.now().toString(), type: "error", message: `Failed to stop pipeline: ${(error as Error).message}`, timestamp: new Date() }, ...prev ]);
    }
  }, [ selectedProject, setPipelineStatus ]);

  const handleResetDashboard = useCallback(() => {
    resetDashboard();
    setMessages([]);
  }, [ resetDashboard ]);

  // Determine what data to display based on whether SSE pipelineState is available
  const currentScenes: Scene[] = pipelineState?.storyboardState?.scenes || data?.storyboardState?.scenes || [];
  const currentCharacters: Character[] = pipelineState?.storyboardState?.characters || data?.storyboardState?.characters || [];
  const currentLocations: Location[] = pipelineState?.storyboardState?.locations || data?.storyboardState?.locations || [];
  const currentMetadata: Storyboard[ "metadata" ] = pipelineState?.storyboardState?.metadata || data?.storyboardState?.metadata || {} as Storyboard[ "metadata" ]; // Cast empty object to metadata type
  const currentMetrics: WorkflowMetrics = pipelineState?.metrics || data?.metrics || {} as WorkflowMetrics; // Cast empty object to metrics type
  const currentSceneStatuses: Record<number, SceneStatus> = pipelineState?.storyboardState?.scenes.reduce<Record<number, SceneStatus>>((acc, scene) => {
    acc[ scene.id ] = scene.generatedVideo ? "complete" : "pending";
    return acc;
  }, {}) || data?.sceneStatuses || {};

  const selectedScene = currentScenes.find(s => s.id === selectedSceneId);
  const selectedSceneCharacters = selectedScene
    ? currentCharacters.filter(c => selectedScene.characters.includes(c.id))
    : [];
  const selectedSceneLocation = selectedScene
    ? currentLocations.find(l => l.id === selectedScene.locationId)
    : undefined;

  const completedScenes = Object.values(currentSceneStatuses).filter(s => s === "complete").length;

  const dismissMessage = (id: string) => {
    setMessages((prev: PipelineMessage[]) => prev.filter(m => m.id !== id));
  };

  const clientIsLoading = isLoading && !pipelineState; // Client is loading if initial data is loading and no SSE state yet

  return (
    <div className="h-screen flex flex-col bg-background">
      <PipelineHeader
        title={ currentMetadata?.title || "Loading..." } // Safe access
        status={ pipelineStatus }
        connected={ sseConnected }
        progress={ { current: completedScenes, total: currentScenes.length } }
        isDark={ isDark }
        onToggleTheme={ () => setIsDark(!isDark) }
        onStart={ handleStartPipeline }
        onPause={ () => setPipelineStatus("idle") }
        onStop={ handleStopPipeline }
        onReset={ handleResetDashboard }
      />

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={ 65 } minSize={ 40 }>
            <div className="h-full flex flex-col">
              <div className="p-4 pb-2 border-b shrink-0 space-y-3">
                <Timeline
                  scenes={ currentScenes }
                  sceneStatuses={ currentSceneStatuses }
                  selectedSceneId={ selectedSceneId ?? undefined }
                  totalDuration={ currentMetadata.duration }
                  onSceneSelect={ setSelectedSceneId }
                  isLoading={ clientIsLoading }
                />
                <PlaybackControls
                  scenes={ currentScenes }
                  totalDuration={ currentMetadata.duration }
                  audioUrl={ audioUrl }
                  onSeekSceneChange={ setSelectedSceneId }
                  onTimeUpdate={ setCurrentPlaybackTime }
                  isLoading={ clientIsLoading }
                />
              </div>

              <Tabs value={ activeTab } onValueChange={ setActiveTab } className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 pt-3 shrink-0">
                  <TabsList>
                    <TabsTrigger value="scenes" data-testid="tab-scenes">
                      <Film className="w-4 h-4 mr-1.5" />
                      Scenes
                    </TabsTrigger>
                    <TabsTrigger value="characters" data-testid="tab-characters">
                      <Users className="w-4 h-4 mr-1.5" />
                      Characters
                    </TabsTrigger>
                    <TabsTrigger value="locations" data-testid="tab-locations">
                      <MapPin className="w-4 h-4 mr-1.5" />
                      Locations
                    </TabsTrigger>
                    <TabsTrigger value="metrics" data-testid="tab-metrics">
                      <BarChart3 className="w-4 h-4 mr-1.5" />
                      Metrics
                    </TabsTrigger>
                    <TabsTrigger value="logs" data-testid="tab-logs">
                      <MessageSquare className="w-4 h-4 mr-1.5" />
                      Logs
                      { messages.length > 0 && (
                        <span className="ml-1.5 text-[10px] bg-primary text-primary-foreground rounded-full px-1.5">
                          { messages.length }
                        </span>
                      ) }
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="scenes" className="flex-1 overflow-hidden mt-0 p-4">
                  <ScrollArea className="h-full">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pb-4">
                      { clientIsLoading && Array.from({ length: 6 }).map((_, i) => (
                        <SceneCard key={ i } scene={ {} as Scene } status="pending" isLoading={ true } />
                      )) }
                      { !clientIsLoading && currentScenes.map((scene) => (
                        <SceneCard
                          key={ scene.id }
                          scene={ scene }
                          status={ currentSceneStatuses[ scene.id ] || "pending" }
                          isSelected={ scene.id === selectedSceneId }
                          onSelect={ () => setSelectedSceneId(scene.id) }
                          onPlay={ () => console.log("Play scene", scene.id) }
                          isLoading={ clientIsLoading }
                        />
                      )) }
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="characters" className="flex-1 overflow-hidden mt-0 p-4">
                  <ScrollArea className="h-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
                      { clientIsLoading && Array.from({ length: 4 }).map((_, i) => (
                        <CharacterCard key={ i } character={ {} as Character } onSelect={ () => { } } isLoading={ true } />
                      )) }
                      { !clientIsLoading && currentCharacters.map((char) => (
                        <CharacterCard
                          key={ char.id }
                          character={ char }
                          onSelect={ () => console.log("Select character", char.id) }
                          isLoading={ clientIsLoading }
                        />
                      )) }
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="locations" className="flex-1 overflow-hidden mt-0 p-4">
                  <ScrollArea className="h-full">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pb-4">
                      { clientIsLoading && Array.from({ length: 6 }).map((_, i) => (
                        <LocationCard key={ i } location={ {} as Location } onSelect={ () => { } } isLoading={ true } />
                      )) }
                      { !clientIsLoading && currentLocations.map((loc) => (
                        <LocationCard
                          key={ loc.id }
                          location={ loc }
                          onSelect={ () => console.log("Select location", loc.id) }
                          isLoading={ clientIsLoading }
                        />
                      )) }
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="metrics" className="flex-1 overflow-hidden mt-0 p-4">
                  <ScrollArea className="h-full">
                    <div className="space-y-4 pb-4">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        { clientIsLoading ? (
                          <> {/* Skeletons for MetricCards */ }
                            <MetricCard label="" value="" subValue="" isLoading={ true } />
                            <MetricCard label="" value="" subValue="" isLoading={ true } />
                            <MetricCard label="" value="" subValue="" isLoading={ true } />
                            <MetricCard label="" value="" subValue="" isLoading={ true } />
                          </>
                        ) : (
                          <>
                            <MetricCard
                              label="Avg Attempts"
                              value={ currentMetrics.globalTrend?.averageAttempts.toFixed(1) || "—" }
                              subValue="per scene"
                              trend={ currentMetrics.globalTrend && currentMetrics.globalTrend.attemptTrendSlope < 0 ? "down" : "neutral" }
                              trendValue={ currentMetrics.globalTrend ? `${(currentMetrics.globalTrend.attemptTrendSlope * 100).toFixed(0)}% trend` : undefined }
                              icon={ <RefreshCw className="w-5 h-5" /> }
                            />
                            <MetricCard
                              label="Quality Score"
                              value={ `${Math.round(currentMetrics.sceneMetrics.reduce((a, m) => a + m.finalScore, 0) / currentMetrics.sceneMetrics.length)}%` }
                              trend={ currentMetrics.globalTrend && currentMetrics.globalTrend.qualityTrendSlope > 0 ? "up" : "neutral" }
                              trendValue={ currentMetrics.globalTrend ? `+${(currentMetrics.globalTrend.qualityTrendSlope * 100).toFixed(0)}% improvement` : undefined }
                              icon={ <CheckCircle className="w-5 h-5" /> }
                            />
                            <MetricCard
                              label="Avg Duration"
                              value={ `${(currentMetrics.sceneMetrics.reduce((a, m) => a + m.duration, 0) / currentMetrics.sceneMetrics.length / 60).toFixed(1)}m` }
                              subValue="per scene"
                              icon={ <Clock className="w-5 h-5" /> }
                            />
                            <MetricCard
                              label="Rules Added"
                              value={ currentMetrics.sceneMetrics.filter(m => m.ruleAdded).length }
                              subValue="this session"
                              icon={ <Zap className="w-5 h-5" /> }
                            />
                          </>
                        ) }
                      </div>

                      <Card>
                        <CardHeader className="p-4 pb-2">
                          <CardTitle className="text-sm font-semibold">Scene Generation History</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <div className="space-y-2">
                            { clientIsLoading ? (
                              Array.from({ length: 3 }).map((_, i) => (
                                <Skeleton key={ i } className="h-12 w-full rounded-md" />
                              ))
                            ) : (
                              currentMetrics.sceneMetrics.map((m) => (
                                <div
                                  key={ m.sceneId }
                                  className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-mono">#{ m.sceneId }</span>
                                    <span className="text-sm text-muted-foreground">
                                      { m.attempts } attempt{ m.attempts !== 1 ? "s" : "" }
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium">{ m.finalScore }%</span>
                                    <span className="text-xs text-muted-foreground font-mono">
                                      { (m.duration / 60).toFixed(1) }m
                                    </span>
                                    { m.ruleAdded && (
                                      <Zap className="w-3.5 h-3.5 text-chart-4" />
                                    ) }
                                  </div>
                                </div>
                              ))
                            ) }
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="logs" className="flex-1 overflow-hidden mt-0 p-4">
                  <Card className="h-full">
                    <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2">
                      <CardTitle className="text-sm font-semibold">Pipeline Messages</CardTitle>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={ () => setMessages([]) }
                        data-testid="button-clear-logs"
                      >
                        Clear
                      </Button>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <MessageLog
                        messages={ messages }
                        maxHeight="calc(100vh - 20rem)"
                        onDismiss={ dismissMessage }
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={ 35 } minSize={ 25 }>
            { selectedScene ? (
              <SceneDetailPanel
                scene={ selectedScene }
                status={ currentSceneStatuses[ selectedScene.id ] || "pending" }
                characters={ selectedSceneCharacters }
                location={ selectedSceneLocation }
                onRegenerate={ () => console.log("Regenerate scene", selectedScene.id) }
                onPlayVideo={ () => console.log("Play video", selectedScene.id) }
                isLoading={ clientIsLoading } // Pass isLoading to SceneDetailPanel
              />
            ) : clientIsLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                <Skeleton className="w-12 h-12 mb-4 rounded-full" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                <Film className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-sm text-center">Select a scene to view details</p>
              </div>
            ) }
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
