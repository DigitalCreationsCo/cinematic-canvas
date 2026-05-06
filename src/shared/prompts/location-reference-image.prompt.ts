import { Location } from "../types/workflow.types.js";
import { composeGenerationRules } from "./prompt.utils.js";
import { buildLocationFullSpec } from "./location-spec.prompt.js";

export const buildLocationImagePrompt = (location: Location, generationRules?: string[]): string => {
    return [
        buildLocationFullSpec(location),
        `Wide establishing shot, eye-level with a slight wide-angle lens. Deep depth of field with clearly defined foreground, midground, and background layers to convey the full scale and depth of the space.`,
        composeGenerationRules(generationRules)
    ].join("\n");
};
