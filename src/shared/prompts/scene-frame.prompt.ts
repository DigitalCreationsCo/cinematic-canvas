import { Scene, Character, Location } from "../types/index.js";
import { buildGafferLightingSpec } from "./role-gaffer.js";
import { buildScriptSupervisorContinuityChecklist } from "./role-script-supervisor.js";
import { buildCinematographerNarrative } from "./must-review/role-cinematographer.js";
import { buildVisualDirectorSpec, composeGenerationRules } from "./prompt-utils.js";

/**
 * Compose frame generation prompt meta instructions (Cinematographer + Gaffer + Script Supervisor)
 * Used in Generation Points 3.1 and 3.2
 */
export const composeFrameGenerationPromptMeta = (
  scene: Scene,
  framePosition: "start" | "end",
  characters: Character[],
  locations: Location[],
  previousScene?: Scene,
  generationRules?: string[]
) => {
  const location = locations.find((l) => l.id === scene.locationId);
  if (!location) {
    throw new Error(`[CRITICAL] Location ID ${scene.locationId} not found in registry.`);
  }

  return [
    buildVisualDirectorSpec(scene, location, framePosition),
    buildScriptSupervisorContinuityChecklist(scene, previousScene, characters, locations),
    composeGenerationRules(generationRules)
  ].join("\n");
};