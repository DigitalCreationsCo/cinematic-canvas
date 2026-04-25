import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#client/components/ui/dialog.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#client/components/ui/select.js";
import { Button } from "#client/components/ui/button.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#client/components/ui/tabs.js";
import { Input } from "#client/components/ui/input.js";
import { Label } from "#client/components/ui/label.js";
import { Textarea } from "#client/components/ui/textarea.js";
import { useProjects } from "#client/hooks/useProjects.js";
import { useProjectStore } from '../store/useProjectStore.js';
import { usePipelineStore } from '../store/usePipelineStore.js';
import { useWorldStore } from '../store/useWorldStore.js';
import { useAuth } from '#client/lib/auth-context.js';
import { api, createProject } from '#client/lib/api.js';
import { Project } from '../../../shared/types/index.js';
import { FolderOpen, Loader2, Plus, Sparkles } from 'lucide-react';
import { Loader } from '#client/components/Loader.js';

interface ProjectSelectionModalProps {
  isOpen: boolean;
  onConfirm: (projectId: string, canvasMode: "v2" | "classic") => void;
  onClose: () => void;
}

export const ProjectSelectionModal: React.FC<ProjectSelectionModalProps> = ({
  isOpen,
  onConfirm,
  onClose,
}) => {

  const hydrateProject = useProjectStore((s) => s.hydrateProject);
  const setStatus = usePipelineStore((s) => s.setStatus);
  const activeWorldId = useWorldStore((s) => s.worldId);
  const { activeTeamId } = useAuth();

  const { data: projectsData, isLoading: isLoadingProjects, isError: isProjectsError } = useProjects(activeWorldId ?? undefined);
  const projects = projectsData?.projects || [];

  const [localSelectedProject, setLocalSelectedProject] = useState<string | undefined>(undefined);
  const [canvasMode, setCanvasMode] = useState<"v2" | "classic">("v2");
  const [mode, setMode] = useState<"resume" | "create">("resume");
  const [title, setTitle] = useState("");
  const [initialPrompt, setInitialPrompt] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (projectId: string) => {
    setLocalSelectedProject(projectId);
  };

  const handleCanvasModeChange = (mode: string) => {
    setCanvasMode(mode as "v2" | "classic");
  };

  const handleConfirmResume = () => {
    if (localSelectedProject) {
      onConfirm(localSelectedProject, canvasMode);
      onClose();
    }
  };


  const handleCreateProject = async () => {
    if (!initialPrompt) {
      setError("Please fill in creative prompt.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      let audioGcsUri: string | undefined;
      let audioPublicUri: string | undefined;
      if (audioFile) {
        const MAX_SIZE = 20 * 1024 * 1024;
        if (audioFile.size > MAX_SIZE) {
          throw new Error("File exceeds 20MB limit.");
        }

        const bytes = await audioFile.arrayBuffer();
        const base64 = btoa(new Uint8Array(bytes).reduce((s, b) => s + String.fromCharCode(b), ''));

        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/upload-audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileData: base64, fileName: audioFile.name, mimeType: audioFile.type }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(err || 'Upload failed');
        }

        const result = await response.json();
        audioGcsUri = result.audioGcsUri;
        audioPublicUri = result.audioPublicUri;
      }

      const createdProject = await createProject({
        title,
        initialPrompt,
        audioGcsUri,
        audioPublicUri,
        worldId: activeWorldId || undefined,
        teamId: activeTeamId!,
      });

      hydrateProject({
        id: createdProject.id,
        currentSceneIndex: 0,
        generationRules: [],
        scenes: [],
        characters: [],
        locations: [],
        storyboard: {
          scenes: [],
          characters: [],
          locations: [],
          metadata: {
            hasAudio: !!audioGcsUri,
            audioPublicUri: audioPublicUri,
            initialPrompt,
            audioGcsUri,
            title: title || "Untitled Project"
          },
        }
      } as unknown as Project);
      setStatus("idle");

      onConfirm(createdProject.id, canvasMode);
    } catch (err: any) {
      console.error("Failed to create project:", err);
      setError(err.message || "Failed to create project.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && onClose) onClose(); }}>
      <DialogContent className="card-cinematic-glass space-y-4 sm:max-w-[500px] px-8 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="p-4  flex flex-row items-center justify-between gap-4 shrink-0">
          <DialogDescription className="mx-auto text-foreground truncate">
            Resume a Project or start a new project.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="resume" value={mode} onValueChange={(v) => setMode(v as any)} className="w-full flex flex-col">
            <div className="px-4 pt-3 shrink-0">
              <TabsList className="w-full grid grid-cols-2 gap-5">
                <TabsTrigger asChild value="resume" data-testid="tab-resume">
                  <Button variant="outline">
                    <FolderOpen className="w-4 h-4 mr-1.5" />
                    Your Projects
                  </Button>
                </TabsTrigger>
                <TabsTrigger asChild value="create" data-testid="tab-create">
                  <Button variant="outline" className=''>
                    <Plus className="w-4 h-4 mr-1.5" />
                    New
                  </Button>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="resume" className="flex-1 p-4 mt-0 space-y-4">
              <div className="grid gap-2">
                <Label className=" font-medium hidden">Select Project</Label>
                <Select onValueChange={handleSelect} value={localSelectedProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingProjects ? (
                      <div className="p-4 text-center text-muted-foreground">Loading...</div>
                    ) : isProjectsError ? (
                      <div className="p-4 text-center text-destructive">Failed to load projects.</div>
                    ) : projects.length > 0 ? projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.metadata.title || "Untitled Project"}
                        <span className="ml-2  text-muted-foreground font-mono opacity-50">#{project.id.slice(0, 8)}</span>
                      </SelectItem>
                    )) : (
                      <div className="p-4 text-center  text-muted-foreground">
                        No projects found.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <Select onValueChange={handleCanvasModeChange} value={canvasMode}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Canvas Mode" />
                </SelectTrigger>
                <SelectContent>
                  {["v2", "classic"].map(val => (
                    <SelectItem key={val} value={val}>
                      {val}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleConfirmResume}
                disabled={!localSelectedProject}
                className="w-full"
              >
                Resume Project
              </Button>
            </TabsContent>


            <TabsContent value="create" className="flex-1 p-4 mt-0 space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="title" className=" font-medium">Title (optional)</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`"This Is Your Moment"`}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="prompt" className=" font-medium">Describe Your Video Project</Label>
                <Textarea
                  id="prompt"
                  value={initialPrompt}
                  onChange={(e) => setInitialPrompt(e.target.value)}
                  placeholder={`"A music video for a new song"`}
                  className="h-24"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="audio" className=" font-medium">
                  Audio Track (optional)
                </Label>
                <Input
                  id="audio"
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                  className="cursor-pointer"
                />
              </div>

              {error && <div className=" text-destructive bg-destructive/10 p-2   ">{error}</div>}

              <Select onValueChange={handleCanvasModeChange} value={canvasMode}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Canvas Mode" />
                </SelectTrigger>
                <SelectContent>
                  {["v2", "classic"].map(val => (
                    <SelectItem key={val} value={val}>
                      {val}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleCreateProject}
                disabled={isCreating}
                className="w-full"
              >
                {isCreating ? (
                  <>
                    <Loader />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Create & Start Project
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
