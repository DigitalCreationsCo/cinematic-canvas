/**
 * @fileoverview Character Reference Image Prompt Generator
 * 
 * Generates prompts for creating photorealistic character reference images that serve
 * as continuity anchors across all scenes in a cinematic production.
 * 
 * @module shared/prompts/character-reference-image-prompt
 * 
 * @description
 * This module wraps the Costume & Makeup department prompt with generation rules
 * to produce complete prompts for character image generation. The generated images:
 * - Serve as CONTINUITY REFERENCES for consistent character appearance
 * - Specify exact hair, clothing, accessories, and distinctive features
 * - Include safety constraints (no celebrity likeness, no minors)
 * 
 * @usage
 * Used by: src/shared/agents/continuity-manager.ts
 * 
 * @see role-costume-makeup.ts - The underlying department prompt builder
 */

import { Character } from "../types/index.js";
import { composeGenerationRules } from "./prompt-composer.js";
import { buildCostumeAndMakeupPrompt } from "./role-costume-makeup.js";

export const buildCharacterImagePrompt = (character: Character, generationRules?: string[]): string => {
    return buildCostumeAndMakeupPrompt(character) + composeGenerationRules(generationRules);
};
