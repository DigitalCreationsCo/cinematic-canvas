import { CharacterAttributes } from "../types/character.types.js";
import { CharacterWithAssets } from "../types/workflow.types.js";
import { composeGenerationRules } from "./prompt.utils.js";
import { buildCharacterFullSpec } from "./character-spec.prompt.js";
import { buildSafetyGuidelinesPrompt } from "./safety-guidelines.prompt.js";

export const buildCharacterImagePrompt = (character: CharacterWithAssets | CharacterAttributes, generationRules?: string[]): string => {
    return [
        buildCharacterFullSpec(character),
        `High quality, production-ready portrait. Head to toe visible, standing in a neutral pose facing the camera. The background is a plain light gray radial gradient with no distractions. Lighting is soft and even from the front with minimal shadows. The entire figure should be sharp and in focus, shot at a straight - on eye - level angle with no dramatic perspective. Expression is neutral but engaged, eyes open, natural resting face. No text in the image.`,
        `${buildSafetyGuidelinesPrompt()} Do not depict any celebrity or real person.Describe only as a person with generic physical attributes.If the specified age is under 18, render as a young adult aged 18 - 20.`,
        composeGenerationRules(generationRules),
    ].join("\n");
};
