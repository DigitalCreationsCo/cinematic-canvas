import { PropWithAssets } from "../types/workflow.types.js";
import { composeGenerationRules } from "./prompt.utils.js";
import { getAllBestAssets } from "../utils/assets.utils.js";

export const buildPropImagePrompt = (prop: PropWithAssets, generationRules?: string[]): string => {
  const assets = getAllBestAssets(prop.assets);
  const description = assets["description"]?.data || "";

  return [
    // 1. CORE IDENTITY
    `A ${prop.type || "prop"} called "${prop.name}".`,
    description ? description : "",

    // 2. SPECIFICATION
    `The prop is of type: ${prop.type || "unknown"}.`,

    // 3. VISUAL GUIDELINES
    `Isolated product shot on a plain light gray background. Sharp focus, even lighting from the front with minimal shadows.`,
    `High resolution, photorealistic, detailed texture. Entire prop visible, centered in frame. No text or labels in the image.`,

    // 4. GENERATION RULES
    composeGenerationRules(generationRules),
  ]
    .filter(Boolean)
    .join("\n");
};
