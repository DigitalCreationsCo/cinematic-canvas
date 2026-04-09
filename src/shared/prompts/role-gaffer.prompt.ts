import { SceneWithAssets, LocationWithAssets, Lighting } from "../types/index.js";
import { getModelCompatibleSchema } from '../utils/utils.js';

export const promptVersion = "3.0.1";

export const buildGafferPrompt = (scene: SceneWithAssets, location: LocationWithAssets, timeOfDay: string) => `
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
${JSON.stringify(getModelCompatibleSchema(Lighting.shape.quality))}

MOTIVATED SOURCES (where does light come from?):
${JSON.stringify(getModelCompatibleSchema(Lighting.shape.motivatedSources))}

LIGHTING DIRECTION:
${JSON.stringify(getModelCompatibleSchema(Lighting.shape.direction))}

ATMOSPHERE:
${JSON.stringify(getModelCompatibleSchema(Lighting.shape.atmosphere))}

CONSTRAINT: All lighting must be MOTIVATED (justified by visible source or environment).
`;

export const buildGafferLightingSpec = (
  scene: SceneWithAssets,
  location: LocationWithAssets,
  timeOfDay?: string
) => {

  const lighting = location.lightingConditions;

  const lightingDesc = [
    lighting.atmosphere.haze,
    lighting.direction.contrastRatio && `${lighting.direction.contrastRatio} contrast ratio`,
    lighting.direction.keyLightPosition && `${lighting.direction.keyLightPosition} key light position`,
    lighting.direction.shadowDirection && `${lighting.direction.shadowDirection} shadow direction`,
    lighting.motivatedSources.accentLight && `${lighting.motivatedSources.accentLight} accent light`,
    lighting.motivatedSources.fillLight && `${lighting.motivatedSources.fillLight} fill light`,
    lighting.motivatedSources.lightBeams && `${lighting.motivatedSources.lightBeams} light beams`,
    lighting.motivatedSources.practicalLights && `${lighting.motivatedSources.practicalLights} practical lights`,
    lighting.motivatedSources.primaryLight && `${lighting.motivatedSources.primaryLight} primary light`,
    lighting.quality.colorTemperature && `${lighting.quality.colorTemperature} color temperature`,
    lighting.quality.hardness && `${lighting.quality.hardness} light hardness`,
    lighting.quality.intensity && `${lighting.quality.intensity} light intensity`,
  ].filter(Boolean).join(", ");

  return [
    `${timeOfDay || location?.timeOfDay || ""}`,
    lightingDesc ? `Lit by ${lightingDesc}.` : "Natural lighting matching the time of day."
  ];
};