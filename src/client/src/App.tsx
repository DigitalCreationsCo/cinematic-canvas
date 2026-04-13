import { useCallback, useEffect, useState } from "react";
import { Switch, Route, Router, useLocation } from "wouter";
import { Toaster } from "#client/components/ui/toaster.js";
import { useProjectStore } from "./store/useProjectStore.js";
import ProjectDashboard from "#client/pages/ProjectDashboard.js";
import { WorldRoot } from "#client/pages/worlds/WorldRoot.js";
import { WorldBuilderCanvas } from "#client/pages/WorldBuilderCanvas.js";
import { WorldBuilder } from "#client/pages/worlds/WorldBuilder.js";
import ProjectBuilderCanvas from "#client/pages/ProjectBuilderCanvas.js";
import { AuthProvider, useAuth } from "#client/lib/auth-context.js";
import { AuthScreen } from "#client/pages/auth/AuthScreen.js";
import { TeamSetup } from "#client/pages/auth/TeamSetup.js";
import { ProjectSelectionModal } from "#client/components/ProjectSelectionModal.js";
import { apiFetch } from "#client/lib/api.js";
import { api } from "#client/lib/routes.js";
import { TooltipProvider } from "#client/components/ui/tooltip.js";
import { Loader } from "#client/components/Loader.js";
import React from "react";

const NotFound = () => <div className="text-center p-8">404: Not Found</div>;

const AppRoutes = React.memo(({ onOpenProjectModal, onBack }: { onOpenProjectModal: () => void, onBack: () => void }) => (
  <Switch>
    {/* <Route path="/world/:worldId" component={WorldBuilderCanvas} /> */}
    <Route path="/world/:worldId" component={() => <WorldBuilder onBack={onBack} />} />
    <Route path="/project/:projectId" component={ProjectBuilderCanvas} />
    <Route path="/project/:projectId/classNameic" component={ProjectDashboard} />
    <Route path="/" component={() => <WorldRoot onOpenProjectModal={onOpenProjectModal} />} />
    <Route component={NotFound} />
  </Switch>
));

function AuthenticatedApp() {
  const { activeTeamId, setActiveTeamId, user } = useAuth();
  const [_, navigate] = useLocation();
  const setSelectedProject = useProjectStore((s) => s.setSelectedProjectId);
  const [modalOpen, setModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(() => Boolean(user && !activeTeamId));

  useEffect(() => {
    if (!user || activeTeamId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    apiFetch(api.teams())
      .then(({ teams }) => {
        if (cancelled) return;
        if (teams && teams.length > 0) {
          setActiveTeamId(teams[0].id);
        }
      })
      .catch((error) => {
        if (!cancelled) console.error("Failed to fetch teams:", error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, activeTeamId, setActiveTeamId]);

  const handleOpenProjectModal = useCallback(() => setModalOpen(true), []);
  const handleCloseModal = useCallback(() => setModalOpen(false), []);

  const handleConfirmProject = useCallback((projectId: string, canvasMode: "v2" | "classNameic") => {
    console.debug("[App] handleConfirmProject called", { projectId, canvasMode });
    setSelectedProject(projectId);
    setModalOpen(false);

    if (canvasMode === "v2") {
      console.debug('[App] Navigating to v2 canvas:', `/project/${projectId}`);
      navigate(`/project/${projectId}`);
    } else {
      console.debug('[App] Navigating to classNameic:', `/project/${projectId}/classNameic`);
      navigate(`/project/${projectId}/classNameic`);
    }
  }, [navigate, setSelectedProject]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">
        <Loader />
      </div>
    );
  }

  if (!user) return <AuthScreen />;
  if (!activeTeamId) return <TeamSetup />;

  return (
    <main className="dark:bg-background dark:text-foreground h-screen flex flex-col">
      <TooltipProvider>
        <Router>
          <AppRoutes onOpenProjectModal={handleOpenProjectModal} onBack={() => navigate("/")} />
        </Router>
        <ProjectSelectionModal
          isOpen={modalOpen}
          onClose={handleCloseModal}
          onConfirm={handleConfirmProject}
        />
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
