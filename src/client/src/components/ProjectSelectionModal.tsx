import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#/components/ui/dialog.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select.js";
import { Button } from "#/components/ui/button.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs.js";
import { Input } from "#/components/ui/input.js";
import { Label } from "#/components/ui/label.js";
import { Textarea } from "#/components/ui/textarea.js";
import { Card, CardContent } from "#/components/ui/card.js";
import { useProjects } from "#/hooks/use-swr-api.js";
import { useProjectStore } from '../store/useProjectStore.js';
import { usePipelineStore } from '../store/usePipelineStore.js';
import { useWorldStore } from '../store/useWorldStore.js';
import { useAuth } from '#/lib/auth-context.js';
import { startPipeline, uploadAudio } from '#/lib/api.js';
import { Project } from '../../../shared/types/index.js';
import { FolderOpen, Loader2, Plus, Sparkles } from 'lucide-react';

interface ProjectSelectionModalProps {
  isOpen: boolean;
  selectedProject: string | undefined;
  onSelectProject: (project: string) => void;
  onConfirm: (projectId?: string) => void;
  onClose: () => void;
  canvasMode: string;
  setCanvasMode: (arg: "v2" | "v1" | "classic") => void;
}

export const ProjectSelectionModal: React.FC<ProjectSelectionModalProps> = ({
  isOpen,
  selectedProject,
  onSelectProject,
  onConfirm,
  onClose,
  canvasMode,
  setCanvasMode
}) => {

  const hydrateProject = useProjectStore((s) => s.hydrateProject);
  const setStatus = usePipelineStore((s) => s.setStatus);
  const activeWorldId = useWorldStore((s) => s.worldId);
  const { activeTeamId } = useAuth();

  const { data: projectsData, isLoading: isLoadingProjects, isError: isProjectsError } = useProjects(activeWorldId);
  const projects = projectsData?.projects || [];

  // Internal state for selection, as the prop might not update immediately
  const [ localSelectedProject, setLocalSelectedProject ] = useState<string | undefined>(selectedProject);
  const [ mode, setMode ] = useState<"resume" | "create">("resume");
  const [ title, setTitle ] = useState("");
  const [ enhancedPrompt, setCreativePrompt ] = useState("");
  const [ audioFile, setAudioFile ] = useState<File | null>(null);
  const [ isCreating, setIsCreating ] = useState(false);
  const [ error, setError ] = useState<string | null>(null);

  // Sync local state with prop
  React.useEffect(() => {
    setLocalSelectedProject(selectedProject);
  }, [ selectedProject ]);

  const handleSelect = (projectId: string) => {
    setLocalSelectedProject(projectId);
    onSelectProject(projectId);
  };


  const handleCreateProject = async () => {
    if (!enhancedPrompt) {
      setError("Please fill in creative prompt.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      let audioGcsUri: string | undefined;
      let audioPublicUri: string | undefined;
      if (audioFile) {
        const uploadResult = await uploadAudio(audioFile);
        audioGcsUri = uploadResult.audioGcsUri;
        audioPublicUri = uploadResult.audioPublicUri;
      }

      const result = await startPipeline({
        payload: {
          title: title,
          initialPrompt: enhancedPrompt,
          audioGcsUri,
          audioPublicUri,
          worldId: activeWorldId || undefined,
          teamId: activeTeamId!,
        },
      });

      hydrateProject({
        id: result.projectId,
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
            enhancedPrompt: enhancedPrompt,
            audioGcsUri,
            title: "Creating project..."
          },
        }
      } as unknown as Project);
      setStatus("analyzing");

      onSelectProject(result.projectId);
      onConfirm(result.projectId);
    } catch (err: any) {
      console.error("Failed to create project:", err);
      setError(err.message || "Failed to create project.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={ isOpen } onOpenChange={(open) => { if (!open && onClose) onClose(); }}>
      <DialogContent className="sm:max-w-[500px] p-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="p-4  flex flex-row items-center justify-between gap-4 shrink-0 space-y-0">
          <div className="flex flex-col gap-1 min-w-0">
            <DialogDescription className=" text-muted-foreground truncate">
              Resume a Project or start a new project.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="resume" value={ mode } onValueChange={ (v) => setMode(v as any) } className="w-full flex flex-col">
            <div className="px-4 pt-3 shrink-0">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="resume" data-testid="tab-resume">
                  <FolderOpen className="w-4 h-4 mr-1.5" />
                  Your Projects
                </TabsTrigger>
                <TabsTrigger value="create" data-testid="tab-create">
                  <Plus className="w-4 h-4 mr-1.5" />
                  New
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="resume" className="flex-1 p-4 mt-0">
              <Card className="  bg-transparent">
                <CardContent className="p-0 space-y-4">
                  <div className="grid gap-2">
                    <Label className=" font-medium hidden">Select Project</Label>
                    <Select onValueChange={ handleSelect } value={ selectedProject }>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                      <SelectContent>
                        { isLoadingProjects ? (
                          <div className="p-4 text-center text-muted-foreground">Loading...</div>
                        ) : isProjectsError ? (
                          <div className="p-4 text-center text-destructive">Failed to load projects.</div>
                        ) : projects.length > 0 ? projects.map((project) => (
                          <SelectItem key={ project.id } value={ project.id }>
                            { project.metadata.title || "Untitled Project" }
                            <span className="ml-2  text-muted-foreground font-mono opacity-50">#{ project.id.slice(0, 8) }</span>
                          </SelectItem>
                        )) : (
                          <div className="p-4 text-center  text-muted-foreground">
                            No projects found.
                          </div>
                        ) }
                      </SelectContent>
                    </Select>
                  </div>

                  <Select onValueChange={ setCanvasMode } value={ canvasMode }>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Canvas Mode" />
                    </SelectTrigger>
                    <SelectContent>
                      { [ "v2", "v1", "classic" ].map(val => (
                        <SelectItem key={ val } value={ val }>
                          { val }
                        </SelectItem>
                      )) }
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={ () => onConfirm() }
                    disabled={ !selectedProject }
                    className="w-full"
                    >
                    Resume Project
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="create" className="flex-1 p-4 mt-0">
              <Card className="  bg-transparent">
                <CardContent className="p-0 space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title" className=" font-medium">Title (optional)</Label>
                    <Input
                      id="title"
                      value={ title }
                      onChange={ (e) => setTitle(e.target.value) }
                      placeholder={ `"This Is Your Moment"` }
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="prompt" className=" font-medium">Describe Your Video Project</Label>
                    <Textarea
                      id="prompt"
                      value={ enhancedPrompt }
                      onChange={ (e) => setCreativePrompt(e.target.value) }
                      placeholder={ `"A music video for a new song"` }
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
                      onChange={ (e) => setAudioFile(e.target.files?.[ 0 ] || null) }
                      className="cursor-pointer"
                    />
                  </div>

                  { error && <div className=" text-destructive bg-destructive/10 p-2   ">{ error }</div> }

                  <Select onValueChange={ setCanvasMode } value={ canvasMode }>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Canvas Mode" />
                    </SelectTrigger>
                    <SelectContent>
                      { [ "v2", "v1", "classic" ].map(val => (
                        <SelectItem key={ val } value={ val }>
                          { val }
                        </SelectItem>
                      )) }
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={ handleCreateProject }
                    disabled={ isCreating }
                    className="w-full"
                  >
                    { isCreating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Create & Start Project
                      </>
                    ) }
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
