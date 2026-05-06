export const promptVersion = "4.0.0";

import { AudioAnalysisAttributes } from "../types/audio.types.js";
import { VALID_DURATIONS } from "../types/base.types.js";
import { CharacterAttributes } from "../types/character.types.js";
import { LocationAttributes } from "../types/location.types.js";
import { buildCinematographerGuidelines } from "./role-cinematographer.prompt.js";
import { buildGafferGuidelines } from "./role-gaffer.prompt.js";

function formatCharacterForPrompt(char: CharacterAttributes): string {
  return `Name: ${char.name}
Reference ID: ${char.referenceId}
Aliases: ${char.aliases?.join(", ") || "none"}
Age: ${char.physicalTraits.age}
Gender: ${char.physicalTraits.gender}
Physical Build: ${char.physicalTraits.build}
Hair: ${char.physicalTraits.hair}
Clothing: ${Array.isArray(char.physicalTraits.clothing) ? char.physicalTraits.clothing.join(", ") : char.physicalTraits.clothing}
Accessories: ${Array.isArray(char.physicalTraits.accessories) ? char.physicalTraits.accessories.join(", ") : "none"}
Distinctive Features: ${Array.isArray(char.physicalTraits.distinctiveFeatures) ? char.physicalTraits.distinctiveFeatures.join(", ") : "none"}
Ethnicity: ${char.physicalTraits.ethnicity}
Emotional State: ${char.state?.emotionalState || "neutral"}`;
}

function formatLocationForPrompt(loc: LocationAttributes): string {
  return `Name: ${loc.name}
Reference ID: ${loc.referenceId}
Type: ${loc.type}
Time of Day: ${loc.timeOfDay}
Weather: ${loc.weather}
Mood: ${loc.mood}
Color Palette: ${Array.isArray(loc.colorPalette) ? loc.colorPalette.join(", ") : "not specified"}
Architecture: ${Array.isArray(loc.architecture) ? loc.architecture.join(", ") : "not specified"}
Natural Elements: ${Array.isArray(loc.naturalElements) ? loc.naturalElements.join(", ") : "not specified"}
Man-Made Objects: ${Array.isArray(loc.manMadeObjects) ? loc.manMadeObjects.join(", ") : "not specified"}`;
}

/**
 * DIRECTOR - Creative Vision & Story Development
 * Establishes overall creative vision, characters, locations, and scene beats
 * 
 * @param existingCharacters - Pre-created characters to use (instead of generating new ones)
 * @param existingLocations - Pre-created locations to use (instead of generating new ones)
 */
