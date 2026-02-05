import { db } from "../shared/db/index.js";
import { projects, scenes, jobs } from "../shared/db/schema.js";
import {
  RegenerateSceneCommand,
  UpdateSceneAssetCommand
} from "../shared/types/pipeline.types.js";
import { eq, sql } from "drizzle-orm";



export const PipelineCommandHandler = {
  /**
   * UPDATE_SCENE_ASSET: Manually promotes a specific version 
   * or rejects a generation.
   */
  async handleUpdateAsset(cmd: UpdateSceneAssetCommand) {
    const { scene, assetKey, version } = cmd.payload;

    return await db.transaction(async (tx) => {
      // 1. Fetch current assets
      const existing = await tx.query.scenes.findFirst({
        where: { id: scene.id },
        columns: { assets: true }
      });

      if (!existing) throw new Error("Scene not found");

      const currentAssets = existing.assets || {};
      const history = currentAssets[ assetKey ];

      if (history) {
        // 2. Update the 'best' pointer or remove if version is null
        if (version === null) {
          // Logic for rejection/deletion
          history.best = 0;
        } else {
          // Logic for promotion
          const exists = history.versions.some(v => v.version === version);
          if (exists) history.best = version;
        }
      }

      // 3. Persist back to DB
      await tx.update(scenes)
        .set({
          assets: currentAssets,
          updatedAt: new Date()
        })
        .where(eq(scenes.id, scene.id));

      return { success: true, updatedAssets: currentAssets };
    });
  },
};
