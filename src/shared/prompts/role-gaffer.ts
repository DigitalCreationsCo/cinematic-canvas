/**
 * @fileoverview Gaffer Role - Lighting Design
 * 
 * Defines the Gaffer department head persona for specifying lighting quality,
 * motivated sources, color temperature, and atmospheric effects.
 * 
 * @module shared/prompts/role-gaffer
 * 
 * @description
 * The Gaffer role is responsible for:
 * - Light quality specification (hard/soft, intensity)
 * - Motivated light sources (windows, practicals, natural light)
 * - Lighting direction and shadow placement
 * - Color temperature and atmospheric effects (fog, haze)
 * - Continuity of lighting across scenes
 * 
 * Exports:
 * - buildGafferPrompt: Full prompt for lighting design (UNUSED)
 * - buildGafferGuidelines: Reference guidelines for lighting options
 * - buildGafferLightingSpec: Concise lighting spec for scene prompts
 * 
 * @usage
 * Used by: prompt-composer.ts (buildGafferGuidelines, buildGafferLightingSpec)
 * Note: buildGafferPrompt is currently unused.
 */

export const promptVersion = "3.0.1";

import { Scene, Location, Lighting } from "../types/index.js";
import { getJSONSchema } from '../utils/utils.js';

export const buildGafferPrompt = (scene: Scene, location: Location, timeOfDay: string) => `
As the GAFFER, design lighting for Scene ${scene.id}.

LOCATION: ${location.name} | TIME: ${timeOfDay} | WEATHER: ${location.weather}
MOOD: ${scene.mood} | INTENSITY: ${scene.intensity}

${buildGafferGuidelines()}

SPECIFY all lighting parameters using the guidelines above.

CONSTRAINT: All lighting must be motivated (justified by visible or implied natural source).

OUTPUT: Structured lighting specifications (not technical jargon).
`;

/**
 * GAFFER - Lighting Design
 * Specifies lighting quality, motivated sources, color temperature, and atmospheric effects
 */
export const buildGafferGuidelines = () => `
GAFFER LIGHTING SPECIFICATIONS:

For each scene, specify:

LIGHT QUALITY:
${JSON.stringify(getJSONSchema(Lighting.shape.quality))}

MOTIVATED SOURCES (where does light come from?):
${JSON.stringify(getJSONSchema(Lighting.shape.motivatedSources))}

LIGHTING DIRECTION:
${JSON.stringify(getJSONSchema(Lighting.shape.direction))}

ATMOSPHERE:
${JSON.stringify(getJSONSchema(Lighting.shape.atmosphere))}

CONSTRAINT: All lighting must be MOTIVATED (justified by visible source or environment).
`;

export const buildGafferLightingSpec = (
  scene: Scene,
  location?: Location,
  timeOfDay?: string
) => `
LOCATION: ${location?.name || "Unspecified"}
TIME OF DAY: ${timeOfDay || location?.timeOfDay || "Unspecified"}
WEATHER: ${location?.weather || "Clear"}
SCENE MOOD: ${scene.mood}
SCENE LIGHTING: ${JSON.stringify(scene.lighting)}
INTENSITY: ${scene.intensity}

${buildGafferGuidelines()}

${scene.sceneIndex > 1
    ? `
CONTINUITY FROM PREVIOUS SCENE:
- Previous lighting must match UNLESS location/time changed
- If same location: lighting direction MUST be consistent
- If time passed: adjust intensity/color temperature appropriately
`
    : ""
  }
`;

