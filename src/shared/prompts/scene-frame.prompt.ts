import { SceneWithAssets, CharacterWithAssets, LocationWithAssets } from "../types/index.js";
import { buildScriptSupervisorContinuityChecklist } from "./role-script-supervisor.prompt.js";
import { buildVisualDirectorSpec, composeGenerationRules } from "./prompt-utils.js";

/**
 * Compose frame generation prompt meta instructions (Cinematographer + Gaffer + Script Supervisor)
 * Used in Generation Points 3.1 and 3.2
 */
export const composeFrameGenerationPromptMeta = (
  scene: SceneWithAssets,
  framePosition: "start" | "end",
  characters: CharacterWithAssets[],
  locations: LocationWithAssets[],
  previousScene?: SceneWithAssets,
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