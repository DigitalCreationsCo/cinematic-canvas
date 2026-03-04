import { Scene, Character, Location } from "../types/index.js";
import { buildScriptSupervisorContinuityChecklist } from "./role-script-supervisor.js";
import { getAllBestAssets } from "../utils/assets-utils.js";
import { resolvePublicUrl } from "../utils/utils.js";
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

    const previousSceneAssets = getAllBestAssets(previousScene?.assets);
    const sceneAssets = getAllBestAssets(scene.assets);
    const startFrame = sceneAssets[ 'scene_start_frame' ]?.data;
    const endFrame = sceneAssets[ 'scene_end_frame' ]?.data;

    const location = locations.find((l) => l.id === scene.locationId)!;

    return [
        buildVisualDirectorSpec(scene, location),
        buildScriptSupervisorContinuityChecklist(scene, previousScene, characters, locations),
        composeGenerationRules(generationRules)
    ].join("\n");
};