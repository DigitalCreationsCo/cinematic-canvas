import { Switch, Route } from "wouter";
import { queryClient } from "#/lib/queryClient.js";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "#/components/ui/toaster.js";
import { TooltipProvider } from "#/components/ui/tooltip.js";
import NotFound from "#/pages/not-found.js";
import { ProjectSelectionModal } from "#/components/ProjectSelectionModal.js";
import { CompoundModal } from "#/components/CompoundModal.js";
import { useStore } from "#/lib/store.js";
import { useEffect, useState } from "react";
import { useProjects } from "#/hooks/use-swr-api.js";
import ProjectDashboard from "#/pages/ProjectDashboard.js";
import { WorldRoot } from "#/pages/worlds/WorldRoot.js";
function Router() {
  return (
    <Switch>
      <Route path="/project/:id" component={ ProjectDashboard } />
      <Route path="/" component={ () => <WorldRoot onOpenProjectModal={() => {}} /> } />
      <Route component={ NotFound } />
    </Switch>
  );
}

function App() {
  const { selectedProject, setSelectedProject } = useStore();
  const [ modalOpen, setModalOpen ] = useState(false);
  const [ projectToLoad, setProjectToLoad ] = useState<string | undefined>(undefined);

  const { data, isLoading, isError } = useProjects();


  const handleConfirmProject = (projectId?: string) => {
    const id = typeof projectId === 'string' ? projectId : projectToLoad;
    if (id) {
      setSelectedProject(id);
      setModalOpen(false);
    }
  };

  return (
    <QueryClientProvider client={ queryClient }>
      <TooltipProvider>
        <Toaster />
        <CompoundModal />
        { selectedProject ? (
          <Router />
        ) : (
          <>
            <WorldRoot onOpenProjectModal={() => setModalOpen(true)} />
            <ProjectSelectionModal
              isOpen={ modalOpen }
              onClose={ () => setModalOpen(false) }
              projects={ data?.projects || [] }
              selectedProject={ projectToLoad }
              onSelectProject={ setProjectToLoad }
              onConfirm={ handleConfirmProject }
            />
          </>
        ) }
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
