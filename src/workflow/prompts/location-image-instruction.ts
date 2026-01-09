import { Location } from "../../shared/types/pipeline.types";
import { composeGenerationRules } from "./prompt-composer";
import { buildProductionDesignerPrompt } from "./role-production-designer";

/**
 * LOCATION IMAGE GENERATION - Using Role-Based Prompt (Production Designer)
 */

export const buildLocationImagePrompt = (location: Location, generationRules?: string[]): string => {
    // Use the new role-based Production Designer prompt
    return buildProductionDesignerPrompt(location) + composeGenerationRules(generationRules);
};
