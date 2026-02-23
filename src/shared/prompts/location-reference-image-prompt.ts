/**
 * @fileoverview Location Reference Image Prompt Generator
 * 
 * Generates prompts for creating photorealistic location reference images that
 * serve as continuity anchors across all scenes at that location.
 * 
 * @module shared/prompts/location-reference-image-prompt
 * 
 * @description
 * This module wraps the Production Designer department prompt with generation
 * rules to produce complete prompts for location image generation. The generated
 * images serve as CONTINUITY REFERENCES ensuring:
 * - Architectural features remain consistent
 * - Natural elements stay in same positions
 * - Color palette matches across scenes
 * - Lighting quality is consistent
 * 
 * @usage
 * Used by: src/shared/agents/continuity-manager.ts
 * 
 * @see role-set-designer.ts - The underlying department prompt builder
 */

import { Location } from "../types/index.js";
import { composeGenerationRules } from "./must-review/prompt-utils.js";
import { buildProductionDesignerPrompt } from "./role-set-designer.js";

/**
 * LOCATION IMAGE GENERATION - Using Role-Based Prompt (Production Designer)
 */

export const buildLocationImagePrompt = (location: Location, generationRules?: string[]): string => {
    // Use the new role-based Production Designer prompt
    return buildProductionDesignerPrompt(location) + composeGenerationRules(generationRules);
};
