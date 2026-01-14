import { Character } from "../../shared/types/workflow.types";
import { composeGenerationRules } from "./prompt-composer";
import { buildCostumeAndMakeupPrompt } from "./role-costume-makeup";

export const buildCharacterImagePrompt = (character: Character, generationRules?: string[]): string => {
    return buildCostumeAndMakeupPrompt(character) + composeGenerationRules(generationRules);
};
