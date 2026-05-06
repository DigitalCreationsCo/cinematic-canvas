/**
 * @fileoverview Quality Control Supervisor Role - Evaluation & Feedback
 * 
 * Defines the Quality Control Supervisor department head persona for evaluating
 * generated assets (videos and keyframes) and providing department-specific feedback.
 * 
 * @module shared/prompts/role-quality-control
 * 
 * @description
 * The Quality Control Supervisor role is responsible for:
 * - Evaluating narrative fidelity (does action match description?)
 * - Assessing composition quality (shot type, angle, framing)
 * - Checking lighting quality (matches spec, conveys mood)
 * - Verifying continuity accuracy (character, location, props)
 * - Validating character appearance (hair, clothing, accessories)
 * - Suggesting prompt corrections and generation rules
 * 
 * Exports:
 * - buildQualityControlPrompt: Core evaluation prompt
 * - buildQualityControlVideoPrompt: Video-specific evaluation
 * - buildQualityControlFramePrompt: Keyframe-specific evaluation
 * 
 * @usage
 * Used by: quality-evaluation-instruction.ts
 * 
 * @see quality-evaluation-guidelines.ts - Evaluation rubrics and criteria
 */

export const promptVersion = "3.1.2";

import { Character, Location, Scene } from "../types/workflow.types.js";
import { ISSUE_CATEGORIZATION_GUIDE, EVALUATION_CALIBRATION_GUIDE } from "./must-review/quality-guidelines.prompt.js";
import { composeGenerationRules } from "./prompt.utils.js";
import { getAllBestAssets } from "../utils/assets.utils.js";
import { buildCharacterFullSpec } from "./character-spec.prompt.js";

/**
 * QUALITY CONTROL SUPERVISOR - Evaluation & Feedback
 * Evaluates generated assets and provides department-specific feedback
 */

export interface DepartmentSpecs {
  director: string;
  cinematographer: string;
  lighting: string;
  scriptSupervisor: string;
  costume: string;
  productionDesign: string;
}

export const buildQualityControlPrompt = (
  scene: Scene,
  generatedAsset: string,
  assetType: "video" | "frame",
  sceneSpecs: DepartmentSpecs,
  schema: object,
  generationRules: string[] = []
) => `As the production Quality Control Lead, evaluate the asset ${assetType} for Scene ${scene.sceneIndex}.
Asset: ${generatedAsset}

${composeGenerationRules(generationRules)}

Evaluation Rubrics:
Scene Specification:
${sceneSpecs.director}

NARRATIVE FIDELITY (Weight: 30%)
PASS: Action matches description, emotional beat clear
MINOR: Action present but lacks emotional authenticity
MAJOR: Action deviates significantly from description
FAIL: Wrong action entirely or incomprehensible
Rating: [PASS / MINOR_ISSUES / MAJOR_ISSUES / FAIL]
Details: [Specific observations]

Cinematographer Specification:
${sceneSpecs.cinematographer}

COMPOSITION QUALITY (Weight: 15%)
PASS: Shot type, angle, framing match cinematographer's specifications
MINOR: Composition close but slightly off
MAJOR: Wrong shot type or awkward framing
FAIL: Unusable composition or wrong angle entirely
Rating: [PASS / MINOR_ISSUES / MAJOR_ISSUES / FAIL]
Details: [Specific observations]

Lighting Specification:
${sceneSpecs.lighting}

LIGHTING QUALITY (Weight: 15%)
PASS: Lighting matches spec, mood conveyed effectively
MINOR: Lighting acceptable but doesn't match exactly
MAJOR: Wrong lighting quality, color temp, or direction
FAIL: Lighting destroys mood or makes scene unusable
Rating: [PASS / MINOR_ISSUES / MAJOR_ISSUES / FAIL]
Details: [Specific observations]

Script Supervisor Specification:
${sceneSpecs.scriptSupervisor}

CONTINUITY ACCURACY (Weight: 20%)
PASS: Character appearance, position, props all match
MINOR: Small continuity errors (accessory missing, etc.)
MAJOR: Character appearance changed significantly
FAIL: Completely different character/location/props
Rating: [PASS / MINOR_ISSUES / MAJOR_ISSUES / FAIL]
Details: [Specific observations]

Costume/Makeup Specification:
${sceneSpecs.costume}

CHARACTER APPEARANCE (Weight: 10%)
PASS: Hair, clothing, accessories match reference
MINOR: Minor deviations (hair slightly different shade)
MAJOR: Character looks significantly different
FAIL: Unrecognizable as the same character
Rating: [PASS / MINOR_ISSUES / MAJOR_ISSUES / FAIL]
Details: [Specific observations]

Production Design Specification:
${sceneSpecs.productionDesign}

ENVIRONMENTAL APPEARANCE (Weight: 10%)
PASS: Props, set dressing, environment match reference
MINOR: Minor deviations (props slightly different)
MAJOR: Environment looks significantly different
FAIL: Unrecognizable as the same environment
Rating: [PASS / MINOR_ISSUES / MAJOR_ISSUES / FAIL]
Details: [Specific observations]

For each issue, provide:
{
  "department": "${JSON.stringify(Object.keys(sceneSpecs))}",
  "category": "narrative|composition|lighting|continuity|appearance",
  "severity": "critical|major|minor",
  "description": "[Specific problem observed]",
  ${assetType === "video" ? '"videoTimestamp": "[e.g., 0:02-0:04]",' : '"locationInFrame": "[e.g., center foreground, upper right]",'}
  "suggestedFix": "[How the relevant department should revise their specs]"
}

Correction Examples(provide only if regeneration is needed, max 3):
1. Issue: [What went wrong]
   Department: [Which role needs to revise]
   Original Spec: "[Problematic section]"
   Corrected Spec: "[Improved version]"
   Reasoning: "[Why this fixes it]"

Generation Rule Suggestion (Optional):
If you identify a systemic issue likely to recur in future ${assetType}s (e.g., inconsistent art style, persistent character distortion, incorrect lighting motifs), suggest a new globally applicable "Generation Rule" to prevent it.
- DO suggest rules for systemic issues
- DO NOT suggest rules for scene-specific content

Example: "All ${assetType}s must maintain shallow depth of field (f/1.4-f/2.8) to isolate characters from background."
If no systemic issue found, omit the ruleSuggestion field.

Evaluation Guidelines:
${ISSUE_CATEGORIZATION_GUIDE}
${EVALUATION_CALIBRATION_GUIDE}

Output format:
Return JSON matching this exact structure: ${JSON.stringify(schema)}

Overall Score: [Weighted average, 0-1.0]
Decision: [ACCEPT / ACCEPT_WITH_NOTES / REGENERATE_MINOR / FAIL]
Departments to Revise: [List relevant departments if regeneration needed]

CONSTRAINT: Be objective and use the evaluation guidelines above. Minor imperfections are acceptable. Focus on issues that significantly impact viewer experience or break narrative continuity.
`;

