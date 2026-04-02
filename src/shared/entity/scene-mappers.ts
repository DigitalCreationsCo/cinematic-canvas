import {
    Scene,
    InsertScene,
    SceneQueryResult,
    AssetRegistry,
    SceneWithAssets,
    SceneAttributes,
    SceneBase
} from "../types/index.js";
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