export const buildDirectorVisionPrompt = (
  title: string,
  userPrompt: string,
  schema?: string,
  audioSegments?: AudioAnalysisAttributes[ 'segments' ],
  totalDuration?: number,
  existingCharacters?: CharacterAttributes[],
  existingLocations?: LocationAttributes[],
) => {
  const audioContext = audioSegments
    ? `Musical Structure: ${audioSegments.length} segments
Mood Range: ${audioSegments[ 0 ]?.mood || "N/A"} → ${audioSegments[ audioSegments.length - 1 ]?.mood || "N/A"}
Duration: ${totalDuration || 0}s`
    : "Establish narrative pacing based on creative intent";

  const hasPreExistingEntities = (existingCharacters?.length ?? 0) > 0 || (existingLocations?.length ?? 0) > 0;
  const preExistingEntitiesSection = hasPreExistingEntities ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRE-EXISTING ENTITIES (ANCHOR YOUR STORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
The following characters and locations are already defined. Anchor your story around them.
You MAY create complementary new characters/locations if the narrative demands it (e.g., antagonists, supporting cast, new locations visited).
${(existingCharacters?.length ?? 0) > 0 ? `

CHARACTERS (use these as your protagonists/antagonists):
${existingCharacters!.map(c => formatCharacterForPrompt(c)).join("\n\n")}` : ""}
${(existingLocations?.length ?? 0) > 0 ? `

LOCATIONS (use these as your primary settings):
${existingLocations!.map(l => formatLocationForPrompt(l)).join("\n\n")}` : ""}
` : "";

  const charactersSection = hasPreExistingEntities ? `Build upon the PRE-EXISTING CHARACTERS above. Define additional characters only if the narrative requires them (e.g., supporting roles, antagonists, crowd characters). Each additional character requires:
Name: [Descriptive if unnamed]
Age: [Specific number or range]
Physical Build: [Height descriptor, body type]
Face: [Shape, prominent features, skin tone - NO celebrity references]
Hair: [Exact color, length, style]
Clothing: [List specific garments with colors, fit, condition]
Accessories: [Jewelry, bags, props]
Emotional State: [How they feel entering this story]
Character Arc: [What changes for them from start to end - 1 sentence]
Key Actions: [3-5 specific VISIBLE things they DO]` : `CHARACTERS (Each character requires):
Name: [Descriptive if unnamed: "The Surfer", "Lead Contestant"]
Age: [Specific number or range like "28-30"]
Physical Build: [Height descriptor, body type - be concrete]
Face: [Shape, prominent features, skin tone - NO celebrity references]
Hair: [Exact color, length, style, texture]
Clothing: [List specific garments with colors, fit, condition]
Accessories: [Jewelry, bags, props - list each item]
Emotional State: [How they feel entering this story]
Character Arc: [What changes for them from start to end - 1 sentence]
Key Actions: [3-5 specific VISIBLE things they DO in the video]`;

  const locationsSection = hasPreExistingEntities ? `Build upon the PRE-EXISTING LOCATIONS above. Define additional locations only if the narrative requires them (e.g., new environments visited, contrasting settings). Each additional location requires:
Name: [Specific place]
Type: [Beach/urban street/warehouse/forest/etc.]
Time of Day: [Exact time like "2:30 PM golden hour", "pre-dawn 5:45 AM"]
Weather: [Clear/overcast/foggy/raining/snowing]
Key Visual Elements: [List 5-7 specific things visible]
Atmosphere: [Bustling/abandoned/tense/peaceful - concrete descriptor]
Color Palette: [3-5 dominant colors]` : `LOCATIONS (Each location requires):
Name: [Specific place]
Type: [Beach/urban street/warehouse/forest/etc.]
Time of Day: [Exact time like "2:30 PM golden hour", "pre-dawn 5:45 AM"]
Weather: [Clear/overcast/foggy/raining/snowing]
Key Visual Elements: [List 5-7 specific things visible: "palm trees", "graffiti wall", "wet pavement"]
Atmosphere: [Bustling/abandoned/tense/peaceful - concrete descriptor]
Color Palette: [3-5 dominant colors in this location]`;

  return `You are the DIRECTOR establishing the creative vision for a cinematic music video.

INPUT:
Creative Concept: ${userPrompt}
${audioContext}
${preExistingEntitiesSection}

OUTPUT REQUIRED (4 sections only):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. CONCEPT & VISION (2-3 sentences)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Title: ${`"${title}"` || "Generate a compelling, emotionally resonant title that fits the story's theme, tone, and intent."}
- Logline: One sentence capturing the core story
- Visual Style: [Realistic/stylized/noir/vibrant/desaturated - pick one]
- Emotional Arc: [Beginning mood] → [Middle evolution] → [Ending resolution]
- Narrative Structure: [Linear/parallel storylines/flashback/circular - pick one each]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. CHARACTERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${charactersSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. LOCATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${locationsSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. SCENE BEAT STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For each musical segment or narrative beat:

Scene ID: [Number]
Timing: [Start time]-[End time] ([Duration]s)
Musical Context: [Mood, intensity, tempo if audio provided]
Action: [What happens - 2 sentences max, VISIBLE action only]
Character Positions: [Who is where - left/center/right, foreground/background]
Emotional Beat: [What this moment conveys - be specific]

${buildCinematographerGuidelines()}
${buildGafferGuidelines()}

CONSTRAINTS:
- NO philosophical language about "authenticity" or "being human".
- NO dialogue or sonic descriptions (this is VISUAL medium).
- NO vague terms like "powerful" or "impactful" - use concrete descriptors.
- NO celebrity likeness.
- If age < 18, describe as "young adult (20 years old)".
- Each scene action MUST be VISUALLY OBSERVABLE (no internal thoughts).
- Scene durations MUST be ${VALID_DURATIONS.join(", ")} seconds ONLY.
- It is not your job to generate urls - any urls, be sure to leave them empty or undefined.
- Focus on observable action (not internal states).
- Characters must be positioned clearly for cinematographer.
- Emotional beat must guide lighting and camera choices.

${schema ? `OUTPUT FORMAT: Structured storyboard matching the schema provided (JSON):
  ${schema}` : ''}
`;
};
