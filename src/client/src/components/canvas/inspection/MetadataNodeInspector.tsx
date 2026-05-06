import React, { useMemo } from "react";
import type { CanvasNode } from "#client/domain/canvas/NodeTypes.js";
import { useWorldStore } from "#client/store/useWorldStore.js";
import { useProjectStore } from "#client/store/useProjectStore.js";
import { RbacBanner } from "#client/components/canvas/inspection/RbacBanner.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#client/components/ui/tabs.js";
import { Badge } from "#client/components/ui/badge.js";
import { Card, CardContent, CardHeader, CardTitle } from "#client/components/ui/card.js";
import { ScrollArea } from "#client/components/ui/scroll-area.js";
import {
  Globe,
  FileText,
  Tag,
  Palette,
  Music,
  GitBranch,
  AlertCircle,
  CheckCircle2,
  Clock,
  User,
  Crown,
  Edit3,
  Eye,
} from "lucide-react";
import { getAssetUrl } from "#shared/utils/assets.utils.js";
import { useShallow } from "zustand/shallow";
import { useAssetStore } from "#client/store/useAssetStore.js";
import { AudioPlayer } from "#client/components/ui/audio-player.js";

const ROLE_ICONS: Record<string, React.ElementType> = {
  owner: Crown,
  editor: Edit3,
  collaborator: User,
  viewer: Eye,
  licensed_creator: Star,
};

function Star({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
        clipRule="evenodd"
      />
    </svg>
  );
}

interface ProjectMetadataContentProps {
  selectedProjectId: string | null;
  metadata: ReturnType<typeof useProjectStore.getState>["metadata"];
  generationRules: ReturnType<typeof useProjectStore.getState>["generationRules"];
  projectStats: { scenes: number; characters: number; locations: number };
}

