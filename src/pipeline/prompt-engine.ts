/**
 * @fileoverview Legacy Prompt Engine - Simple Cinematic Prompt Builder
 * 
 * A legacy utility for constructing basic cinematic prompts from scene data.
 * This is a simplified alternative to the role-based prompt-composer.ts system.
 * 
 * @module pipeline/prompt-engine
 * 
 * @description
 * This module provides a straightforward prompt construction function that
 * assembles scene information into a basic text prompt format. Unlike the
 * comprehensive role-based system in prompt-composer.ts, this focuses on
 * essential elements: scene description, location, characters, cinematography,
 * and lighting.
 * 
 * @usage
 * Currently UNUSED in production. Only referenced in tests.
 * Consider removing or integrating with prompt-composer.ts.
 * 
 * @see prompt-composer.ts - The active role-based prompt composition system
 */

import {
  Cinematography, Lighting, PhysicalTraits, DirectorScene, Location, Character
} from "../shared/types/index.js";

export const buildCinematicPrompt = (
  scene: DirectorScene,
  cinematography: Cinematography,
  lighting: Lighting,
  characters: Character[],
  location: Location
): string => {
  const parts: string[] = [];

  // 1. Scene Description & Mood
  parts.push(`Scene Description: ${scene.description}`);
  if (scene.mood) parts.push(`Mood: ${scene.mood}`);

  // 2. Location
  parts.push(`Location: ${location.name}. ${location.lightingConditions.quality.hardness} lighting.`);
  if (location.weather) parts.push(`Weather: ${location.weather}`);
  if (location.timeOfDay) parts.push(`Time: ${location.timeOfDay}`);

  // 3. Characters
  if (characters.length > 0) {
    const charDescriptions = characters.map(c => {
      const traits = c.physicalTraits;
      let desc = `${c.name}: ${traits.hair}, wearing ${Array.isArray(traits.clothing) ? traits.clothing.join(", ") : traits.clothing}`;
      if (traits.distinctiveFeatures.length > 0) desc += `, ${traits.distinctiveFeatures.join(", ")}`;
      return desc;
    });
    parts.push(`Characters: ${charDescriptions.join("; ")}`);
  }

  // 4. Cinematography
  parts.push(`Camera: ${cinematography.shotType}, ${cinematography.cameraMovement}, ${cinematography.cameraAngle}.`);
  if (cinematography.composition) parts.push(`Composition: ${cinematography.composition}`);

  // 5. Lighting Details
  if (Object.values(lighting.motivatedSources).length > 0) {
    parts.push(`Lighting Sources: ${Object.values(lighting.motivatedSources).join(", ")}`);
  }
  if (lighting.quality.colorTemperature) {
    parts.push(`Color Temp: ${lighting.quality.colorTemperature}`);
  }

  return parts.join("\n");
};
