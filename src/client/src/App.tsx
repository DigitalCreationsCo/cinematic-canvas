import { useEffect, useState } from "react";
import { Switch, Route, Router, useLocation } from "wouter";
import { Toaster } from "#/components/ui/toaster.js";
import { useProjectStore } from "./store/useProjectStore.js";
import ProjectDashboard from "#/pages/ProjectDashboard.js";
import { WorldRoot } from "#/pages/worlds/WorldRoot.js";
import { WorldBuilderCanvas } from "#/components/canvas/WorldBuilderCanvas.js";
import { ProjectBuilderCanvas } from "#/components/canvas/ProjectBuilderCanvas.js";
import { AuthProvider, useAuth } from "#/lib/auth-context.js";
import { AuthScreen } from "#/pages/auth/AuthScreen.js";
import { TeamSetup } from "#/pages/auth/TeamSetup.js";
import { ProjectSelectionModal } from "#/components/ProjectSelectionModal.js";
import { apiFetch } from "#/lib/api.js";
import { Loader2 } from "lucide-react";
import Header from "#/components/Header.js";
import { TooltipProvider } from "#/components/ui/tooltip.js";

const NotFound = () => <div className="text-center p-8">404: Not Found</div>;

const AppRoutes = () => (
  <Switch>
    <Route path="/world/:worldId" component={ WorldBuilderCanvas } />
    <Route path="/project/:projectId" component={ ProjectBuilderCanvas } />
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
      navigate(`/project/${projectToLoad}`);
    }
    setModalOpen(false);
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
