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
${formatCharacterSpecs(characters)}

Locations:
${formatLocationSpecs(locations)}

For each scene, provide specifications from three departments:
${buildDirectorSceneBeatPrompt()}

${buildCinematographerGuidelines()}

${buildGafferGuidelines()}

OUTPUT FORMAT: 
Produce JSON matching this exact structure:
${schema}
`;