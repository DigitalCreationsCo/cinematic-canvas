import { Scene, SceneBase } from "#shared/types/workflow.types.js";
import { InsertScene, SceneQueryResult } from "#shared/types/schema.types.js";
import { AssetRegistry } from "#shared/types/assets.types.js";
import { SceneWithAssets } from "#shared/types/workflow.types.js";
import { SceneAttributes } from "#shared/types/scene.types.js";
import { hydrateEntity } from "#shared/utils/entity.utils.js";
import { SceneCondensed } from "#shared/types/storyboard.types.js";
import { z } from "zod";
import { getAllBestAssets } from "#shared/utils/assets.utils.js";

/**
 * Transforms query result into domain Scene model
 */
export function mapSceneWithAssetsToDomainScene(result: SceneQueryResult & { assets: AssetRegistry }): SceneWithAssets {
  const parsed = JSON.parse(JSON.stringify(result));
  return SceneWithAssets.parse({
    ...parsed,
    characterIds: result.characters.map((c) => c.id),
  });
}

export function mapDomainSceneToInsertScene(
  toInsertSceneData: z.input<typeof InsertScene>,
): z.infer<typeof InsertScene> {
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
 * Transforms a scene into a condensed scene, used for the storyboard view.
 * Description is intentionally sourced from the best versioned asset rather
 * than a column value, because descriptions for all entity types are stored as
 * versioned assets (see schema). CharacterWithAssets / LocationWithAssets /
 * SceneWithAssets omit the description column for exactly this reason.
 */
export function condenseScene(scene: SceneWithAssets): SceneCondensed {
  const description = getAllBestAssets(scene.assets)["description"]?.data ?? "";
  return SceneCondensed.parse({ ...scene, description });
}

/**
 * Type guard to check if scene has character relationships
 */
export function hasCharacterRelationships(scene: Partial<Scene>): scene is Scene & { characterIds: string[] } {
  return Array.isArray(scene.characterIds) && scene.characterIds.length > 0;
}
