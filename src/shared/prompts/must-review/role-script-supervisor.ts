/**
 * @fileoverview Script Supervisor Role - Continuity Tracking
 * 
 * Defines the Script Supervisor department head persona for ensuring visual
 * continuity across all scenes for characters, locations, props, and spatial geography.
 * 
 * @module shared/prompts/role-script-supervisor
 * 
 * @description
 * The Script Supervisor role is responsible for:
 * - Character continuity (hair, clothing, accessories, physical state)
 * - Location continuity (lighting, weather, time progression)
 * - Spatial continuity (180° line rule, exit/entry consistency)
 * - Prop persistence (objects remain unless explicitly removed)
 * - Temporal continuity (time progression, accumulated damage/wear)
 * 
 * Exports:
 * - buildScriptSupervisorContinuityChecklist: Detailed continuity checklist
 * - buildScriptSupervisorPrompt: Full prompt for continuity verification (UNUSED)
 * 
 * @usage
 * Used by: prompt-composer.ts (buildScriptSupervisorContinuityChecklist)
 * Note: buildScriptSupervisorPrompt is currently unused.
 */

export const promptVersion = "3.0.0";

import { Scene, Character, Location } from "../../types/index.js";
import { getAllBestAssets } from "../../utils/assets-utils.js";
import { resolvePublicUrl } from "../../utils/utils.js";
import { formatCharacterTemporalState, formatLocationTemporalState } from "./prompt-utils.js";
import { buildCostumeNarrativeInstructions } from "../role-costume-designer.js";
import { buildProductionDesignerNarrative } from "../role-set-designer.js";

/**
 * SCRIPT SUPERVISOR - Continuity Tracking
 * Ensures visual continuity across all scenes for characters, locations, props, and spatial geography
 */
export const buildScriptSupervisorContinuityChecklist = (
      scene: Scene,
      previousScene: Scene | undefined,
      characters: Character[],
      locations: Location[],
) => {
      const location = locations.find((l) => l.id === scene.locationId);
      const previousLocation = previousScene?.locationId ? locations.find((l) => l.id === previousScene.locationId) : undefined;
      const previousSceneEndFrame = getAllBestAssets(previousScene?.assets)[ 'scene_end_frame' ]?.data || "N/A";
      return `
Continuity Notes for Scene ${scene.sceneIndex}:
${previousScene ? `
PREVIOUS SCENE (${previousScene.sceneIndex}):
Description: ${previousScene.description}
Lighting: ${JSON.stringify(previousScene.lighting)}
Characters: ${previousScene.characterIds.join(", ")}
Location Reference ID: ${previousScene.locationReferenceId}
Previous Scene Continuinty Notes (Must inform state of the current scene): ${previousScene.continuityNotes}
Previous Scene end frame image (Current state resumes from this image): ${resolvePublicUrl(previousSceneEndFrame)}
` : `Opening Scene: Establish strong narrative foundations. Set initial states for all characters and location.
`}

CURRENT SCENE (${scene.sceneIndex}):
Description: ${scene.description}
Characters: ${scene.characterIds.join(", ")}
Location Reference ID: ${scene.locationReferenceId}

CHARACTER CONTINUITY:
${characters.map((char) => `${buildCostumeNarrativeInstructions(char)}
${formatCharacterTemporalState(char)}`).join("\n\n")}

LOCATION CONTINUITY:
${location ? buildProductionDesignerNarrative(location) : "The scene is set in an unspecified location."}
${location ? formatLocationTemporalState(location) : ""}
☐ Lighting Direction: ${previousScene
                  ? "[MUST match unless time/location changed]"
                  : "[Establish baseline lighting direction]"
            }
☐ Weather: ${location?.weather || "Clear"} ${previousScene
                  ? "[Can evolve gradually: rain→drizzle→stop, not instant changes]"
                  : ""
            }
☐ Time Progression: ${previousScene ? "[How much time has passed since previous scene?]" : "[Starting time of day]"
            }
☐ Props: ${previousScene
                  ? "[Any objects from previous scene must remain/persist unless removed]"
                  : "[Establish what objects are present]"
            }

SPATIAL CONTINUITY (Screen Direction):
180° Line Rule: Characters on same side of imaginary line maintain left/right positions
${previousScene
                  ? `
Previous Positions: [Document where each character was: left/center/right]
Current Positions: [Maintain spatial relationships OR show motivated movement]
Exit/Entry: [If character exits frame-left, they enter next scene frame-right, and vice versa]
`
                  : `
Establish Geography: [Define who is where, facing which direction]
Spatial Relationships: [Who is left/right relative to each other]
`
            }

${previousScene
                  ? `CARRYFORWARD NOTES:
FROM PREVIOUS SCENE:
- Lighting: ${JSON.stringify(previousScene.lighting)}
- Character States: [List any damage, exhaustion, emotional carryover from the previous scene]
- Props in Play: [List previous objects that must continue to be present in the current scene]
${previousLocation?.weather ? `- Weather: ${previousLocation.weather}` : ""}
`
                  : ``}
FOR NEXT SCENE:
- Please list current states to preserve: [What the NEXT scene must inherit]
- Character positions at end of this scene: [Where each character finishes]
- Any accumulated changes: [Track progressive wear, damage, etc.]

CONSTRAINT:
When in doubt, match scene, character, and location states exactly. Only allow evolution from previous scene states if there is clear narrative justification.
When visual continuity must break (in the case of location change, camera movement, etc.), evolve the state and note the reason for it.`;
};

export const buildScriptSupervisorPrompt = (
      scene: Scene,
      previousScene: Scene | undefined,
      characters: Character[],
      locations: Location[]
) => `
As the SCRIPT SUPERVISOR, ensure continuity for Scene ${scene.id}.

VERIFY ALL ITEMS BEFORE PRODUCING OUTPUT:
${buildScriptSupervisorContinuityChecklist(scene, previousScene, characters, locations)}

// OUTPUT: Completed continuity checklist with all items verified.
`;
