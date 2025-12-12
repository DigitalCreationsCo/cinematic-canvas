import { useEffect, useState } from "react";
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
  WorkflowMetrics
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

export default function Dashboard() {
  const {
    isDark,
    pipelineStatus,
    selectedSceneId,
    activeTab,
    audioUrl,
    setIsDark,
    setPipelineStatus,
    setSelectedSceneId,
    setActiveTab,
    setCurrentPlaybackTime,
    resetDashboard,
    selectedProject,
  } = useStore();
  const { connected: wsConnected, lastMessage } = usePipelineEvents();
  const { data, isLoading, isError } = useAppData(selectedProject);
  
  const [messages, setMessages] = useState<PipelineMessage[]>([]);

  useEffect(() => {
    if (data?.messages) {
      setMessages(data.messages);
    }
  }, [data]);
  
  useEffect(() => {
    if (lastMessage) {
      setMessages((prev: PipelineMessage[]) => [ lastMessage, ...prev ]);
    }
  }, [ lastMessage ]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [ isDark ]);

  if (isLoading) return <div>Loading...</div>;
  if (isError || !data) return <div>Error loading data.</div>;

  const { storyboardState: { scenes, characters, locations, metadata }, metrics, sceneStatuses } = data;

  const selectedScene = scenes.find(s => s.id === selectedSceneId);
  const selectedSceneCharacters = selectedScene
    ? characters.filter(c => selectedScene.characters.includes(c.id))
    : [];
  const selectedSceneLocation = selectedScene
    ? locations.find(l => l.id === selectedScene.locationId)
    : undefined;

  const completedScenes = Object.values(sceneStatuses).filter(s => s === "complete").length;

  const dismissMessage = (id: string) => {
    setMessages((prev: PipelineMessage[]) => prev.filter(m => m.id !== id));
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <PipelineHeader
        title={metadata.title}
        status={ pipelineStatus }
        connected={ wsConnected }
        progress={ { current: completedScenes, total: scenes.length } }
        isDark={ isDark }
        onToggleTheme={ () => setIsDark(!isDark) }
        onStart={ () => setPipelineStatus("generating") }
        onPause={ () => setPipelineStatus("idle") }
        onReset={ resetDashboard }
      />

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={ 65 } minSize={ 40 }>
            <div className="h-full flex flex-col">
              <div className="p-4 pb-2 border-b shrink-0 space-y-3">
                <Timeline
                  scenes={ scenes }
                  sceneStatuses={ sceneStatuses }
                  selectedSceneId={ selectedSceneId ?? undefined }
                  totalDuration={ metadata.duration }
                  onSceneSelect={ setSelectedSceneId }
                />
                <PlaybackControls
                  scenes={ scenes }
                  totalDuration={metadata.duration}
                  audioUrl={ audioUrl }
                  onSeekSceneChange={ setSelectedSceneId }
                  onTimeUpdate={ setCurrentPlaybackTime }
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
                      { scenes.map((scene) => (
                        <SceneCard
                          key={ scene.id }
                          scene={ scene }
                          status={ sceneStatuses[ scene.id ] || "pending" }
                          isSelected={ scene.id === selectedSceneId }
                          onSelect={ () => setSelectedSceneId(scene.id) }
                          onPlay={ () => console.log("Play scene", scene.id) }
                        />
                      )) }
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="characters" className="flex-1 overflow-hidden mt-0 p-4">
                  <ScrollArea className="h-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
                      { characters.map((char) => (
                        <CharacterCard
                          key={ char.id }
                          character={ char }
                          onSelect={ () => console.log("Select character", char.id) }
                        />
                      )) }
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="locations" className="flex-1 overflow-hidden mt-0 p-4">
                  <ScrollArea className="h-full">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pb-4">
                      { locations.map((loc) => (
                        <LocationCard
                          key={ loc.id }
                          location={ loc }
                          onSelect={ () => console.log("Select location", loc.id) }
                        />
                      )) }
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="metrics" className="flex-1 overflow-hidden mt-0 p-4">
                  <ScrollArea className="h-full">
                    <div className="space-y-4 pb-4">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <MetricCard
                          label="Avg Attempts"
                          value={ metrics.globalTrend?.averageAttempts.toFixed(1) || "—" }
                          subValue="per scene"
                          trend={ metrics.globalTrend && metrics.globalTrend.attemptTrendSlope < 0 ? "down" : "neutral" }
                          trendValue={ metrics.globalTrend ? `${(metrics.globalTrend.attemptTrendSlope * 100).toFixed(0)}% trend` : undefined }
                          icon={ <RefreshCw className="w-5 h-5" /> }
                        />
                        <MetricCard
                          label="Quality Score"
                          value={ `${Math.round(metrics.sceneMetrics.reduce((a, m) => a + m.finalScore, 0) / metrics.sceneMetrics.length)}%` }
                          trend={ metrics.globalTrend && metrics.globalTrend.qualityTrendSlope > 0 ? "up" : "neutral" }
                          trendValue={ metrics.globalTrend ? `+${(metrics.globalTrend.qualityTrendSlope * 100).toFixed(0)}% improvement` : undefined }
                          icon={ <CheckCircle className="w-5 h-5" /> }
                        />
                        <MetricCard
                          label="Avg Duration"
                          value={ `${(metrics.sceneMetrics.reduce((a, m) => a + m.duration, 0) / metrics.sceneMetrics.length / 60).toFixed(1)}m` }
                          subValue="per scene"
                          icon={ <Clock className="w-5 h-5" /> }
                        />
                        <MetricCard
                          label="Rules Added"
                          value={ metrics.sceneMetrics.filter(m => m.ruleAdded).length }
                          subValue="this session"
                          icon={ <Zap className="w-5 h-5" /> }
                        />
                      </div>

                      <Card>
                        <CardHeader className="p-4 pb-2">
                          <CardTitle className="text-sm font-semibold">Scene Generation History</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <div className="space-y-2">
                            { metrics.sceneMetrics.map((m) => (
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
                            )) }
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
                status={ sceneStatuses[ selectedScene.id ] || "pending" }
                characters={ selectedSceneCharacters }
                location={ selectedSceneLocation }
                onRegenerate={ () => console.log("Regenerate scene", selectedScene.id) }
                onPlayVideo={ () => console.log("Play video", selectedScene.id) }
              />
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
