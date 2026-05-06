import { Scene, SceneBase } from "../types/workflow.types.js";
import { InsertScene, SceneQueryResult } from "../types/schema.types.js";
import { AssetRegistry } from "../types/assets.types.js";
import { SceneWithAssets } from "../types/workflow.types.js";
import { SceneAttributes } from "../types/scene.types.js";
import { z } from "zod";
import { hydrateEntity } from "../utils/entity.utils.js";

/**
 * Transforms query result into domain Scene model
 */
export function mapSceneWithAssetsToDomainScene(result: SceneQueryResult & { assets: AssetRegistry; }): SceneWithAssets {
    const parsed = JSON.parse(JSON.stringify(result));
    return SceneWithAssets.parse({
        ...parsed,
        characterIds: result.characters.map(c => c.id),
    });
}

export function mapDomainSceneToInsertScene(toInsertSceneData: z.input<typeof InsertScene>): z.infer<typeof InsertScene> {
    const insertScene = InsertScene.parse(toInsertSceneData);
    return insertScene;
}

export function mapSceneWithAssetsToSceneAttributes(scene: SceneWithAssets): SceneAttributes {
    return SceneAttributes.parse(hydrateEntity(scene, scene.assets));
}

export function mapSceneWithAssetsToSceneBase(scene: SceneBase): SceneBase {
    return SceneBase.parse(scene);
}

/**
 * Type guard to check if scene has character relationships
 */
export function hasCharacterRelationships(
    scene: Partial<Scene>
): scene is Scene & { characterIds: string[]; } {
    return Array.isArray(scene.characterIds) && scene.characterIds.length > 0;
}