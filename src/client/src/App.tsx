import { useCallback, useEffect, useState } from "react";
import { Switch, Route, Router, useLocation } from "wouter";
import { Toaster } from "#client/components/ui/toaster.js";
import { useProjectStore } from "./store/useProjectStore.js";
import ProjectDashboard from "#client/pages/ProjectDashboard.js";
import { WorldRoot, ANIMATION_DURATION_MS } from "#client/pages/worlds/WorldRoot.js";
import { WorldBuilderCanvas } from "#client/pages/WorldBuilderCanvas.js";
import { WorldBuilder } from "#client/pages/worlds/WorldBuilder.js";
import ProjectBuilderCanvas from "#client/pages/ProjectBuilderCanvas.js";
import { AuthProvider, useAuth } from "#client/lib/auth-context.js";
import { AuthScreen } from "#client/pages/auth/AuthScreen.js";
import { TeamSetup } from "#client/pages/auth/TeamSetup.js";
import { ProjectSelectionModal } from "#client/components/ProjectSelectionModal.js";
import { api } from "#client/lib/api.js";
import { TooltipProvider } from "#client/components/ui/tooltip.js";
import { Loader } from "#client/components/Loader.js";
import React from "react";
import { EllipsoidMatrix2 } from "#client/components/canvas/EllipsoidMatrix2.js";

const NotFound = () => <div className="text-center p-8">404: Not Found</div>;

const AppRoutes = React.memo(({ onOpenProjectModal, onBack, isEnteringWorldSpace, setIsEnteringWorldSpace }: { onOpenProjectModal: () => void, onBack: () => void, isEnteringWorldSpace: boolean, setIsEnteringWorldSpace: (isEnteringWorldSpace: boolean) => void }) => {
  return (
    <Switch>
      {/* <Route path="/world/:worldId" component={WorldBuilderCanvas} /> */}
      <Route path="/world/:worldId" component={() => <WorldBuilder onBack={onBack} />} />
      <Route path="/project/:projectId" component={ProjectBuilderCanvas} />
      <Route path="/project/:projectId/classic" component={ProjectDashboard} />
      <Route path="/" component={() => <WorldRoot onOpenProjectModal={onOpenProjectModal} isEnteringWorldSpace={isEnteringWorldSpace} setIsEnteringWorldSpace={setIsEnteringWorldSpace} />} />
      <Route component={NotFound} />
    </Switch>
  );
});

function AuthenticatedApp() {
  const { activeTeamId, setActiveTeamId, user } = useAuth();
  const [location, navigate] = useLocation();
  const setSelectedProject = useProjectStore((s) => s.setSelectedProjectId);
  const [modalOpen, setModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(() => Boolean(user && !activeTeamId));
  const [isEnteringWorldSpace, setIsEnteringWorldSpace] = useState(false);

  const toggleEnteringSpace = useCallback((val: boolean) => {
    setIsEnteringWorldSpace(val);
  }, []);

  const shouldShowBackground = location === "/" || isEnteringWorldSpace;

  useEffect(() => {
    if (!user || activeTeamId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    api.teams.list.query()
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

  const handleConfirmProject = useCallback((projectId: string, canvasMode: "v2" | "classic") => {

    setIsEnteringWorldSpace(true);

    setTimeout(() => {
      console.debug("[App] handleConfirmProject called", { projectId, canvasMode });
      setSelectedProject(projectId);
      setModalOpen(false);

      if (canvasMode === "v2") {
        console.debug('[App] Navigating to v2 canvas:', `/project/${projectId}`);
        navigate(`/project/${projectId}`);
      } else {
        console.debug('[App] Navigating to classic:', `/project/${projectId}/classic`);
        navigate(`/project/${projectId}/classic`);
      }

      setIsEnteringWorldSpace(false);
    }, ANIMATION_DURATION_MS);
  }, [navigate, setSelectedProject]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!user) return <AuthScreen />;
  if (!activeTeamId) return <TeamSetup />;

  return (
    <main className="h-screen flex flex-col">

      {shouldShowBackground && (
        <div
          className={`absolute inset-0 transition-all ease-in-out pointer-events-none z-0 ${isEnteringWorldSpace ? "scale-[10] opacity-0" : "scale-100 opacity-100"
            }`}
          style={{
            transitionDuration: `${ANIMATION_DURATION_MS}ms`,
            transformOrigin: "center center"
          }}
        >
          <EllipsoidMatrix2 />
        </div>
      )}

      <TooltipProvider>
        <Router>
          <AppRoutes
            onOpenProjectModal={handleOpenProjectModal}
            onBack={() => navigate("/")}
            isEnteringWorldSpace={isEnteringWorldSpace}
            setIsEnteringWorldSpace={toggleEnteringSpace}
          />
        </Router>
        <ProjectSelectionModal
          isOpen={modalOpen}
          onClose={handleCloseModal}
          onConfirm={handleConfirmProject}
        />
      </TooltipProvider>
    </main>
  );
}

function App() {
  return (
    <AuthProvider>
      <Toaster />
      <AuthenticatedApp />
    </AuthProvider>
  );
}

export default App;
