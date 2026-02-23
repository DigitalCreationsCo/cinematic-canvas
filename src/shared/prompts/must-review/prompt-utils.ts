/**
 * @fileoverview Prompt Composer - Role-Based Prompt Orchestration
 * 
 * Core utility module that orchestrates the composition of multiple role-based
 * department prompts into cohesive generation instructions for the cinematic
 * production workflow.
 * 
 * @module shared/prompts/prompt-composer
 * 
 * @description
 * This module serves as the central hub for assembling prompts from various
 * production department roles. It combines inputs from:
 * - Director (narrative intent)
 * - Cinematographer (shot composition)
 * - Gaffer (lighting design)
 * - Script Supervisor (continuity)
 * - Costume & Makeup (character appearance)
 * - Production Designer (location/environment)
 * 
 * Key composition functions:
 * - composeStoryboardEnrichmentPrompt: Assemble storyboard prompts
 * - composeFrameGenerationPromptMeta: Keyframe generation prompts
 * - composeEnhancedSceneGenerationPromptMeta: Video generation prompts
 * - composeDepartmentSpecs: Evaluation specification assembly
 * - composeGenerationRules: Rule injection formatting
 * 
 * @usage
 * Used by: compositional-agent.ts, frame-composition-agent.ts, 
 *          continuity-manager.ts, quality-evaluation-instruction.ts
 * 
 * @see role-*.ts - Individual department prompt builders
 */

/**
 * PROMPT COMPOSER - Role-Based Prompt Composition Utilities
 *
 * This module provides helper functions for composing multi-role prompts
 * at various generation points in the workflow.
 */

import { Scene, Character, Location, QualityEvaluationResult, CharacterAttributes, LocationAttributes } from "../../types/index.js";
import { buildDirectorSceneBeatPrompt } from "./role-director.js";
import { buildGafferGuidelines, buildGafferLightingSpec } from "../role-gaffer.js";
import { buildScriptSupervisorContinuityChecklist } from "./role-script-supervisor.js";
import { buildCostumeSpec, buildCostumeNarrativeInstructions } from "../role-costume-designer.js";
import { buildProductionDesignerSpec, buildProductionDesignerNarrative } from "../role-set-designer.js";
import { formatCharacterSpecs, formatLocationSpecs } from "../../utils/type-utils.js";
import { buildCinematographerGuidelines, buildCinematographerNarrative } from "./role-cinematographer.js";
import { getAllBestAssets } from "../../utils/assets-utils.js";
import { resolvePublicUrl } from "../../utils/utils.js";

/**
 * Format character temporal state for prompts
 */
export const formatCharacterTemporalState = (character: Character): string => {
  if (!character.state) return "";

  const state = character.state;
  const parts: string[] = [];

  // Physical condition
  if (state.injuries && state.injuries.length > 0) {
    parts.push(`Injuries: ${state.injuries.map(inj => `${inj.type} on ${inj.location} (${inj.severity})`).join(", ")}`);
  }

  // Dirt/exhaustion/sweat
  if (state.dirtLevel && state.dirtLevel !== "clean") {
    parts.push(`Dirt Level: ${state.dirtLevel.replace("_", " ")}`);
  }
  if (state.exhaustionLevel && state.exhaustionLevel !== "fresh") {
    parts.push(`Exhaustion: ${state.exhaustionLevel.replace("_", " ")}`);
  }
  if (state.sweatLevel && state.sweatLevel !== "dry") {
    parts.push(`Sweat: ${state.sweatLevel}`);
  }

  // Costume condition
  if (state.costumeCondition) {
    const { tears, stains, wetness, damage } = state.costumeCondition;
    if (tears && tears.length > 0) {
      parts.push(`Costume Tears: ${tears.join(", ")}`);
    }
    if (stains && stains.length > 0) {
      parts.push(`Costume Stains: ${stains.join(", ")}`);
    }
    if (wetness && wetness !== "dry") {
      parts.push(`Costume Wetness: ${wetness}`);
    }
    if (damage && damage.length > 0) {
      parts.push(`Costume Damage: ${damage.join(", ")}`);
    }
  }

  // Hair condition
  if (state.hairCondition) {
    const { messiness, wetness } = state.hairCondition;
    if (messiness && messiness !== "pristine") {
      parts.push(`Hair: ${messiness.replace("_", " ")}`);
    }
    if (wetness && wetness !== "dry") {
      parts.push(`Hair Wetness: ${wetness}`);
    }
  }

  return parts.length > 0
    ? `\nCURRENT STATE (MUST MAINTAIN):\n${parts.map(p => `  - ${p}`).join("\n")}`
    : "";
};

