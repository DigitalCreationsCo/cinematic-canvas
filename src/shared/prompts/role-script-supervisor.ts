export const promptVersion = "3.0.0";

import { Scene, Character, Location } from "../types/index.js";
import { getAllBestAssets } from "../utils/assets-utils.js";
import { resolvePublicUrl } from "../utils/utils.js";
import { buildCharacterFullSpec } from "./character-spec.prompt.js";
import { buildLocationFullSpec } from "./location-spec.prompt.js";

/**
 * SCRIPT SUPERVISOR - Continuity Tracking
 * Ensures visual continuity across all scenes for characters, locations, props, and spatial geography
 * Deep-state tracking for spatial, temporal, and physical continuity.
 */
export const buildScriptSupervisorContinuityChecklist = (
      scene: Scene,
      previousScene: Scene | undefined,
      characters: Character[],
      locations: Location[],
) => {

      try {
            const dataCurrentLocation = locations.find(l => l.id === scene.locationId);
            const dataPreviousEndFrame = getAllBestAssets(previousScene?.assets)?.scene_end_frame?.data;
            const isLocationChange = previousScene && previousScene.locationId !== scene.locationId;

            // 1. CHARACTER DEEP-STATE & RELATIONAL LOGIC
            const sectionCharacterContinuity = `Characters: ${characters.map(char => {
                  const { state } = char;
                  // Calculate Eyelines & Spatial Mapping
                  const eyelineLogic = state.position === 'left' ? "Looking RIGHT towards Center/Right" :
                        state.position === 'right' ? "Looking LEFT towards Center/Left" :
                              "Looking DIRECTLY at camera/forward";
                  return [
                        buildCharacterFullSpec(char),
                        `Positioned ${state.position || 'Center'}. Eyeline: ${eyelineLogic}.`,
                  ].join("\n  ");
            }).join("\n\n")}`;

            // 2. ENVIRONMENTAL & LIGHTING CONTINUITY
            const sectionEnvContinuity = dataCurrentLocation ? [ buildLocationFullSpec(dataCurrentLocation) ].join("\n") : "";

            // 3. THE "SUPERVISOR'S MANDATE" (Strict Constraints)
            const sectionMandate = [
                  `${characters.map(c => `${c.name} is ${c.state.position}`).join(", ")}.`,
                  `${isLocationChange ? "Maintain character state." : "Exact camera placement, subject, and location continuity is needed."}`,
                  `${dataPreviousEndFrame ? `Previous Scene End Frame: ${resolvePublicUrl(dataPreviousEndFrame)}` : ""}`,
                  `${scene.continuityNotes.join(". ")}`
            ].join(". ");

            return `${sectionCharacterContinuity}
${sectionEnvContinuity}
${sectionMandate}`.trim();

      } catch (error) {
            console.error(`[ScriptSupervisor][ERROR] Failed to compile continuity anchor: ${error}`);
            return "CONTINUITY ERROR: Ensure visual baseline matches previous scene manually.";
      }
};

// export const buildScriptSupervisorContinuityChecklist = (
//       scene: Scene,
//       previousScene: Scene | undefined,
//       characters: Character[],
//       locations: Location[],
// ) => {

//       const location = locations.find((l) => l.id === scene.locationId);
//       const previousLocation = previousScene?.locationId ? locations.find((l) => l.id === previousScene.locationId) : undefined;
//       const previousSceneEndFrame = getAllBestAssets(previousScene?.assets)[ 'scene_end_frame' ]?.data || "N/A";

//       return `Scene ${scene.sceneIndex}: ${scene.description}
// Continuity Notes for Scene ${scene.sceneIndex}:
// ${previousScene ? `
// PREVIOUS SCENE (${previousScene.sceneIndex}):
// Description: ${previousScene.description}
// Lighting: ${JSON.stringify(previousScene.lighting)}
// Characters: ${previousScene.characterIds.join(", ")}
// Location Reference ID: ${previousScene.locationReferenceId}
// Previous Scene Continuinty Notes (Must inform state of the current scene): ${previousScene.continuityNotes}
// Previous Scene end frame image (Current state resumes from this image): ${resolvePublicUrl(previousSceneEndFrame)}
// ` : `Opening Scene: Establish strong narrative foundations. Set initial states for all characters and location.
// `}

// Characters: ${scene.characterIds.join(", ")}
// Location Reference ID: ${scene.locationReferenceId}

// CHARACTER CONTINUITY:
// ${characters.map((char) => `${buildCharacterFullSpec(char)}`).join("\n")}

// LOCATION CONTINUITY:
// ${location ? buildLocationFullSpec(location) : "The scene is set in an unspecified location."}

// ☐ Lighting Direction: ${previousScene
//                   ? "[MUST match unless time/location changed]"
//                   : "[Establish baseline lighting direction]"
//             }
// ☐ Weather: ${location?.weather || "Clear"} ${previousScene
//                   ? "[Can evolve gradually: rain→drizzle→stop, not instant changes]"
//                   : ""
//             }
// ☐ Time Progression: ${previousScene ? "[How much time has passed since previous scene?]" : "[Starting time of day]"
//             }
// ☐ Props: ${previousScene
//                   ? "[Any objects from previous scene must remain/persist unless removed]"
//                   : "[Establish what objects are present]"
//             }

// SPATIAL CONTINUITY (Screen Direction):
// 180° Line Rule: Characters on same side of imaginary line maintain left/right positions
// ${previousScene
//                   ? `
// Previous Positions: [Document where each character was: left/center/right]
// Current Positions: [Maintain spatial relationships OR show motivated movement]
// Exit/Entry: [If character exits frame-left, they enter next scene frame-right, and vice versa]
// `
//                   : `
// Establish Geography: [Define who is where, facing which direction]
// Spatial Relationships: [Who is left/right relative to each other]
// `
//             }

// ${previousScene
//                   ? `CARRYFORWARD NOTES:
// FROM PREVIOUS SCENE:
// - Lighting: ${JSON.stringify(previousScene.lighting)}
// - Character States: [List any damage, exhaustion, emotional carryover from the previous scene]
// - Props in Play: [List previous objects that must continue to be present in the current scene]
// ${previousLocation?.weather ? `- Weather: ${previousLocation.weather}` : ""}
// `
//                   : ``}
// FOR NEXT SCENE:
// - Please list current states to preserve: [What the NEXT scene must inherit]
// - Character positions at end of this scene: [Where each character finishes]
// - Any accumulated changes: [Track progressive wear, damage, etc.]

// CONSTRAINT:
// When in doubt, match scene, character, and location states exactly. Only allow evolution from previous scene states if there is clear narrative justification.
// When visual continuity must break (in the case of location change, camera movement, etc.), evolve the state and note the reason for it.`
// };
