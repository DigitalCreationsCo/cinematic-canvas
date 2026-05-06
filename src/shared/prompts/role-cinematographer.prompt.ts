export const promptVersion = "3.0.1";

import { cameraAnglesWithDescriptions, cameraMovementsWithDescriptions, Composition, shotTypesWithDescriptions, transitionTypesWithDescriptions } from "../types/cinematography.types.js";
import { SceneWithAssets } from "../types/workflow.types.js";
import { getModelCompatibleSchema } from '../utils/utils.js';



/**
 * CINEMATOGRAPHER - Shot Composition & Framing
 * Specifies transition type, shot type, camera angle, camera movement, and composition
 * 
 */
export const buildCinematographerGuidelines = () => `
CINEMATOGRAPHER SPECIFICATIONS:
For each scene, select from these options. The specification should complement and enhance the narrative beat.

TRANSITION TYPE (choose ONE). Use the "Continuous" transition to indicate continous segments with no transition/changes from the previous scene (Extend the scene).
${JSON.stringify(transitionTypesWithDescriptions)}

SHOT TYPE (choose ONE):
${JSON.stringify(shotTypesWithDescriptions)}

CAMERA ANGLE (choose ONE):
${JSON.stringify(cameraAnglesWithDescriptions)}

CAMERA MOVEMENT (choose ONE):
${JSON.stringify(cameraMovementsWithDescriptions)}

COMPOSITION (specify all). Frame composition should anticipate the transition style.
${JSON.stringify(getModelCompatibleSchema(Composition))}
`;

export const buildCinematographerNarrative = (
  scene: SceneWithAssets,
  framePosition?: "start" | "end"
) => {
  const shotMap: Record<string, string> = {
    "ECU": "Extreme Close-Up",
    "CU": "Close-Up",
    "MCU": "Medium Close-Up",
    "MS": "Medium Shot",
    "MW": "Medium Wide Shot",
    "WS": "Wide Shot",
    "VW": "Very Wide Establishing Shot"
  };

  const shotType = shotMap[scene.shotType || ""] || scene.shotType || "Cinematic shot";
  const movement = scene.cameraMovement ? `, with ${scene.cameraMovement.toLowerCase()} movement` : "";
  const angle = scene.cameraAngle ? ` from a ${scene.cameraAngle.toLowerCase()} angle` : "";

  let narrative = `A ${shotType.toLowerCase()} captured${angle}${movement}.`;

  if (scene.composition) {
    narrative += ` ${JSON.stringify(scene.composition).replace(/[\n\r]+/g, ", ")}.`;
  }

  if (framePosition) {
    narrative += framePosition === "start"
      ? " This frame captures the beginning of the scene."
      : " This frame captures the end of the scene.";
  }

  return narrative;
};