/**
 * Format location temporal state for prompts
 */
export const formatLocationTemporalState = (location: Location): string => {
  if (!location.state) return "";

  const state = location.state;
  const parts: string[] = [];

  // Time and weather
  if (state.timeOfDay) {
    parts.push(`Time of Day: ${state.timeOfDay}`);
  }
  if (state.weather) {
    parts.push(`Weather: ${state.weather}`);
  }
  if (state.precipitation && state.precipitation !== "none") {
    parts.push(`Precipitation: ${state.precipitation}`);
  }
  if (state.visibility && state.visibility !== "clear") {
    parts.push(`Visibility: ${state.visibility.replace("_", " ")}`);
  }

  // Ground condition
  if (state.groundCondition) {
    const { wetness, debris, damage } = state.groundCondition;
    if (wetness && wetness !== "dry") {
      parts.push(`Ground: ${wetness}`);
    }
    if (debris && debris.length > 0) {
      parts.push(`Debris: ${debris.join(", ")}`);
    }
    if (damage && damage.length > 0) {
      parts.push(`Environmental Damage: ${damage.join(", ")}`);
    }
  }

  // Broken objects
  if (state.brokenObjects && state.brokenObjects.length > 0) {
    parts.push(`Broken Objects: ${state.brokenObjects.map(obj => obj.description).join(", ")}`);
  }

  // Atmospheric effects
  if (state.atmosphericEffects && state.atmosphericEffects.length > 0) {
    const active = state.atmosphericEffects.filter(e => !e.dissipating);
    if (active.length > 0) {
      parts.push(`Atmospheric Effects: ${active.map(e => `${e.type} (${e.intensity})`).join(", ")}`);
    }
  }

  return parts.length > 0
    ? `\nCURRENT STATE (MUST MAINTAIN):\n${parts.map(p => `  - ${p}`).join("\n")}`
    : "";
};

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

export const composeDepartmentSpecs = (
  scene: Scene,
  characters: Character[],
  location: Location,
  previousScene?: Scene
): DepartmentSpecsForEvaluation => {

  const locationAssets = getAllBestAssets(location.assets);
  return {
    director: `Scene ${scene.id}: ${scene.description}
Mood: ${scene.mood} | Intensity: ${scene.intensity} | Tempo: ${scene.tempo}`,

    cinematographer: `Shot Type: ${scene.shotType}
Camera Movement: ${scene.cameraMovement}
Composition: ${JSON.stringify(scene.composition)}`,

    lighting: `Lighting: ${JSON.stringify(scene.lighting)}
Time of Day: ${location.timeOfDay}
Weather: ${location.weather || "Clear"}`,

    scriptSupervisor: previousScene
      ? `Continue from previous scene ${previousScene.id}:
- Previous action: ${previousScene.description}
- Previous lighting: ${JSON.stringify(previousScene.lighting)}
- Continuity notes: ${scene.continuityNotes?.join("; ") || "Standard continuity"}`
      : "This is the first scene: establish the baseline.",

    costume: characters
      .map(
        (c) => {
          const assets = getAllBestAssets(c.assets);
          return `${c.name}:
Hair: ${c.physicalTraits.hair}
Clothing: ${typeof c.physicalTraits.clothing === "string" ? c.physicalTraits.clothing : c.physicalTraits.clothing?.join(", ")}
Accessories: ${c.physicalTraits.accessories?.join(", ") || "None"}
${assets[ 'character_image' ]?.data ? `Reference: ${assets[ 'character_image' ]?.data}` : ""}`;
        })
      .join("\n\n"),

    productionDesign: `${location.name}:
Type: ${location.type || "Unspecified"}
Time of Day: ${location.timeOfDay}
Key Elements: ${[ ...(location.naturalElements || []), ...(location.manMadeObjects || []) ].join(", ")}
${locationAssets[ 'location_image' ]?.data ? `Reference: ${locationAssets[ 'location_image' ]?.data}` : ""}`,
  };
};

export function composeGenerationRules(generationRules?: string[]) {
  const rules = generationRules && generationRules.length > 0 ? `
  The following rules are mandatory constraints. Any violation of the rules is a task failure.
  Please ensure the output complies with all GENERATION RULES.
  
  GENERATION RULES:
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
