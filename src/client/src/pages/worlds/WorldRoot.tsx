import React, { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { StartModal } from "./StartModal.js";
import { SelectWorldModal } from "./SelectWorldModal.js";
import { WelcomeModal } from "./WelcomeModal.js";
import { EllipsoidMatrix2 } from "#client/components/canvas/EllipsoidMatrix2.js";

type WorldState = "start" | "builder" | "select-world" | "projects-modal";

interface WorldRootProps {
  onOpenProjectModal: () => void;
  isEnteringWorldSpace: boolean;
  setIsEnteringWorldSpace: (isEnteringWorldSpace: boolean) => void;
}

const HAS_SEEN_WELCOME_KEY = "cinematic-canvas-has-seen-welcome";
export const ANIMATION_DURATION_MS = 800;

export const WorldRoot: React.FC<WorldRootProps> = ({
  isEnteringWorldSpace,
  setIsEnteringWorldSpace,
  onOpenProjectModal
}) => {
  const [currentState, setCurrentState] = useState<WorldState>("start");
  const [, setLocation] = useLocation();

  const [showWelcome, setShowWelcome] = React.useState(
    () => !localStorage.getItem(HAS_SEEN_WELCOME_KEY),
  );

  const handleWelcomeDismiss = useCallback(() => {
    localStorage.setItem(HAS_SEEN_WELCOME_KEY, "true");
    setShowWelcome(false);
  }, []);

  const handleAction = useCallback((action: "new-world" | "load-world" | "project") => {
    if (action === "project") {
      onOpenProjectModal();
      return;
    }

    if (action === "load-world") {
      setCurrentState("select-world");
      return;
    }

    const newState: WorldState = action === "new-world" ? "builder" : "select-world";
    console.log("[WorldRoot] handleAction", { action, newState });

    setCurrentState(newState);
    setIsEnteringWorldSpace(true);

    setTimeout(() => {
      setIsEnteringWorldSpace(false);
    }, ANIMATION_DURATION_MS);
  }, [onOpenProjectModal, setIsEnteringWorldSpace]);

  const handleBackToStart = useCallback(() => setCurrentState("start"), []);

  const handleSelectWorld = useCallback((_worldId: string) => {
    setCurrentState("builder");
    setIsEnteringWorldSpace(true);

    setTimeout(() => {
      setIsEnteringWorldSpace(false);
    }, ANIMATION_DURATION_MS);
  }, []);

  const handleShowProjects = useCallback(
    (_worldId: string) => {
      onOpenProjectModal();
    },
    [onOpenProjectModal]
  );

  return (
    <div className="min-h-screen text-background relative z-0">
      {/* <span className='text-white'>
        {currentState}
      </span> */}

      <StartModal
        isOpen={currentState === "start" && !isEnteringWorldSpace}
        onSelectAction={handleAction}
      />

      <SelectWorldModal
        isOpen={currentState === "select-world" && !isEnteringWorldSpace}
        onBack={handleBackToStart}
        onSelectWorld={handleSelectWorld}
        onShowProjects={handleShowProjects}
      />

      <WelcomeModal
        isOpen={showWelcome}
        onDismiss={handleWelcomeDismiss}
      />
    </div>
  );
};

WorldRoot.displayName = "WorldRoot";
