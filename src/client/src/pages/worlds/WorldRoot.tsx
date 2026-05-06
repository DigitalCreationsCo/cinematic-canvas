import React, { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { StartModal } from "#client/pages/worlds/StartModal.js";
import { SelectWorldModal } from "#client/pages/worlds/SelectWorldModal.js";
import { WelcomeModal } from "#client/pages/worlds/WelcomeModal.js";
import { WorldBuilder } from "#client/pages/worlds/WorldBuilder.js";

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
  onOpenProjectModal,
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

  const handleAction = useCallback(
    (action: "new-world" | "load-world" | "project") => {
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
    },
    [onOpenProjectModal, setIsEnteringWorldSpace],
  );

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
    [onOpenProjectModal],
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

      <WelcomeModal isOpen={showWelcome} onDismiss={handleWelcomeDismiss} />

      {currentState === "builder" && !isEnteringWorldSpace && (
        <WorldBuilder onBack={handleBackToStart} />
      )}
    </div>
  );
};

WorldRoot.displayName = "WorldRoot";
