import {
    Scene,
    SceneEntity,
    InsertScene
} from "../types/index.js";
import { z } from "zod";



export function mapDbSceneToDomain(entity: Scene): Scene {
    const parsed = JSON.parse(JSON.stringify(entity));
    const scene = Scene.parse(parsed);
    return scene;
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