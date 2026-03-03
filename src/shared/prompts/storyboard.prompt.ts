export const promptVersion = "0.1.0";

import { CharacterAttributes, LocationAttributes } from "../types/index.js";
import { buildDirectorSceneBeatPrompt } from "./must-review/role-director.js";
import { buildGafferGuidelines } from "./role-gaffer.js";
import { buildCharacterFullSpec } from "./character-spec.prompt.js";
import { buildLocationFullSpec } from "./location-spec.prompt.js";
import { buildCinematographerGuidelines } from "./must-review/role-cinematographer.js";

/**
 * Compose storyboard enrichment prompt (Director + Cinematographer + Gaffer)
 * Used in Generation Point 1.4
 */
export const composeStoryboardEnrichmentPrompt = (
    enhancedPrompt: string,
    characters: CharacterAttributes[],
    locations: LocationAttributes[],
    schema: string,
    audioContext?: string
) => `Enrich the following narrative into a storyboard for a cinematic video project.
Narrative:
${enhancedPrompt}

${audioContext ? `Musical Context:\n${audioContext}` : ""}

Characters:
${characters.map((c) => buildCharacterFullSpec(c)).join("\n\n")}

Locations:
${locations.map((l) => buildLocationFullSpec(l)).join("\n\n")}

For each scene, provide specifications:
${buildDirectorSceneBeatPrompt()}
${buildCinematographerGuidelines()}
${buildGafferGuidelines()}

OUTPUT FORMAT: 
Produce JSON matching this exact structure:
${schema}
`;