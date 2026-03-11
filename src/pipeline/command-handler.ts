import { db } from "../shared/db/index.js";
import { assetEntries } from "../shared/db/schema.js";
import {
  PipelineCommand,
  RegenerateSceneCommand,
  RegenerateFrameCommand,
  PipelineEvent
} from "../shared/types/pipeline.types.js";
import { eq, and } from "drizzle-orm";
import { JobControlPlane } from "../shared/services/job-control-plane.js";
import { createHash } from 'crypto';
import type { AssetKey } from '../shared/types/assets.types.js';

export const PipelineCommandHandler = {

  /**
   * REGENERATE_SCENE: Triggers video generation for a specific scene.
   */
  async handleRegenerateScene(cmd: RegenerateSceneCommand, jobControlPlane: JobControlPlane) {
    const { projectId } = cmd;
    const { sceneId, promptModification } = cmd.payload;

    return await jobControlPlane.createJob({
      projectId,
      type: "GENERATE_SCENE_VIDEO",
      assetKey: "scene_video",
      uniqueKey: jobControlPlane.uniqueKey(projectId, `scene_video-${sceneId}-${Date.now()}`),
      payload: {
        sceneId,
        overridePrompt: promptModification,
      }
    });
  },

  /**
   * GENERATE_SCENE_FRAMES: Triggers frame generation (start/end) for scenes.
   */
  async handleGenerateSceneFrames(cmd: RegenerateFrameCommand, jobControlPlane: JobControlPlane) {
    const { projectId, payload } = cmd;

    const sortedIds = payload.sceneIds ? [ ...payload.sceneIds ].sort() : [];
    const promptMods = payload.promptModifications ? payload.promptModifications.sort().join('|') : '';

    const sceneIdsHash = createHash('md5')
      .update(JSON.stringify({
        ids: sortedIds,
        prompts: promptMods
      }))
      .digest('hex').substring(0, 8);

    return await jobControlPlane.createJob({
      type: "GENERATE_SCENE_FRAMES",
      assetKey: "scene_start_frame",
      projectId: projectId,
      payload,
      uniqueKey: jobControlPlane.uniqueKey(projectId, `scene_frames-${sceneIdsHash}-${Date.now()}`),
      attempts: {
        maxRetries: 3
      }
    });
  },

  /**
   * UPDATE ENTITY ASSET — promotes or rejects a specific asset version.
   *
   * Updates the `best` pointer on the corresponding `asset_entries` row.
   * Entity type is used to build the correct WHERE clause (FK column selection).
   *
   * @param entityType  Determines which FK column to match in asset_entries
   * @param entityId    The ID of the entity (scene/character/location/project)
   * @param assetKey    Which asset slot to update
   * @param version     Version number to promote; null = reject (sets best to 0)
   * @param projectId   For validation
   */
  async handleUpdateEntityAsset(params: {
    entityId:   string;
    entityType: 'scene' | 'character' | 'location' | 'project';
    assetKey:   AssetKey;
    version:    number | null;
    projectId:  string;
  }): Promise<void> {
    const { entityId, entityType, assetKey, version } = params;

    // Build the WHERE clause targeting the correct FK column
    const entityFilter = (() => {
      switch (entityType) {
        case 'scene':     return eq(assetEntries.sceneId,     entityId);
        case 'character': return eq(assetEntries.characterId, entityId);
        case 'location':  return eq(assetEntries.locationId,  entityId);
        case 'project':
          // Project assets have all three FK columns as NULL
          return and(
            eq(assetEntries.projectId, entityId),
            // sceneId/characterId/locationId are null — handled by unique index
          );
        default:
          throw new Error(`Unknown entityType: ${entityType}`);
      }
    })();

    const newBest = version === null ? 0 : version;

    await db
      .update(assetEntries)
      .set({ best: newBest, updatedAt: new Date() })
      .where(
        and(
          entityFilter,
          eq(assetEntries.assetKey, assetKey)
        )
      );
  },
};
