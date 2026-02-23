/**
 * @fileoverview Production Designer Role - Location & Environment Specification
 * 
 * Defines the Production Designer department head persona for specifying exact
 * environmental details and generating location reference images for continuity.
 * 
 * @module shared/prompts/role-set-designer
 * 
 * @description
 * The Production Designer role is responsible for:
 * - Location type and architectural details
 * - Environmental elements (natural and man-made)
 * - Atmospheric conditions (weather, visibility, color palette)
 * - Spatial layout and scale
 * - Time of day and lighting conditions
 * 
 * Exports:
 * - buildProductionDesignerPrompt: Full prompt for location reference image generation
 * - buildProductionDesignerSpec: Concise location spec for scene prompts
 * - buildProductionDesignerNarrative: Natural language location description
 * 
 * @usage
 * Used by: location-reference-image-prompt.ts, prompt-composer.ts
 */

export const promptVersion = "3.0.1";

import { Location } from "../types/index.js";
import { getAllBestAssets } from "../utils/assets-utils.js";

export const buildProductionDesignerPrompt = (location: Location): string => {
  if (!location) {
    console.error("❌ buildProductionDesignerPrompt: Location is undefined");
    return "PRODUCTION DESIGN SPECIFICATION: [Location Undefined]";
  }
  const assets = getAllBestAssets(location.assets);

  return `Location: ${location.name}: ${location.type || ""}
  ${assets[ 'location_description' ]?.data || ""}
Time of Day: ${location.timeOfDay}
Weather: ${location.weather || "Clear"}

Scenery:
${location.groundSurface
      ? `Ground Surface: ${location.groundSurface}`
      : "Ground Surface: Not specified"
    }
${location.skyOrCeiling
      ? `Sky/Ceiling: ${location.skyOrCeiling}`
      : "Sky/Ceiling: Not specified"
    }
    ${location.naturalElements && location.naturalElements.length > 0
      ? `Natural Elements: ${location.naturalElements.join(", ")}`
      : "Natural Elements: None specified"
    }
${location.architecture
      ? `Architecture: ${location.architecture}`
      : "Architecture: Not specified"
    }
${location.manMadeObjects && location.manMadeObjects.length > 0
      ? `Man-Made Objects: ${location.manMadeObjects.join(", ")}`
      : "Man-Made Objects: None specified"
    }

Conditions:
${JSON.stringify(location.lightingConditions)}
${location.colorPalette?.join(", ") || ""}

Spatial Layout:
Scale: Is the space intimate/small, medium, or large/expansive?
Depth: Are there foreground, midground, and background elements clearly defined?
Pathways: Thoughtfully consider how characters can move through this space

Image composition:
Frame a wide establishing shot showing full environment.
Natural lighting matching time of day and weather.
Eye-level, slight wide angle for context.
Deep depth of field (everything in focus)
${location.mood || "Neutral"} (convey through composition and light)
`;
};

export const buildProductionDesignerSpec = (location: Location): string => {
  if (!location) {
    console.error("❌ buildProductionDesignerSpec: Location is undefined");
    return "LOCATION SPEC: [Location Undefined]";
  }
  const assets = getAllBestAssets(location.assets);
  const referenceImage = assets[ 'location_image' ]?.data;

  return `
LOCATION SPEC: ${location.name}

Type: ${location.type || "Unspecified"}
Time of Day: ${location.timeOfDay}
Weather: ${location.weather || "Clear"}
Lighting: ${JSON.stringify(location.lightingConditions)}
Key Elements: ${[
      ...(location.naturalElements || []),
      ...(location.manMadeObjects || []),
    ].join(", ")}
Color Palette: ${location.colorPalette?.join(", ") || "Not specified"}

${referenceImage ? `REFERENCE IMAGE: ${referenceImage}` : ""}

CONSTRAINT: Environment MUST match reference image EXACTLY in all scenes at this location.
`;
};

export const buildProductionDesignerNarrative = (location: Location): string => {
  if (!location) {
    console.warn("⚠️ buildProductionDesignerNarrative: Location is undefined");
    return "[Location Undefined]";
  }
  const assets = getAllBestAssets(location.assets);

  const timeAndWeather = [
    location.timeOfDay,
    location.weather !== "Clear" ? location.weather : null
  ].filter(Boolean).join(", ");

  const elements = [
    ...(location.naturalElements || []),
    ...(location.manMadeObjects || [])
  ];

  const elementDesc = elements.length > 0
    ? ` The scene features ${elements.join(", ")}.`
    : "";

  const lighting = location.lightingConditions?.quality.hardness
    ? ` The lighting is ${JSON.stringify(location.lightingConditions)}.`
    : "";

  const mood = location.mood ? ` The atmosphere is ${location.mood.toLowerCase()}.` : "";

  return `Setting: ${location.name}, a ${location.type || "location"} during ${timeAndWeather}.${elementDesc}${lighting}${mood}${assets[ 'location_description' ]?.data ? ` ${assets[ 'location_description' ]?.data}` : ""}`;
};

