import { useEffect, useState } from "react";
import { Switch, Route, Router, useLocation } from "wouter";
import { Toaster } from "#/components/ui/toaster.js";
import { useProjectStore } from "./store/useProjectStore.js";
import ProjectDashboard from "#/pages/ProjectDashboard.js";
import { WorldRoot } from "#/pages/worlds/WorldRoot.js";
import { WorldBuilderCanvas } from "#/components/canvas/WorldBuilderCanvas.js";
import PipelinePage from "#/components/canvas/Pipeline.js";
import { AuthProvider, useAuth } from "#/lib/auth-context.js";
import { AuthScreen } from "#/pages/auth/AuthScreen.js";
import { TeamSetup } from "#/pages/auth/TeamSetup.js";
import { ProjectSelectionModal } from "#/components/ProjectSelectionModal.js";
import { apiFetch } from "#/lib/api.js";
import { Loader2 } from "lucide-react";
import Header from "#/components/Header.js";
import { TooltipProvider } from "#/components/ui/tooltip.js";
import { ProjectBuilderCanvas } from "#/components/canvas/ProjectBuilderCanvas.js";
import { useCanvasUIStore } from "#/store/useCanvasUIStore.js";

const NotFound = () => <div className="text-center p-8">404: Not Found</div>;

const AppRoutes = () => (
  <Switch>
    <Route path="/world/:worldId" component={ WorldBuilderCanvas } />
    <Route path="/project/:projectId" component={ PipelinePage } />
    <Route path="/project/:projectId/v1" component={ ProjectBuilderCanvas } />
    <Route path="/project/:projectId/classic" component={ ProjectDashboard } />
    <Route path="/" component={ () => <WorldRoot onOpenProjectModal={ () => { } } /> } />
    <Route component={ NotFound } />
  </Switch>
);

function AuthenticatedApp() {
  const { user } = useAuth();
  const [ location, navigate ] = useLocation();
  const { activeTeamId, setActiveTeamId } = useAuth();
  const selectedProject = useProjectStore((s) => s.selectedProjectId);
  const setSelectedProject = useProjectStore((s) => s.setSelectedProjectId);
  const [ modalOpen, setModalOpen ] = useState(false);
  const [ projectToLoad, setProjectToLoad ] = useState<string | undefined>(undefined);
  const [ isLoading, setIsLoading ] = useState(true);
  const [ canvasMode, setCanvasMode ] = useState("");

  useEffect(() => {
    const checkUserTeams = async () => {
      if (user && !activeTeamId) {
        setIsLoading(true);
        try {
          const { teams } = await apiFetch("/teams");
          if (teams && teams.length > 0) {
            setActiveTeamId(teams[ 0 ].id);
          }
        } catch (error) {
          console.error("Failed to fetch teams:", error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };
    checkUserTeams();
  }, [ user, activeTeamId, setActiveTeamId ]);

  const handleConfirmProject = () => {
    if (projectToLoad) {
      setSelectedProject(projectToLoad);
      setModalOpen(false);
      if (canvasMode === "v2") return navigate(`/project/${projectToLoad}`);
      else if (canvasMode === "v1") return navigate(`/project/${projectToLoad}/v1`);
      else return navigate(`/project/${projectToLoad}/classic`);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) return <AuthScreen />;
  if (!activeTeamId) return <TeamSetup />;

  return (
    <main className="dark:bg-background dark:text-foreground h-screen flex flex-col">
      <TooltipProvider>
        <Header />
        { selectedProject ? (
          <Router>
            <AppRoutes />
          </Router>
        ) : (
          <>
            <WorldRoot onOpenProjectModal={ () => setModalOpen(true) } />
              <ProjectSelectionModal
                canvasMode={ canvasMode }
                setCanvasMode={ setCanvasMode }
              isOpen={ modalOpen }
              onClose={ () => setModalOpen(false) }
              selectedProject={ projectToLoad }
              onSelectProject={ setProjectToLoad }
              onConfirm={ handleConfirmProject }
            />
          </>
        ) }
        <Toaster />
      </TooltipProvider>
    </main>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}

export default App;
