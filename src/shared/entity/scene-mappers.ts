import {
    Scene,
    InsertScene,
    SceneQueryResult,
    AssetRegistry,
    SceneWithAssets,
} from "../types/index.js";
import { z } from "zod";

/**
 * Transforms query result into domain Scene model
 */
export function mapDbSceneToDomain(result: SceneQueryResult & { assets: AssetRegistry; }): SceneWithAssets {
    const parsed = JSON.parse(JSON.stringify(result));
    return SceneWithAssets.parse({
        ...parsed,
        characterIds: result.characters.map(c => c.id),
    });
}

export function mapDomainSceneToInsertSceneDb(sceneAttributes: z.input<typeof InsertScene>): z.infer<typeof InsertScene> {
    const insertScene = InsertScene.parse(sceneAttributes);
    return insertScene;
}

/**
 * Type guard to check if scene has character relationships
 */
export function hasCharacterRelationships(
    scene: Partial<Scene>
): scene is Scene & { characterIds: string[]; } {
    return Array.isArray(scene.characterIds) && scene.characterIds.length > 0;
}