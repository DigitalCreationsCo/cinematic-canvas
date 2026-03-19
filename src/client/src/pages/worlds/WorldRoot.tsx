import React, { useState } from "react";
import { useLocation } from "wouter";
import { StartModal } from "./StartModal.js";
import { SelectWorldModal } from "./SelectWorldModal.js";
import { WorldBuilder } from "./WorldBuilder.js";

type WorldState = "start" | "builder" | "select-world" | "projects-modal";

interface WorldRootProps {
  onOpenProjectModal: () => void;
}

export const WorldRoot: React.FC<WorldRootProps> = ({ onOpenProjectModal }) => {
  const [currentState, setCurrentState] = useState<WorldState>("start");
  const [, setLocation] = useLocation();

  const handleAction = (action: "new-world" | "load-world" | "project") => {
    switch (action) {
      case "new-world":
        setCurrentState("builder");
        break;
      case "load-world":
        setCurrentState("select-world");
        break;
      case "project":
        onOpenProjectModal();
        break;
    }
  };

  const handleBackToStart = () => {
    setCurrentState("start");
  };

  const handleSelectWorld = (worldId: string) => {
    // Navigate to World Builder for existing world
    // In future, update store with selected world ID
    setCurrentState("builder");
  };

  const handleShowProjects = (worldId: string) => {
    // Will eventually filter projects by worldId in the modal
    onOpenProjectModal();
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative z-0">
      {currentState === "builder" && (
        <WorldBuilder onBack={handleBackToStart} />
      )}

      {/* Modals overlaying the background when not in builder */}
      {currentState !== "builder" && (
        <div className="absolute inset-0 bg-background pointer-events-none" />
      )}

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
    </div>
  );
};
