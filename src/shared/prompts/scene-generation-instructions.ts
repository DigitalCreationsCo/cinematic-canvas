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
import { composeGenerationRules, formatCharacterTemporalState, formatLocationTemporalState } from "./must-review/prompt-utils.js";

// TESTING VIDEO OUTPUTS:
// TODO: EXPERIMENT WITH A PREFACE 'CINEMATIC DIRECTOR / PRODUCER' HEADING AND WITHOUT
// a/b test prompts on 2 scenes each

/**
 * Compose enhanced scene prompt for video generation
 * Used in Generation Point 3.3
 */
export const composeEnhancedSceneGenerationPromptMetav1 = (
    scene: Scene,
    characters: Character[],
    locations: Location[],
    previousScene?: Scene,
    generationRules?: string[],
): string => {

    const previousSceneAssets = getAllBestAssets(previousScene?.assets);
    const sceneAssets = getAllBestAssets(scene.assets);
    const startFrame = sceneAssets[ 'scene_start_frame' ]?.data;
    const endFrame = sceneAssets[ 'scene_end_frame' ]?.data;

    const location = locations.find((l) => l.id === scene.locationId)!;

    return `${buildScriptSupervisorContinuityChecklist(scene, previousScene, characters, locations)}
  ${buildCinematographerNarrative(scene)}

Mood: ${scene.mood} (Intensity: ${scene.intensity})
- Duration: ${scene.duration}s

Lighting specifications for Scene ${scene.sceneIndex}:
${buildGafferLightingSpec(scene, location, location?.timeOfDay)}

${scene.continuityNotes?.map((n) => `- ${n}`).join("\n") || ""}

REFERENCE IMAGES:
${startFrame && `Start Frame Image: ${resolvePublicUrl(startFrame)}` || ""}
${endFrame && `End Frame Image: ${resolvePublicUrl(endFrame)}` || ""}

${composeGenerationRules(generationRules)}

INSTRUCTIONS:
Compose the above information into a brief, cohesive paragraph.
Focus on visual details, effectively conveying the action, and scene atmosphere.
Explicitly describe the camera movement and lighting as per the cinematography specs.
Ensure character appearance and state (costume details, any dirt, injuries, etc.) are accurately described.
Ensure the output strictly adheres to the above instructions and any generation rules.
Optimize the prompt to produce high quality cinematic video output.

OUTPUT FORMAT:
Output only the prompt text itself, no additional text.
`;
};

export const composeEnhancedSceneGenerationPromptMetav2 = (
    scene: Scene,
    characters: Character[],
    location: Location,
    previousScene?: Scene,
    generationRules?: string[],
): string => {

    const previousSceneAssets = getAllBestAssets(previousScene?.assets);
    const sceneAssets = getAllBestAssets(scene.assets);
    const startFrame = sceneAssets[ 'scene_start_frame' ]?.data;
    const endFrame = sceneAssets[ 'scene_end_frame' ]?.data;
    const continuityNotes = previousScene
        ? `
CONTINUITY FROM SCENE ${previousScene.id}:
- Action Flows From: ${previousScene.description}
- Reference End Frame: ${previousSceneAssets?.[ 'scene_end_frame' ]?.data || "N/A"}
`
        : "First scene.";

    const characterNarratives = characters.length > 0
        ? characters.map((c) => `${buildCostumeNarrativeInstructions(c)}
${formatCharacterTemporalState(c)}`).join("\n\n")
        : "";

    return `Scene ID: ${scene.id}

${buildCinematographerNarrative(scene)}

${scene.description}

Mood: ${scene.mood} (Intensity: ${scene.intensity})
- Duration: ${scene.duration}s

Lighting: ${JSON.stringify(scene.lighting)}

CHARACTERS:
${characterNarratives}

SETTING (Location & Atmosphere):
${buildProductionDesignerNarrative(location)}
${formatLocationTemporalState(location)}

CONTINUITY REQUIREMENTS:
${continuityNotes}
${scene.continuityNotes?.map((n) => `- ${n}`).join("\n") || ""}

REFERENCE IMAGES:
${startFrame && `- Start Frame: ${resolvePublicUrl(startFrame)}` || ""}
${endFrame && `- End Frame: ${resolvePublicUrl(endFrame)}` || ""}

${composeGenerationRules(generationRules)}

INSTRUCTIONS FOR WRITING THE PROMPT:
1. Synthesize all the above information into a SINGLE, cohesive paragraph.
2. Focus on VISUAL details, MOVEMENT, and ATMOSPHERE.
3. Explicitly describe the camera movement and lighting as per the cinematography specs.
4. Ensure character appearance and state (injuries, dirt, costume) are accurately described.
5. The prompt should be optimized for a high-end video generation model (like LTX-Video or Sora).
6. Do NOT include phrases like "Here is the prompt" or "Scene Description:". Just output the prompt text itself.
7. If there are generation rules, ensure the prompt strictly adheres to them.

OUTPUT FORMAT:
Return only the prompt text.
`;
};