export const buildQualityControlVideoPrompt = (
  scene: Scene,
  videoUrl: string,
  enhancedPrompt: string,
  sceneSpecs: DepartmentSpecs,
  schema: object,
  characters: Character[],
  previousScene?: Scene,
  generationRules: string[] = []
) => `
${buildQualityControlPrompt(scene, videoUrl, "video", sceneSpecs, schema, generationRules)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADDITIONAL CONTEXT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ENHANCED PROMPT USED:
${enhancedPrompt}

CHARACTERS IN SCENE:
${characters.map(buildCharacterFullSpec).join("\n")}

${previousScene
    ? `PREVIOUS SCENE CONTEXT:
Scene ${previousScene.id}:
- Description: ${previousScene.description}
- Lighting: ${JSON.stringify(previousScene.lighting)}
- Characters: ${previousScene.characterIds.join(", ")}
- End Frame: ${getAllBestAssets(previousScene?.assets)['scene_end_frame']?.data || "N/A"}`
    : "This is the first scene - no previous context."
  }

Evaluate the video at the provided URL against all department specifications.
`;

export const buildQualityControlFramePrompt = (
  scene: Scene,
  frameUrl: string,
  framePosition: "start" | "end",
  sceneSpecs: DepartmentSpecs,
  schema: object,
  characters: Character[],
  locations: Location[],
  previousFrameUrl?: any,
  generationRules: string[] = []
) => `
${buildQualityControlPrompt(scene, frameUrl, "frame", sceneSpecs, schema, generationRules)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEYFRAME CONTEXT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FRAME POSITION: ${framePosition.toUpperCase()} of Scene ${scene.id}

This ${framePosition} frame will be used as a keyframe anchor for video generation.
${framePosition === "start"
    ? "It must show a clear BEGINNING state for the action."
    : "It must show a clear ENDING state for the action."
  }

PREVIOUS FRAME REFERENCE:
${previousFrameUrl ? `- Reference frame: ${JSON.stringify(previousFrameUrl, null, 2)}` : "- No previous frame (first scene)"}

CHARACTERS IN SCENE:
${characters.map((c) => `- ${c.name}: Reference image ${getAllBestAssets(c.assets)['character_image']?.data || "N/A"}`).join("\n")}

LOCATIONS IN SCENE:
${locations.map((l) => `- ${l.name}: Reference image ${getAllBestAssets(l.assets)['location_image']?.data || "N/A"}`).join("\n")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEYFRAME ANCHOR QUALITY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Evaluate if this frame works effectively as a ${framePosition} keyframe:
- Composition stable and well-suited for intended camera movement?
- Character poses clear and actionable (good starting/ending states)?
- Spatial relationships well-defined for video interpolation?
- Frame captures appropriate moment (not awkward in-between state)?
- Elements provide clear motion paths for video generation?

Evaluate the frame at the provided URL.
`;