function ProjectMetadataContent({
  selectedProjectId,
  metadata,
  generationRules,
  projectStats,
}: ProjectMetadataContentProps) {
  const assets = useAssetStore((s) => s.assets);

  // ── Project/world metadata ─────────────────────────────────────────────────
  const current = useProjectStore(
    useShallow((state) => {
      if (!state.scenes) return 0;
      let count = 0;
      for (const scene of state.scenes.values()) {
        const registry = assets.get(scene.id);
        if (getAssetUrl(registry, "scene_video")) count++;
      }
      return count;
    }),
  );
  const total = useProjectStore((state) => state.scenes.size || 0);

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="p-4 rounded-full bg-muted mb-4">
          <FileText className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No project selected</p>
        <p className="text-xs text-muted-foreground mt-1">
          Select a project to view its metadata
        </p>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex items-center gap-2 p-4 rounded-full mb-4">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading Project...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Project ID */}
      <div className="flex flex-col pt-4 gap-1">
        {/* ── Pipeline status counters ─────────────────────────────────────── */}
        <div className="text-xs font-mono flex items-center gap-2 text-foreground">
          <span>
            COMPLETE:{current}/{total}
          </span>
          <span>GENERATING:0</span>
          <span>ERROR:1</span>
        </div>
      </div>

      {/* Basic Info Card */}
      <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-500/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Title</span>
            <p className="text-sm font-medium">{metadata.title || "Untitled Project"}</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Logline</span>
            <p className="text-xs text-muted-foreground italic">
              {metadata.logline || "No logline provided"}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <span className="text-xs text-muted-foreground">Scenes</span>
              <p className="text-lg font-semibold">{projectStats.scenes}</p>
            </div>
            <div className="flex-1">
              <span className="text-xs text-muted-foreground">Characters</span>
              <p className="text-lg font-semibold">{projectStats.characters}</p>
            </div>
            <div className="flex-1">
              <span className="text-xs text-muted-foreground">Locations</span>
              <p className="text-lg font-semibold">{projectStats.locations}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Style & Mood Card */}
      <Card className="border-l-4 border-l-pink-500 bg-gradient-to-br from-pink-500/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Palette className="w-3.5 h-3.5" />
            Style & Mood
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Style</span>
            <Badge
              variant="secondary"
              className="bg-pink-500/10 border-pink-500/30 text-pink-400"
            >
              {metadata.style || "Not specified"}
            </Badge>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Description</span>
            <p className="text-sm">{metadata.description}</p>
          </div>

          {metadata.colorPalette && metadata.colorPalette.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Color Palette</span>
              <div className="flex flex-wrap gap-1.5">
                {metadata.colorPalette.map((color, idx) => (
                  <div
                    key={idx}
                    className="w-6 h-6 rounded-none border border-border/50 shadow-sm"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tags Card */}
      {metadata.tags && metadata.tags.length > 0 && (
        <Card className="border-l-4 border-l-cyan-500 bg-gradient-to-br from-cyan-500/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Tag className="w-3.5 h-3.5" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {metadata.tags.map((tag, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audio Card */}
      {metadata.audioPublicUri && (
        <Card className="border-l-4 border-l-orange-500 bg-gradient-to-br from-orange-500/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Music className="w-3.5 h-3.5" />
              Audio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <span className="text-xs text-muted-foreground">
              {metadata.audioPublicUri.split("/").pop() || "Audio Track"}
            </span>
            <AudioPlayer
              src={metadata.audioPublicUri}
              audioId={`inspector-${selectedProjectId}`}
              className="w-full"
            />
          </CardContent>
        </Card>
      )}

      {/* Prompts Card */}
      {(metadata.initialPrompt || metadata.enhancedPrompt) && (
        <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-500/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" />
              Prompts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {metadata.initialPrompt && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Initial Prompt</span>
                <p className="text-xs text-muted-foreground bg-muted p-2 rounded-none font-mono leading-relaxed">
                  {metadata.initialPrompt.length > 200
                    ? `${metadata.initialPrompt.slice(0, 200)}...`
                    : metadata.initialPrompt}
                </p>
              </div>
            )}

            {metadata.enhancedPrompt && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Enhanced Prompt</span>
                <p className="text-xs text-muted-foreground bg-muted p-2 rounded-none font-mono leading-relaxed">
                  {metadata.enhancedPrompt.length > 200
                    ? `${metadata.enhancedPrompt.slice(0, 200)}...`
                    : metadata.enhancedPrompt}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Generation Rules Card */}
      <Card className="border-l-4 ">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" />
            Generation Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col space-y-3">
          {generationRules?.map((rule, index) => (
            <span key={`rule-${index}`} className="text-xs text-muted-foreground">
              {rule}
            </span>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function MetadataNodeInspector({ node }: { node: CanvasNode }) {
  const isLocked = node.data.isLocked;

  // World data
  const worldId = useWorldStore((state) => state.worldId);
  const worldName = useWorldStore((state) => state.worldName);
  const role = useWorldStore((state) => state.role);
  const licenseType = useWorldStore((state) => state.licenseType);
  const sacRepoId = useWorldStore((state) => state.sacRepoId);
  const commitHistory = useWorldStore((state) => state.commitHistory);
  const isDirty = useWorldStore((state) => state.isDirty);

  // Project data
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const metadata = useProjectStore((state) => state.metadata);
  const generationRules = useProjectStore((state) => state.generationRules);
  const scenes = useProjectStore((state) => state.scenes);
  const characters = useProjectStore((state) => state.characters);
  const locations = useProjectStore((state) => state.locations);

  const isWorldScope = node.data.scope === "world";
  const hasLinkedWorld = !!worldId;
  const RoleIcon = ROLE_ICONS[role] || Eye;

  const projectStats = useMemo(
    () => ({
      scenes: scenes.size,
      characters: characters.size,
      locations: locations.size,
    }),
    [scenes, characters, locations],
  );

  return (
    <div className="flex flex-col h-full">
      <RbacBanner isLocked={isLocked} entityType="project" />

      {/* Header */}
      <div className="px-4 py-4 mt-2 bg-gradient-to-r from-primary/10 from-[100px] via-primary/5 via-[300px] to-transparent">
        <div className="flex items-center gap-2">
          <div>
            <h2
              data-testid="title-project"
              className="font-heading font-normal uppercase"
            >
              {isWorldScope
                ? worldName || "No world selected"
                : metadata?.title || "No project selected"}
            </h2>
            <span className="text-xs font-mono text-muted-foreground rounded-none truncate">
              {selectedProjectId}
            </span>
          </div>
        </div>
      </div>

      {hasLinkedWorld ? (
        <Tabs defaultValue="world" className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-4">
            <TabsList className="w-full grid grid-cols-2 bg-muted/50 p-1 rounded-none">
              <TabsTrigger
                value="world"
                data-testid="tab-trigger-world"
                className="flex items-center gap-2 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Globe className="w-3.5 h-3.5" />
                World
              </TabsTrigger>
              <TabsTrigger
                value="project"
                data-testid="tab-trigger-project"
                className="flex items-center gap-2 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <FileText className="w-3.5 h-3.5" />
                Project
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 px-4 pb-4 pt-4">
            <TabsContent value="world" className="mt-0 space-y-4">
              {/* World Info Card */}
              <Card className="border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-500/5 to-transparent">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5" />
                    World Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Name</span>
                    <p className="text-sm font-medium">{worldName || "Unnamed World"}</p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">World ID</span>
                    <p className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded-none truncate">
                      {worldId || "No world loaded"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Access & License Card */}
              <Card className="border-l-4 border-l-violet-500 bg-gradient-to-br from-violet-500/5 to-transparent">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <User className="w-3.5 h-3.5" />
                    Access & License
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Your Role</span>
                    <Badge variant="secondary" className="flex items-center gap-1.5">
                      <RoleIcon className="w-3 h-3" />
                      <span className="capitalize">{role.replace("_", " ")}</span>
                    </Badge>
                  </div>

                  {licenseType && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">License</span>
                      <Badge
                        variant="outline"
                        className="border-violet-500/50 text-violet-400"
                      >
                        {licenseType}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Version Control Card */}
              <Card className="border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-500/5 to-transparent">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5" />
                    Version Control
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {sacRepoId ? (
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">
                        SAC Repository
                      </span>
                      <p className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded-none truncate">
                        {sacRepoId}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No SAC repository configured
                    </p>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Commits</span>
                    <Badge variant="outline" className="border-emerald-500/50">
                      {commitHistory.length}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    {isDirty ? (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        <span className="text-xs text-amber-500">
                          Uncommitted changes
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs text-emerald-500">
                          All changes committed
                        </span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="project" className="mt-0 space-y-4">
              <ProjectMetadataContent
                selectedProjectId={selectedProjectId}
                metadata={metadata}
                generationRules={generationRules}
                projectStats={projectStats}
              />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      ) : (
        <ScrollArea className="flex-1 px-4 pb-4 pt-4">
          <ProjectMetadataContent
            selectedProjectId={selectedProjectId}
            metadata={metadata}
            generationRules={generationRules}
            projectStats={projectStats}
          />
        </ScrollArea>
      )}
    </div>
  );
}
