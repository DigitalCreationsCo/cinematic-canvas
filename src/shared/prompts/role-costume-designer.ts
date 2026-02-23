/**
 * @fileoverview Costume & Makeup Role - Character Appearance Specification
 * 
 * Defines the Costume & Makeup department head persona for specifying exact
 * character appearance details and generating reference images for continuity.
 * 
 * @module shared/prompts/role-costume-makeup
 * 
 * @description
 * The Costume & Makeup role is responsible for:
 * - Character physical description (age, build, ethnicity, features)
 * - Hair specifications (style, color, length, texture)
 * - Clothing details (specific garments, colors, condition)
 * - Accessories tracking (jewelry, bags, props)
 * - Distinctive features (scars, tattoos, marks)
 * 
 * Exports:
 * - buildCharacterFullSpec: Full prompt for character reference image generation
 * - buildCostumeSpec: Concise appearance spec for scene prompts
 * - buildCostumeNarrativeInstructions: Natural language appearance description
 * 
 * @usage
 * Used by: character-reference-image-prompt.ts, prompt-composer.ts
 */

export const promptVersion = "3.0.1";

import { Character } from "../types/index.js";
import { getAllBestAssets } from "../utils/assets-utils.js";
import { buildSafetyGuidelinesPrompt } from "./safety-guidelines-instructions.js";

/**
 * COSTUME & MAKEUP DEPT - Character Appearance Specification
 * Generates reference images and specifies exact character appearance for continuity
 */

export const buildCharacterFullSpec = (character: Character): string => {
  const aliases =
    character.aliases && character.aliases.length > 0
      ? ` (also known as: ${character.aliases.join(", ")})`
      : "";

  const characterDescription =
    getAllBestAssets(character.assets)[ "character_description" ]?.data ||
    "";

  return `COSTUME & MAKEUP SPECIFICATION: ${character.name}${aliases}

${characterDescription}

Age: ${character.age || "Adult 20-30"}
Build: ${character.physicalTraits?.build || "Average build"}
Ethnicity: ${character.physicalTraits?.ethnicity || "Generic, non-specific (avoid celebrity likeness)"}
Hair:
- Style: ${character.physicalTraits.hair}
- Color: [Specific shade required]
- Length: [Specific length required]
- Texture: [Straight/wavy/curly/coily]
Clothing:
${typeof character.physicalTraits.clothing === "string"
      ? `- ${character.physicalTraits.clothing}`
      : Array.isArray(character.physicalTraits.clothing)
        ? character.physicalTraits.clothing.map((item) => `- ${item}`).join("\n")
        : "- Clothing description required"
    }
Accessories:
${character.physicalTraits.accessories && character.physicalTraits.accessories.length > 0
      ? character.physicalTraits.accessories.map((item) => `- ${item}`).join("\n")
      : "- None"
    }
Distinctive features:
${character.physicalTraits.distinctiveFeatures &&
      character.physicalTraits.distinctiveFeatures.length > 0
      ? character.physicalTraits.distinctiveFeatures.map((feature) => `- ${feature}`).join("\n")
      : "- None specified"
    }
${character.appearanceNotes && character.appearanceNotes.length > 0
      ? `
Additional Notes:
${character.appearanceNotes.map((note) => `- ${note}`).join("\n")}
` : ""}

IMAGE FORMAT:
Full-body portrait, head to toe visible
Background: Light gray radial gradient, no distractions
Lighting: Soft, even illumination from front, minimal shadows
Pose: Standing neutral, facing camera directly, arms at sides naturally
Expression: Neutral but engaged (eyes open, natural resting face)
Focus: Entire figure sharp and clear
Camera: Straight-on eye-level angle, no dramatic angles
No text in the output image.

SAFETY CONSTRAINTS:
${buildSafetyGuidelinesPrompt()}
- NO celebrity names or likeness
- NO specific real people
- Describe as "a person with [generic attributes]"
- If age < 18 provided, output as "young adult, 18-20 years old"
`;
};

export const buildCostumeSpec = (character: Character): string => {
  return `${character.name}

Hair: ${character.physicalTraits.hair}
Clothing: ${typeof character.physicalTraits.clothing === "string"
      ? character.physicalTraits.clothing
      : character.physicalTraits.clothing?.join(", ")
    }
Accessories: ${character.physicalTraits.accessories?.join(", ") || "None"}
Distinctive Features: ${character.physicalTraits.distinctiveFeatures?.join(", ") || "None"}

${getAllBestAssets(character.assets)[ "character_image" ]?.data ? "REFERENCE IMAGE: " + getAllBestAssets(character.assets)[ "character_image" ]?.data : ""}

CONSTRAINT: Appearance MUST match reference image EXACTLY in all scenes.
`;
};

export const buildCostumeNarrativeInstructions = (character: Character): string => {
  const clothing = typeof character.physicalTraits.clothing === "string"
    ? character.physicalTraits.clothing
    : character.physicalTraits.clothing?.join(", ");

  const accessories = character.physicalTraits.accessories && character.physicalTraits.accessories.length > 0
    ? ` They are accessorized with ${character.physicalTraits.accessories.join(", ")}.`
    : "";

  const features = character.physicalTraits.distinctiveFeatures && character.physicalTraits.distinctiveFeatures.length > 0
    ? ` Distinctive features include ${character.physicalTraits.distinctiveFeatures.join(", ")}.`
    : "";

  return `${character.name} is ${character.assets[ 'character_description' ]?.versions[ character.assets[ 'character_description' ]?.best ].data}. They have ${character.physicalTraits.hair} hair and are wearing ${clothing}.${accessories}${features}`;
};
