/**
 * This module provides helper functions for composing multi-role prompts
 * at various generation points in the workflow.
 */

import { Scene, Character, Location, QualityEvaluationResult } from "../types/index.js";
import { getAllBestAssets } from "../utils/assets-utils.js";
import { resolvePublicUrl } from "../utils/utils.js";
import { buildGafferLightingSpec } from "./role-gaffer.js";
import { buildCinematographerNarrative } from "./must-review/role-cinematographer.js";

/**
 * Compose department specifications for quality evaluation
 * Used in Generation Point 4.1
 */
export interface DepartmentSpecsForEvaluation {
  director: string;
  cinematographer: string;
  lighting: string;
  scriptSupervisor: string;
  costume: string;
  productionDesign: string;
}

export const buildVisualDirectorSpec = (
  scene: Scene,
  location: Location,
  framePosition?: "start" | "end"
): string => {

  const locationAssets = getAllBestAssets(location.assets);
  const locationDescription = locationAssets[ "location_description" ]?.data ? `${locationAssets[ "location_description" ].data}\n` : "";

  const atmosphericParts: string[] = [];
  if (location.state.precipitation !== "none") atmosphericParts.push(`${location.state.precipitation} precipitation`);
  if (location.state.visibility !== "clear") atmosphericParts.push(`${location.state.visibility.replace("_", " ")} visibility`);
  location.state.atmosphericEffects?.forEach(e => {
    if (!e.dissipating) atmosphericParts.push(`${e.intensity} ${e.type}`);
  });
  location.state.temperatureIndicators.forEach(t => atmosphericParts.push(t));

  return [
    // 1. SETTING
    `${locationDescription} ${scene.description}`,
    `${location.architecture.join(", ")}`,
    // 2. ENVIRONMENT
    `Set during ${location.timeOfDay}${location.state.season !== "unspecified" ? ` in ${location.state.season}` : ""} with ${location.weather || "clear"} weather${atmosphericParts.length > 0 ? ` and ${atmosphericParts.join(", ")}` : ""}.`,
    `${location.state.groundCondition.wetness} surface${location.state.groundCondition.debris.length > 0 ? ` with ${location.state.groundCondition.debris.join(", ")}` : ""}.`,
    `${location.state.atmosphericEffects.map(e => `${e.intensity} ${e.type}`).join(", ")}.`,

    // 3 & 4. COMPOSITION & CAMERA
    buildCinematographerNarrative(scene, framePosition),

    // 5. LIGHTING
    buildGafferLightingSpec(scene, location, location.timeOfDay),

    // 6. ATMOSPHERE
    `${scene.audioSync} with mood: ${scene.mood} (Intensity: ${scene.intensity}).`,

    // 7. TECHNICAL
    `Photorealistic Cinematic Film.`,
    `8K, RAW photo, High Dynamic Range, DSLR, deep blacks, grain detail.`
  ].join("\n");
};

export const composeSceneSpecs = (
  scene: Scene,
  characters: Character[],
  location: Location,
  previousScene?: Scene
): DepartmentSpecsForEvaluation => {

  const locationAssets = getAllBestAssets(location.assets);

  const director = `Scene ${scene.id}: ${scene.description}
Mood: ${scene.mood} | Intensity: ${scene.intensity} | Tempo: ${scene.tempo}`;

  const cinematographer = `Shot Type: ${scene.shotType}
Camera Movement: ${scene.cameraMovement}
Composition: ${JSON.stringify(scene.composition)}`;

  const lighting = `Lighting: ${JSON.stringify(scene.lighting)}
Time of Day: ${location.timeOfDay}
Weather: ${location.weather || "Clear"}`;

  const scriptSupervisor = previousScene
    ? `Continue from previous scene ${previousScene.id}:
- Previous action: ${previousScene.description}
- Previous lighting: ${JSON.stringify(previousScene.lighting)}
- Continuity notes: ${scene.continuityNotes?.join("; ") || "Standard continuity"}`
    : "This is the first scene: establish the baseline.";

  const costume = characters
    .map(
      (c) => {
        const assets = getAllBestAssets(c.assets);
        return `${c.name}:
Hair: ${c.physicalTraits.hair}
Clothing: ${typeof c.physicalTraits.clothing === "string" ? c.physicalTraits.clothing : c.physicalTraits.clothing?.join(", ")}
Accessories: ${c.physicalTraits.accessories?.join(", ") || "None"}
${assets[ 'character_image' ]?.data ? `Reference: ${resolvePublicUrl(assets[ 'character_image' ]?.data)}` : ""}`;
      })
    .join("\n\n");

  const productionDesign = `${location.name}:
Type: ${location.type || "Unspecified"}
Time of Day: ${location.timeOfDay}
Key Elements: ${[ ...(location.naturalElements || []), ...(location.manMadeObjects || []) ].join(", ")}
${locationAssets[ 'location_image' ]?.data ? `Reference: ${resolvePublicUrl(locationAssets[ 'location_image' ]?.data)}` : ""}`;

  return {
    director,
    cinematographer,
    lighting,
    scriptSupervisor,
    costume,
    productionDesign,
  };
};

export function composeGenerationRules(generationRules?: string[]) {
  const rules = generationRules && generationRules.length > 0 ? `Output rules:
${generationRules.map(r => `• ${r}`).join('\n')}
` : "";
  return rules;
}

/**
 * Helper to extract and format generation rules from evaluation
 */
export const extractGenerationRules = (evaluations: QualityEvaluationResult[]): string[] => {
  const rules: string[] = [];

  for (const evaluation of evaluations) {
    if (evaluation.ruleSuggestion && typeof evaluation.ruleSuggestion === "string") {
      rules.push(evaluation.ruleSuggestion);
    }
  }

  return [ ...new Set(rules) ];
};
