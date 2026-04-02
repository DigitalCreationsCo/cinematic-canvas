import { Scene, Character, Location } from "../types/index.js";
import { buildScriptSupervisorContinuityChecklist } from "./role-script-supervisor.prompt.js";
import { buildVisualDirectorSpec, composeGenerationRules } from "./prompt-utils.js";

/**
 * Compose scene prompt for video generation
 */
export const composeEnhancedSceneGenerationPromptMeta = (
    scene: Scene,
    characters: Character[],
    locations: Location[],
    previousScene?: Scene,
    generationRules?: string[],
): string => {

    const location = locations.find((l) => l.id === scene.locationId)!;
    return [
        buildVisualDirectorSpec(scene, location),
        buildScriptSupervisorContinuityChecklist(scene, previousScene, characters, locations),
        composeGenerationRules(generationRules)
    ].join("\n");
};