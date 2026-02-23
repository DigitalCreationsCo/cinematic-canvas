import { Scene, Character, Location, QualityEvaluationResult, CharacterAttributes, LocationAttributes } from "../types/index.js";
import { buildDirectorSceneBeatPrompt } from "./must-review/role-director.js";
import { buildGafferGuidelines, buildGafferLightingSpec } from "./role-gaffer.js";
import { buildScriptSupervisorContinuityChecklist } from "./must-review/role-script-supervisor.js";
import { buildCostumeSpec, buildCostumeNarrativeInstructions } from "./role-costume-designer.js";
import { buildProductionDesignerSpec, buildProductionDesignerNarrative } from "./role-set-designer.js";
import { formatCharacterSpecs, formatLocationSpecs } from "../utils/type-utils.js";
import { buildCinematographerGuidelines, buildCinematographerNarrative } from "./must-review/role-cinematographer.js";
import { getAllBestAssets } from "../utils/assets-utils.js";
import { resolvePublicUrl } from "../utils/utils.js";
import { composeGenerationRules } from "./must-review/prompt-utils.js";

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

  return `${buildScriptSupervisorContinuityChecklist(scene, previousScene, characters, locations)}
  ${buildCinematographerNarrative(scene, framePosition)}
  
Mood: ${scene.mood} (Intensity: ${scene.intensity})

Lighting specifications for Scene ${scene.sceneIndex}:
${buildGafferLightingSpec(scene, location, location?.timeOfDay)}

${composeGenerationRules(generationRules)}`;
};