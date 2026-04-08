import React, { useCallback, useReducer } from "react";
import { useLocation } from "wouter";
import { StartModal } from "./StartModal.js";
import { SelectWorldModal } from "./SelectWorldModal.js";
import { WelcomeModal } from "./WelcomeModal.js";
import { EllipsoidMatrix2 } from "#client/components/canvas/EllipsoidMatrix2.js";

type WorldState = "start" | "builder" | "select-world" | "projects-modal";

interface WorldRootProps {
  onOpenProjectModal: () => void;
}

type WorldAction =
  | { type: "GO_BUILDER" }
  | { type: "GO_SELECT_WORLD" }
  | { type: "GO_START" };

function worldReducer(state: WorldState, action: WorldAction): WorldState {
  switch (action.type) {
    case "GO_BUILDER":
      return "builder";
    case "GO_SELECT_WORLD":
      return "select-world";
    case "GO_START":
      return "start";
    default:
      return state;
  }
}

const HAS_SEEN_WELCOME_KEY = "cinematic-canvas-has-seen-welcome";

export const WorldRoot: React.FC<WorldRootProps> = React.memo(({ onOpenProjectModal }) => {
  const [currentState, dispatch] = useReducer(worldReducer, "start");
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
      switch (action) {
        case "new-world":
          dispatch({ type: "GO_BUILDER" });
          break;
        case "load-world":
          dispatch({ type: "GO_SELECT_WORLD" });
          break;
        case "project":
          onOpenProjectModal();
          break;
      }
    },
    [onOpenProjectModal],
  );

  const handleBackToStart = useCallback(() => dispatch({ type: "GO_START" }), []);

  const handleSelectWorld = useCallback((_worldId: string) => {
    // Navigate to WorldBuilder for the selected world.
    // Future: push worldId into store before transitioning.
    dispatch({ type: "GO_BUILDER" });
  }, []);

  const handleShowProjects = useCallback(
    (_worldId: string) => {
      // Future: pass worldId to modal so it can filter projects.
      onOpenProjectModal();
    },
    [onOpenProjectModal],
  );

  return (
    <div className="min-h-screen text-background relative z-0">
      <div className="min-h-screen text-background relative z-0" style={{ background: "radial-gradient(ellipse 70% 60% at 30% 50%, color-mix(in srgb, var(--color-accent-red), transparent 80%) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 70% 40%, color-mix(in srgb, var(--color-accent-blue), transparent 75%) 0%, transparent 55%)" }}>
        <EllipsoidMatrix2 />
      </div>
      <StartModal
        isOpen={currentState === "start"}
        onSelectAction={handleAction}
      />

      <SelectWorldModal
        isOpen={currentState === "select-world"}
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
});

WorldRoot.displayName = "WorldRoot";
