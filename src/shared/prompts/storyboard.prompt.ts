export const promptVersion = "0.1.0";

import { CharacterAttributes } from "../types/character.types.js";
import { LocationAttributes } from "../types/location.types.js";
import { buildGafferGuidelines } from "./role-gaffer.prompt.js";
import { buildCharacterFullSpec } from "./character-spec.prompt.js";
import { buildLocationFullSpec } from "./location-spec.prompt.js";
import { buildCinematographerGuidelines } from "./role-cinematographer.prompt.js";

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

NARRATIVE INTENT (2-3 sentences):
- What happens in this scene (VISIBLE action only)
- Who is present and what they're doing
- What this moment means emotionally

CHARACTER ACTIONS & POSITIONS:
- Character name: [Action] at [Position: left/center/right/foreground/background]
- Character name: [Action] at [Position]
(List all characters in scene)

EMOTIONAL BEAT:
[Be specific: "mounting tension", "relief and joy", "quiet determination" - not "powerful"]

MUSICAL CONTEXT (if provided):
- Mood: [From audio analysis]
- Intensity: [low/medium/high]
- Tempo: [slow/moderate/fast/very_fast]

${buildCinematographerGuidelines()}
${buildGafferGuidelines()}

CONSTRAINTS:
- Focus on observable action (not internal states).
- Characters must be positioned clearly for cinematographer.
- Emotional beat must guide lighting and camera choices.

OUTPUT FORMAT: 
Format the storyboard into a JSON object matching this exact structure:
${schema}
`;