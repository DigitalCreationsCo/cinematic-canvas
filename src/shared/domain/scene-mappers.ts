import {
    Scene,
} from "../types/workflow.types.js";
import {
    SceneEntity, InsertScene
} from "../db/zod-db.js";
import { z } from "zod";



export function mapDbSceneToDomain(entity: SceneEntity): Scene {
    return Scene.parse(entity);
}

export function mapDomainSceneToInsertSceneDb(sceneAttributes: z.input<typeof InsertScene>): z.infer<typeof InsertScene> {
    return InsertScene.parse(sceneAttributes);
}
