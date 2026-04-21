import { db } from "../shared/db/index.js";
import { assetEntries } from "../shared/db/schema.js";
import {
  PipelineCommand,
  GenerateSceneVideoCommand,
  GenerateSceneFramesCommand,
  PipelineEvent,
  GenerateCharactersCommand,
  GenerateCharacterImagesCommand,
  GenerateLocationsCommand,
  GenerateLocationImagesCommand,
  GenerateCompositeCommand,
  CreateSceneWithEntitiesCommand,
} from "../shared/types/pipeline.types.js";
import { eq, and } from "drizzle-orm";
import { JobControlPlane } from "../shared/services/job-control-plane.js";
import { createHash } from 'crypto';
import type { AssetKey } from '../shared/types/assets.types.js';

export const PipelineCommandHandler = {

  /**
   * GENERATE_COMPOSITES: Creates a GENERATE_COMPOSITE worker job.
   *
   * Forwards the full command payload verbatim — the worker's
   * processGenerateCompositeJob function consumes it directly.
   */
  async handleGenerateCompositeImage(cmd: GenerateCompositeCommand, jobControlPlane: JobControlPlane) {
    const { projectId, payload } = cmd;

    // Stable unique key: imageId is already a unique identifier for this
    // composite request; append timestamp to allow re-runs on the same imageId.
    const uniqueKey = jobControlPlane.uniqueKey(
      projectId,
      `composite-${payload.imageId}-${Date.now()}`
    );

    return await jobControlPlane.createJob({
      type: "GENERATE_COMPOSITE",
      assetKey: "image_file",
      projectId,
      teamId: cmd.teamId,
      userId: cmd.userId,
      worldId: cmd.worldId,
      payload: {
        // Include projectId inside payload so processGenerateCompositeJob has
        // full context without needing to reach outside the job object.
        ...payload,
        projectId,
      },
      uniqueKey,
      attempts: {
        maxRetries: 2,
      },
    });
  },

  /**
   * GENERATE_CHARACTERS: Creates a GENERATE_CHARACTER_IMAGES worker job.
   *
   * Extracts characterIds from the command payload array so the worker can
   * filter project.characters to only the requested subset.  If the worker
   * receives an empty characterIds array it falls back to all project
   * characters (handled in worker-service.ts).
   */
  async handleGenerateCharacters(cmd: GenerateCharactersCommand, jobControlPlane: JobControlPlane) {
    const { projectId, payload } = cmd;

    const characterIds = payload.map((p) => p.id);

    const idsHash = createHash('md5')
      .update(JSON.stringify([...characterIds].sort()))
      .digest('hex')
      .substring(0, 8);

    return await jobControlPlane.createJob({
      type: "GENERATE_CHARACTERS",
      assetKey: "character_image",
      projectId,
      teamId: cmd.teamId,
      userId: cmd.userId,
      worldId: cmd.worldId,
      payload,
      uniqueKey: jobControlPlane.uniqueKey(
        projectId,
        `generate-characters-${idsHash}-${Date.now()}`
      ),
      attempts: {
        maxRetries: 3,
      },
    });
  },

  /**
   * GENERATE_CHARACTERS_IMAGES: Creates a GENERATE_CHARACTER_IMAGES worker job.
   *
   * Extracts characterIds from the command payload array so the worker can
   * filter project.characters to only the requested subset.  If the worker
   * receives an empty characterIds array it falls back to all project
   * characters (handled in worker-service.ts).
   */
  async handleGenerateCharacterImages(cmd: GenerateCharacterImagesCommand, jobControlPlane: JobControlPlane) {
    const { projectId, payload } = cmd;

    const characterIds = payload.map((p) => p.characterId);

    const idsHash = createHash('md5')
      .update(JSON.stringify([...characterIds].sort()))
      .digest('hex')
      .substring(0, 8);

    return await jobControlPlane.createJob({
      type: "GENERATE_CHARACTER_IMAGES",
      assetKey: "character_image",
      projectId,
      teamId: cmd.teamId,
      userId: cmd.userId,
      worldId: cmd.worldId,
      payload: { characterIds },
      uniqueKey: jobControlPlane.uniqueKey(
        projectId,
        `character-assets-${idsHash}-${Date.now()}`
      ),
      attempts: {
        maxRetries: 3,
      },
    });
  },

  /**
   * GENERATE_LOCATIONS: Creates a GENERATE_LOCATIONS worker job.
   *
   * Mirrors handleGenerateCharacterImages — extracts locationIds from the
   * command payload array so the worker can filter to only requested locations.
   */
  async handleGenerateLocations(cmd: GenerateLocationsCommand, jobControlPlane: JobControlPlane) {
    const { projectId, payload } = cmd;

    const locationIds = payload.map((p) => p.id);

    const idsHash = createHash('md5')
      .update(JSON.stringify([...locationIds].sort()))
      .digest('hex')
      .substring(0, 8);

    return await jobControlPlane.createJob({
      type: "GENERATE_LOCATIONS",
      assetKey: "location_image",
      projectId,
      teamId: cmd.teamId,
      userId: cmd.userId,
      worldId: cmd.worldId,
      payload: { locationIds },
      uniqueKey: jobControlPlane.uniqueKey(
        projectId,
        `generate-locations-${idsHash}-${Date.now()}`
      ),
      attempts: {
        maxRetries: 3,
      },
    });
  },

  /**
   * GENERATE_LOCATIONS_IMAGES: Creates a GENERATE_LOCATIONS_IMAGES worker job.
   *
   * Mirrors handleGenerateCharacterImages — extracts locationIds from the
   * command payload array so the worker can filter to only requested locations.
   */
  async handleGenerateLocationImages(cmd: GenerateLocationImagesCommand, jobControlPlane: JobControlPlane) {
    const { projectId, payload } = cmd;

    const locationIds = payload.map((p) => p.locationId);

    const idsHash = createHash('md5')
      .update(JSON.stringify([...locationIds].sort()))
      .digest('hex')
      .substring(0, 8);

    return await jobControlPlane.createJob({
      type: "GENERATE_LOCATION_IMAGES",
      assetKey: "location_image",
      projectId,
      teamId: cmd.teamId,
      userId: cmd.userId,
      worldId: cmd.worldId,
      payload: { locationIds },
      uniqueKey: jobControlPlane.uniqueKey(
        projectId,
        `location-assets-${idsHash}-${Date.now()}`
      ),
      attempts: {
        maxRetries: 3,
      },
    });
  },

  /**
   * CREATE_SCENE_WITH_ENTITIES: Creates a CREATE_SCENE_WITH_ENTITIES worker job.
   */
  async handleCreateSceneWithEntities(cmd: CreateSceneWithEntitiesCommand, jobControlPlane: JobControlPlane) {

    const sortedPayload = Object.fromEntries(
      Object.entries(cmd.payload.sceneFields).sort(([keyA], [keyB]) =>
        keyA.localeCompare(keyB)
      )
    );

    const uniqueHash = createHash('md5')
      .update(JSON.stringify(sortedPayload))
      .digest('hex')
      .substring(0, 8);

    return await jobControlPlane.createJob({
      type: "CREATE_SCENE_WITH_ENTITIES",
      assetKey: "entity",
      projectId: cmd.projectId,
      teamId: cmd.teamId,
      userId: cmd.userId,
      worldId: cmd.worldId,
      payload: cmd.payload,
      uniqueKey: jobControlPlane.uniqueKey(
        cmd.projectId,
        `create-scene-with-entities-${uniqueHash}-${Date.now()}`
      ),
      attempts: {
        maxRetries: 3,
      },
    });
  },

  /**
   * GENERATE_SCENE_FRAMES: Triggers frame generation (start/end) for scenes.
   */
  async handleGenerateSceneFrames(cmd: GenerateSceneFramesCommand, jobControlPlane: JobControlPlane) {
    const { projectId, payload } = cmd;

    const sortedIds = payload.sceneIds ? [...payload.sceneIds].sort() : [];
    const promptMods = payload.promptModifications
      ? payload.promptModifications.sort().join('|')
      : '';

    const sceneIdsHash = createHash('md5')
      .update(JSON.stringify({ ids: sortedIds, prompts: promptMods }))
      .digest('hex')
      .substring(0, 8);

    return await jobControlPlane.createJob({
      type: "GENERATE_SCENE_FRAMES",
      assetKey: "scene_start_frame",
      projectId,
      teamId: cmd.teamId,
      userId: cmd.userId,
      worldId: cmd.worldId,
      payload,
      uniqueKey: jobControlPlane.uniqueKey(
        projectId,
        `scene_frames-${sceneIdsHash}-${Date.now()}`
      ),
      attempts: {
        maxRetries: 3,
      },
    });
  },

  /**
   * GENERATE_SCENE_VIDEO: Triggers video generation for a specific scene.
   */
  async handleRegenerateScene(cmd: GenerateSceneVideoCommand, jobControlPlane: JobControlPlane) {
    const { projectId } = cmd;
    const { sceneId, promptModification } = cmd.payload;

    return await jobControlPlane.createJob({
      type: "GENERATE_SCENE_VIDEO",
      assetKey: "scene_video",
      projectId,
      teamId: cmd.teamId,
      userId: cmd.userId,
      worldId: cmd.worldId,
      uniqueKey: jobControlPlane.uniqueKey(
        projectId,
        `scene_video-${sceneId}-${Date.now()}`
      ),
      payload: {
        sceneId,
        overridePrompt: promptModification,
      },
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
    entityId: string;
    entityType: 'scene' | 'character' | 'location' | 'project';
    assetKey: AssetKey;
    version: number | null;
    projectId: string;
  }): Promise<void> {
    const { entityId, entityType, assetKey, version } = params;

    // Build the WHERE clause targeting the correct FK column
    const entityFilter = (() => {
      switch (entityType) {
        case 'scene': return eq(assetEntries.sceneId, entityId);
        case 'character': return eq(assetEntries.characterId, entityId);
        case 'location': return eq(assetEntries.locationId, entityId);
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