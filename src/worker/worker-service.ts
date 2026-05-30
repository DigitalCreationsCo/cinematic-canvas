// src/worker/worker-service.ts
import { JobControlPlane } from "#shared/services/job-control-plane.js";
import {
  buildJobEventMetadata,
  GenerativeResultEnhanceStoryboard,
  GenerativeResultExpandCreativePrompt,
  JobEvent,
} from "#shared/types/job.types.js";
import { GCPStorageManager } from "#shared/services/storage-manager.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { VideoModelController } from "#shared/lm/video-model-controller.js";
import { MediaProcessingAgent } from "#shared/agents/media-processing-agent.js";
import { CompositionalAgent } from "#shared/agents/compositional-agent.js";
import { QualityCheckAgent } from "#shared/agents/quality-check-agent.js";
import { SemanticExpertAgent } from "#shared/agents/semantic-expert-agent.js";
import { SceneGeneratorAgent } from "#shared/agents/scene-generator.js";
import { ContinuityManagerAgent } from "#shared/agents/continuity-manager.js";
import { AssetVersion, AssetRegistry } from "#shared/types/assets.types.js";
import {
  Project,
  SceneEntity,
  UpdateScene,
  ProjectEntity,
  InsertLocation,
  InsertCharacter,
  InsertProp,
  InsertScene,
  Job,
} from "#shared/types/schema.types.js";
import {
  Character,
  CharacterBase,
  LocationBase,
  SceneBase,
  Location,
  Scene,
  Prop,
  CharacterWithAssets,
  LocationWithAssets,
  PropAttributes,
} from "#shared/types/workflow.types.js";
import { Storyboard, makeEmptyLiveStoryboard } from "#shared/types/storyboard.types.js";
import { ProjectMetadata } from "#shared/types/metadata.types.js";
import { SaveAssetsCallbackArgs } from "#shared/types/pipeline.types.js";
import { CharacterAttributes } from "#shared/types/character.types.js";
import { LocationAttributes } from "#shared/types/location.types.js";
import { EntityPrimitiveType } from "#shared/types/entity.types.js";
import {
  SaveAssetsCallback,
  PipelineEvent,
  UpdateEntitiesCallback,
  IncrementAttemptHook,
} from "#shared/types/pipeline.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { MediaController } from "#shared/services/media-controller.js";
import { AssetVersionManager } from "#shared/services/asset-version-manager.js";
import { logContextStore } from "#shared/logger/index.js";
import { DistributedLockManager } from "#shared/services/lock-manager.js";
import { generateId } from "#shared/utils/id.js";
import { extractGenerationRules } from "#shared/prompts/prompt.utils.js";
import { mapSceneWithAssetsToSceneBase, mapDomainSceneToInsertScene } from "#shared/entity/scene-mappers.js";
import {
  mapCharacterWithAssetsToCharacterBase,
  mapCharacterWithAssetsToCharacterAttributes,
  mapDomainCharacterToInsertCharacter,
} from "#shared/entity/character-mappers.js";
import {
  mapLocationWithAssetsToLocationBase,
  mapLocationWithAssetsToLocationAttributes,
  mapDomainLocationToInsertLocation,
  mapReferenceIdsToIds,
} from "#shared/entity/location-mappers.js";
import { mapDomainPropToInsertProp } from "#shared/entity/prop-mappers.js";
import { entityIdAt, getAllBestAssets } from "#shared/utils/assets.utils.js";
import {
  buildEntityCreatableAssetDescriptionArgs,
  buildEntityCreatableAssetImageArgs,
  groupEntitiesByEntityPrimitiveType,
  hydrateEntity,
  hydrateProject,
} from "#shared/utils/entity.utils.js";
import { RAIError } from "#shared/utils/errors.js";
import { RecoveryContext } from "#shared/types/job.constants.js";
import { processGenerateCompositeJob } from "./generateCompositeWorker.js";
import { KBHydrator } from "#shared/services/sac/KBHydrator.js";
import { needsEntityTextParsing, ToolContext } from "#shared/lm/tools/tools.utils.js";
import {
  createParseEntitiesTool,
  createGenerateSceneAttributesTool,
  createGenerateCharacterImagesTool,
  createGenerateLocationImagesTool,
  createGenerateCharacterAttributesTool,
  createGenerateLocationAttributesTool,
  createGeneratePropImagesTool,
  createGeneratePropAttributesTool,
  createInsertCharactersTool,
  createInsertLocationsTool,
  createInsertPropsTool,
  createGenerateCharactersPipelineTool,
  createGenerateLocationsPipelineTool,
  createGeneratePropsPipelineTool,
} from "#shared/lm/tools/index.js";
import { TagRegistryService, tagRegistryService } from "#shared/services/tag-registry.js";
import { storyboardManager } from "#shared/services/storyboard-manager.js";
import {
  GenerateCharacterEntity,
  GenerateLocationEntity,
  GeneratePropEntity,
  InsertEntitiesInput,
} from "#shared/types/editable.types.js";
import { normalizeGenerateEntitiesPayload } from "./utils/generate-entities-payload.js";
import { GenerateCharacterImagesResultSuccess } from "#shared/lm/tools/characters/generate-characters-images.tool.js";
import { GenerateLocationImagesResultSuccess } from "#shared/lm/tools/locations/generate-locations-images.tool.js";

/**
 * Orchestrates job execution for AI agents.
 * Ensures execution happens within a safe asynchronous context.
 */
export class WorkerService {
  private textModel = new TextModelController({ provider: "google" });
  private videoModel = new VideoModelController("google");
  private projectRepository = new ProjectRepository();
  private kbService = new KBHydrator();

  constructor(
    private gcpProjectId: string,
    private workerId: string,
    private bucketName: string,
    private jobControlPlane: JobControlPlane,
    private lockManager: DistributedLockManager,
    private publishJobEvent: (event: JobEvent) => Promise<string>,
    private publishPipelineEvent: (event: PipelineEvent) => Promise<string>,
  ) { }

  private async publishStateUpdate({ project, userId }: { project: Project; userId: string }) {
    this.publishPipelineEvent({
      type: "FULL_STATE",
      projectId: project.id,
      worldId: project.worldId ?? undefined,
      teamId: project.teamId,
      userId: userId,
      payload: { project },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Retrieve agents with tenant-hydrated functionality
   * @param projectId
   * @param signal
   * @returns
   */
  private getAgents(projectId: string, signal?: AbortSignal) {
    const assetManager = new AssetVersionManager(this.projectRepository);
    const storageManager = new GCPStorageManager(this.gcpProjectId, this.bucketName);
    const mediaController = new MediaController(storageManager);
    const agentOptions = { signal };

    const qualityAgent = new QualityCheckAgent(this.textModel, storageManager, agentOptions);

    console.debug(
      {
        projectId,
        workerId: this.workerId,
        textModel: this.textModel.textModel,
        imageModel: this.textModel.imageModel,
        videoModel: this.videoModel.model,
        qualityCheckModel: this.textModel.qualityCheckModel,
      },
      `Initializing agents`,
    );

    return {
      assetManager,
      storageManager,
      qualityAgent,
      mediaProcessingAgent: new MediaProcessingAgent(this.textModel, storageManager, mediaController, agentOptions),
      compositionalAgent: new CompositionalAgent(this.textModel, storageManager, assetManager, agentOptions),
      semanticExpert: new SemanticExpertAgent(this.textModel),
      sceneAgent: new SceneGeneratorAgent(this.videoModel, qualityAgent, storageManager, assetManager, agentOptions),
      continuityAgent: new ContinuityManagerAgent(
        this.textModel,
        this.textModel,
        qualityAgent,
        storageManager,
        assetManager,
        agentOptions,
      ),
    };
  }

  private createUpdateEntitiesCallback = (job: Job): UpdateEntitiesCallback => {
    const sendUpdateEntities = async (
      updates: Array<{
        id: string;
        entityType: "scene" | "character" | "location";
        entity: Partial<Scene> | Partial<Character> | Partial<Location>;
        assets?: AssetRegistry;
      }>,
      saveToDb = true,
    ) => {
      try {
        console.log({ projectId: job.projectId, count: updates.length }, `Updating entities`);
        if (saveToDb) {
          const sceneUpdates = updates
            .filter((u) => u.entityType === "scene")
            .map((u) => ({
              id: u.id,
              ...(u.entity as Partial<Scene>),
            }));
          if (sceneUpdates.length > 0) {
            await this.projectRepository.updateScenes(sceneUpdates as UpdateScene[]);
          }
        }

        await this.publishPipelineEvent({
          type: "ENTITY_UPDATED",
          projectId: job.projectId,
          worldId: job.worldId,
          userId: job.userId,
          teamId: job.teamId,
          payload: updates as any,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(
          {
            error,
            functionName: "sendUpdateEntities",
            projectId: job.projectId,
            jobId: job.id,
            workerId: this.workerId,
          },
          `Error updating entities`,
        );
        throw error;
      }
    };
    return sendUpdateEntities;
  };

  private createSaveAssetsCallback = (job: Job, jobStartTime: number): SaveAssetsCallback => {
    async function saveAssets(
      this: WorkerService,
      ...[
        scope,
        assetKeys,
        type,
        assets,
        metadata,
        setBest = true,
        callbackStartTime = jobStartTime,
      ]: SaveAssetsCallbackArgs
    ) {
      try {
        const assetHistories = await this.getAgents(job.projectId).assetManager.createVersionedAssets(
          scope,
          assetKeys,
          type,
          assets,
          metadata.map((m) => ({ ...m, jobId: job.id })) as AssetVersion["metadata"][],
          setBest,
          new Date(callbackStartTime),
        );

        const payload = assetHistories.map((history, index) => ({
          entityId: entityIdAt(scope).ids[index],
          assetKey: assetKeys[index] ?? assetKeys[0],
          history: history,
        }));

        await this.publishPipelineEvent({
          type: "NEW_ASSETS_BATCH",
          projectId: job.projectId,
          worldId: job.worldId,
          userId: job.userId,
          teamId: job.teamId,
          payload: payload,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(
          {
            error,
            functionName: "saveAssets",
            projectId: job.projectId,
            jobId: job.id,
            workerId: this.workerId,
          },
          `Error saving assets`,
        );
        throw error;
      }
    }
    return saveAssets.bind(this);
  };

  /**
   * Processes a dispatched job by claiming it and executing the relevant agent logic.
   * Uses AsyncLocalStorage to ensure all logs and agent sub-tasks are traceable.
   * @param jobId - The ID of the job dispatched by the system.
   */
  async processJob(jobId: string): Promise<void> {
    const claim = await this.jobControlPlane.claimJob(jobId);
    if (!claim) {
      console.warn({ jobId }, `Job unavailable or concurrency limit reached`);
      return;
    }

    let [job, claimedAtISO] = claim;
    const startTime = new Date(claimedAtISO).getTime();

    await logContextStore.run(
      {
        jobId: job.id,
        jobUniqueKey: job.uniqueKey,
        projectId: job.projectId,
        w_id: this.workerId,
        correlationId: generateId(),
        shouldPublish: false,
        jobType: job.type,
        attempt: job.attempts.currentAttempt,
      },
      async () => {
        try {
          await this.publishJobEvent({
            type: "JOB_STARTED",
            projectId: job.projectId,
            userId: job.userId,
            teamId: job.teamId,
            metadata: buildJobEventMetadata(job),
          });
          console.log({ job, startTime }, `Executing job.`);

          const controller = new AbortController();
          const agents = this.getAgents(job.projectId, controller.signal);

          let updated: Project;
          switch (job.type) {
            case "EXPAND_CREATIVE_PROMPT": {
              let project: ProjectEntity;
              try {
                project = await this.projectRepository.getProject(job.projectId);
                if (!project.metadata.initialPrompt) throw new Error("No user prompt provided");
              } catch (caseError: any) {
                console.error(
                  {
                    error: caseError,
                    jobType: job.type,
                    jobId,
                    projectId: job.projectId,
                  },
                  "Job case failed",
                );
                throw caseError;
              }

              let result: GenerativeResultExpandCreativePrompt;
              try {
                result = await agents.compositionalAgent.expandCreativePrompt(
                  project.metadata.title,
                  project.metadata.initialPrompt,
                  {
                    maxRetries: 3,
                    attempt: 1,
                    initialDelay: 1000,
                    projectId: job.projectId,
                  },
                );
              } catch (generateError: any) {
                console.error(
                  {
                    error: generateError,
                    jobType: job.type,
                    jobId,
                    projectId: job.projectId,
                  },
                  "Failed to generate",
                );
                throw generateError;
              }

              try {
                const updatedMetadata: ProjectMetadata = {
                  ...project.metadata,
                  enhancedPrompt: result.data.expandedPrompt,
                };

                const nextStoryboard = storyboardManager.applyUpdates(project.storyboard, {
                  metadata: updatedMetadata,
                  characters: [],
                  locations: [],
                  scenes: [],
                });

                updated = await this.projectRepository.updateProject(project.id, {
                  metadata: updatedMetadata,
                  storyboard: nextStoryboard,
                });
              } catch (updateError: any) {
                console.error(
                  {
                    error: updateError,
                    jobType: job.type,
                    jobId,
                    projectId: job.projectId,
                  },
                  "Failed to update project",
                );
                throw updateError;
              }
              break;
            }

            case "GENERATE_STORYBOARD": {
              try {
                console.debug(
                  { jobType: job.type, jobId, projectId: job.projectId },
                  "Initiating GENERATE_STORYBOARD pipeline.",
                );

                let project = await this.projectRepository.getProject(job.projectId);
                if (!project.metadata.enhancedPrompt) throw new Error("No enhanced prompt available");

                try {
                  const existingCharactersWithAssets = await this.projectRepository.getProjectCharacters(job.projectId);
                  const existingLocationsWithAssets = await this.projectRepository.getProjectLocations(job.projectId);

                  console.debug(
                    {
                      jobId,
                      characterCount: existingCharactersWithAssets.length,
                      locationCount: existingLocationsWithAssets.length,
                    },
                    "Retrieved existing project assets.",
                  );

                  let { data, metadata } = await agents.compositionalAgent.generateStoryboardExclusivelyFromPrompt(
                    project.metadata.title,
                    project.metadata.enhancedPrompt,
                    {
                      attempt: job.attempts.currentAttempt,
                      maxRetries: job.attempts.maxRetries,
                      projectId: job.projectId,
                    },
                    existingCharactersWithAssets.map(mapCharacterWithAssetsToCharacterAttributes),
                    existingLocationsWithAssets.map(mapLocationWithAssetsToLocationAttributes),
                  );

                  try {
                    const storyboardCharacters: CharacterBase[] = [];
                    const storyboardLocations: LocationBase[] = [];
                    const storyboardScenes: SceneBase[] = [];

                    // -----------------------------------------------------------------------
                    // Build lookup maps from real DB records so we always use true DB ids.
                    // Existing entities (matched by referenceId) source their id from the DB.
                    // Only genuinely new entities get a freshly minted insert record — their
                    // generated UUID becomes real once inserted.
                    // -----------------------------------------------------------------------
                    const existingCharactersByRefId = new Map(
                      existingCharactersWithAssets.map((c) => [ c.referenceId, c ]),
                    );
                    const existingLocationsByRefId = new Map(
                      existingLocationsWithAssets.map((l) => [ l.referenceId, l ]),
                    );

                    const newCharactersToInsertData: InsertCharacter[] = [];

                    for (const character of data.storyboardAttributes.characters) {
                      const existing = existingCharactersByRefId.get(character.referenceId);

                      if (existing) {
                        // Existing character — use the real DB record so the id is valid.
                        storyboardCharacters.push(
                          mapCharacterWithAssetsToCharacterBase({
                            ...existing,
                            description: character.description,
                          }),
                        );
                      } else {
                    // New character — mint an insert record; its UUID will be persisted.
                        const insertCharacter = mapDomainCharacterToInsertCharacter({
                          ...character,
                          projectId: project.id,
                        });
                        storyboardCharacters.push(
                          mapCharacterWithAssetsToCharacterBase({
                            ...insertCharacter,
                            description: character.description,
                          }),
                        );
                        newCharactersToInsertData.push(insertCharacter);
                      }
                    }

                    const newLocationsToInsertData: InsertLocation[] = [];

                    for (const location of data.storyboardAttributes.locations) {
                      const existing = existingLocationsByRefId.get(location.referenceId);

                      if (existing) {
                        // Existing location — use the real DB record so the id is valid.
                        storyboardLocations.push(
                          mapLocationWithAssetsToLocationBase({
                            ...existing,
                            description: location.description,
                          }),
                        );
                      } else {
                        // New location — mint an insert record; its UUID will be persisted.
                        const insertLocation = mapDomainLocationToInsertLocation({
                          ...location,
                          projectId: project.id,
                        });
                        storyboardLocations.push(
                          mapLocationWithAssetsToLocationBase({
                            ...insertLocation,
                            description: location.description,
                          }),
                        );
                        newLocationsToInsertData.push(insertLocation);
                      }
                    }

                    console.debug(
                      {
                        jobId,
                        newCharacters: newCharactersToInsertData.length,
                        newLocations: newLocationsToInsertData.length,
                      },
                      "Deduplication complete. Executing database insertions.",
                    );

                    const [ insertedCharactersWithAssets, insertedLocationsWithAssets ] = await Promise.all([
                      newCharactersToInsertData.length > 0
                        ? this.projectRepository.createCharacters(project.id, newCharactersToInsertData)
                        : Promise.resolve([]),
                      newLocationsToInsertData.length > 0
                        ? this.projectRepository.createLocations(project.id, newLocationsToInsertData)
                        : Promise.resolve([]),
                    ]);

                    for (const character of insertedCharactersWithAssets) {
                      if (!character.name) {
                        throw new Error("Entity name is required for handle registration.");
                      }
                      try {
                        await tagRegistryService.registerHandle({
                          handle: `@${character.name.replace(/[^a-zA-Z0-9_]/g, "")}`,
                          entityId: character.id,
                          entityType: "character",
                          projectId: job.projectId,
                        });
                      } catch (errRegisterHandle) {
                        console.warn(
                          { entityId: character.id, error: errRegisterHandle },
                          "[Worker] Failed to register character handle.",
                        );
                      }
                    }

                    for (const location of insertedLocationsWithAssets) {
                      if (!location.name) {
                        throw new Error("Entity name is required for handle registration.");
                      }
                      try {
                        await tagRegistryService.registerHandle({
                          handle: `@${location.name.replace(/[^a-zA-Z0-9_]/g, "")}`,
                          entityId: location.id,
                          entityType: "location",
                          projectId: job.projectId,
                        });
                      } catch (errRegisterHandle) {
                        console.warn(
                          { entityId: location.id, error: errRegisterHandle },
                          "[Worker] Failed to register location handle.",
                        );
                      }
                    }

                    // Save description assets for newly created entities only — existing
                    // entities already have their description assets in the DB.
                    const newStoryboardCharacters = storyboardCharacters.filter(
                      (c) => !existingCharactersByRefId.has(c.referenceId),
                    );
                    const newStoryboardLocations = storyboardLocations.filter(
                      (l) => !existingLocationsByRefId.has(l.referenceId),
                    );

                    if (newStoryboardCharacters.length > 0) {
                      await this.createSaveAssetsCallback(job, startTime)(
                        {
                          projectId: project.id,
                          characterIds: newStoryboardCharacters.map((c) => c.id),
                        },
                        [ "description" ],
                        "text",
                        newStoryboardCharacters.map((c) => c.description),
                        [ { model: metadata.model } ],
                      );
                    }

                    if (newStoryboardLocations.length > 0) {
                      await this.createSaveAssetsCallback(job, startTime)(
                        {
                          projectId: project.id,
                          locationIds: newStoryboardLocations.map((l) => l.id),
                        },
                        [ "description" ],
                        "text",
                        newStoryboardLocations.map((l) => l.description),
                        [ { model: metadata.model } ],
                      );
                    }

                    const allCharactersWithAssets = [ ...existingCharactersWithAssets, ...insertedCharactersWithAssets ];
                    const allLocationsWithAssets = [ ...existingLocationsWithAssets, ...insertedLocationsWithAssets ];

                    const scenesToInsertData: SceneBase[] = data.storyboardAttributes.scenes.map((scene) => {
                      const insertScene: SceneEntity = mapDomainSceneToInsertScene({
                        ...scene,
                        projectId: project.id,
                        locationId: mapReferenceIdsToIds(allLocationsWithAssets, [ scene.locationReferenceId ])[ 0 ],
                      });

                      const characterIds = mapReferenceIdsToIds(allCharactersWithAssets, scene.characterReferenceIds);

                      storyboardScenes.push(
                        mapSceneWithAssetsToSceneBase({
                          ...insertScene,
                          characterIds,
                          description: scene.description,
                        }),
                      );

                      return {
                        ...insertScene,
                        description: scene.description,
                        characterIds,
                      };
                    });

                    const allScenesWithAssets = await this.projectRepository.createScenes(
                      project.id,
                      scenesToInsertData,
                    );

                    if (storyboardScenes.length > 0) {
                      const sceneDescriptions = storyboardScenes.map((l) => l.description);
                      await this.createSaveAssetsCallback(job, startTime)(
                        {
                          projectId: project.id,
                          sceneIds: storyboardScenes.map((l) => l.id),
                        },
                        [ "description" ],
                        "text",
                        sceneDescriptions,
                        [ { model: metadata.model } ],
                      );
                    }

                    const updateMetadata: ProjectMetadata = {
                      ...project.metadata,
                      ...data.storyboardAttributes.metadata,
                    };

                    const [ refreshedCharacters, refreshedLocations, refreshedScenes ] = await Promise.all([
                      this.projectRepository.getProjectCharacters(project.id),
                      this.projectRepository.getProjectLocations(project.id),
                      this.projectRepository.getProjectScenes(project.id),
                    ]);

                    const nextStoryboard = storyboardManager.applyUpdates(
                      makeEmptyLiveStoryboard(updateMetadata),
                      {
                        metadata: updateMetadata,
                        characters: refreshedCharacters,
                        locations: refreshedLocations,
                        scenes: refreshedScenes,
                      },
                    );

                    updated = await this.projectRepository.updateProject(project.id, {
                      metadata: updateMetadata,
                      storyboard: nextStoryboard,
                      scenes: allScenesWithAssets,
                      characters: allCharactersWithAssets,
                      locations: allLocationsWithAssets,
                    });

                    // Await asset save to prevent race condition worker termination
                    await this.createSaveAssetsCallback(job, startTime)(
                      { projectId: project.id },
                      [ "storyboard" ],
                      "text",
                      [ JSON.stringify(updated.storyboard) ],
                      [ { model: metadata.model } ],
                    ).catch((error) => {
                      console.error(
                        { error, jobType: job.type, jobId, projectId: job.projectId },
                        "Non-fatal: Failed to save storyboard text asset.",
                      );
                    });

                    console.debug(
                      { jobId, projectId: project.id },
                      "GENERATE_STORYBOARD pipeline completed successfully.",
                    );
                  } catch (updateError: any) {
                    console.error(
                      {
                        error: updateError,
                        jobType: job.type,
                        jobId,
                        projectId: job.projectId,
                      },
                      "Failed during database insertion or asset compilation.",
                    );
                    throw updateError;
                  }
                } catch (generateError: any) {
                  console.error(
                    {
                      error: generateError,
                      jobType: job.type,
                      jobId,
                      projectId: job.projectId,
                    },
                    "Compositional Agent failed to generate storyboard.",
                  );
                  throw generateError;
                }
              } catch (caseError: any) {
                console.error(
                  {
                    error: caseError,
                    jobType: job.type,
                    jobId,
                    projectId: job.projectId,
                  },
                  "GENERATE_STORYBOARD job case failed.",
                );
                throw caseError;
              }
              break;
            }

            case "PROCESS_AUDIO_TO_SCENES": {
              try {
                let project = await this.projectRepository.getProject(job.projectId);
                if (!project?.metadata.enhancedPrompt) throw new Error("No enhanced prompt available");
                if (!project?.metadata.audioPublicUri) throw new Error("No audio public url available");

                try {
                  let { data, metadata } = await agents.mediaProcessingAgent.processAudioToScenes(
                    project.metadata.audioPublicUri,
                    project.metadata.enhancedPrompt,
                  );

                  try {
                    const { segments, ...analysisData } = data.analysis;

                    await this.createSaveAssetsCallback(job, startTime)(
                      { projectId: project.id },
                      ["audio_analysis"],
                      "text",
                      [JSON.stringify(data.analysis)],
                      [{ model: metadata.model }],
                    ).catch((error) => {
                      console.error(
                        { error, jobType: job.type, jobId, projectId: job.projectId },
                        "Failed to save assets",
                      );
                    });

                    const projectMetadata: ProjectMetadata = {
                      ...project.metadata,
                      ...analysisData,
                    };

                    const storyboard = makeEmptyLiveStoryboard(projectMetadata);

                    updated = await this.projectRepository.updateProject(job.projectId, {
                      status: "pending",
                      metadata: projectMetadata,
                      storyboard,
                      audioAnalysis: data.analysis,
                    });

                    // Passing only the fields that need to be updated
                  } catch (updateError: any) {
                    console.error(
                      {
                        error: updateError,
                        jobType: job.type,
                        jobId,
                        projectId: job.projectId,
                      },
                      "Failed to update project",
                    );
                    throw updateError;
                  }
                } catch (processError: any) {
                  console.error(
                    {
                      model: this.textModel.textModel,
                      error: processError,
                      jobType: job.type,
                      jobId,
                      projectId: job.projectId,
                    },
                    "Failed to process audio",
                  );
                  throw processError;
                }
              } catch (caseError: any) {
                console.error(
                  {
                    error: caseError,
                    jobType: job.type,
                    jobId,
                    projectId: job.projectId,
                  },
                  "Job case failed",
                );
                throw caseError;
              }
              break;
            }

            case "ENHANCE_STORYBOARD": {
              try {
                console.debug(
                  { jobType: job.type, jobId, projectId: job.projectId },
                  "Initiating ENHANCE_STORYBOARD pipeline.",
                );

                let project = await this.projectRepository.getProjectFullState(job.projectId);
                if (!project?.storyboard || !project.storyboard.scenes) throw new Error("No scenes available.");
                if (!project?.metadata.enhancedPrompt) throw new Error("No enhanced prompt available.");

                try {
                  const existingCharactersWithAssets = await this.projectRepository.getProjectCharacters(job.projectId);
                  const existingLocationsWithAssets = await this.projectRepository.getProjectLocations(job.projectId);

                  let data: GenerativeResultEnhanceStoryboard[ "data" ];
                  let metadata: GenerativeResultEnhanceStoryboard[ "metadata" ];

                  console.debug(
                    { jobId, hasAudio: project.metadata.hasAudio },
                    "Executing Compositional Agent storyboard enhancement.",
                  );

                  if (project.metadata.hasAudio && project.audioAnalysis) {
                    ({ data, metadata } = await agents.compositionalAgent.generateStoryboardFromAudioAnalysis(
                      project.metadata.title,
                      project.metadata.enhancedPrompt,
                      project.audioAnalysis.segments,
                      {
                        initialDelay: 30000,
                        attempt: job.attempts.currentAttempt,
                        maxRetries: job.attempts.maxRetries,
                        projectId: job.projectId,
                      },
                      existingCharactersWithAssets.map(mapCharacterWithAssetsToCharacterAttributes),
                      existingLocationsWithAssets.map(mapLocationWithAssetsToLocationAttributes),
                    ));
                  } else {
                    ({ data, metadata } = await agents.compositionalAgent.generateStoryboardFromAudioAnalysis(
                      project.metadata.title,
                      project.metadata.enhancedPrompt,
                      project.scenes,
                      {
                        initialDelay: 30000,
                        attempt: job.attempts.currentAttempt,
                        maxRetries: job.attempts.maxRetries,
                        projectId: job.projectId,
                      },
                      existingCharactersWithAssets.map(mapCharacterWithAssetsToCharacterAttributes),
                      existingLocationsWithAssets.map(mapLocationWithAssetsToLocationAttributes),
                    ));
                  }

                  try {
                    const storyboardCharacters: CharacterBase[] = [];
                    const storyboardLocations: LocationBase[] = [];
                    const storyboardScenes: SceneBase[] = [];

                    // -----------------------------------------------------------------------
                    // Build lookup maps from the real DB records so we can resolve existing
                    // characters/locations by referenceId and always use their true DB ids.
                    // Only entities whose referenceId is NOT in the DB get a freshly minted
                    // insert record — their generated UUID will become real once inserted.
                    // -----------------------------------------------------------------------
                    const existingCharactersByRefId = new Map(
                      existingCharactersWithAssets.map((c) => [ c.referenceId, c ]),
                    );
                    const existingLocationsByRefId = new Map(
                      existingLocationsWithAssets.map((l) => [ l.referenceId, l ]),
                    );

                    const newCharactersToInsertData: InsertCharacter[] = [];

                    for (const character of data.storyboardAttributes.characters) {
                      const existing = existingCharactersByRefId.get(character.referenceId);

                      if (existing) {
                        // Existing character — use the real DB record so the id is valid.
                        storyboardCharacters.push(
                          mapCharacterWithAssetsToCharacterBase({
                            ...existing,
                            description: character.description,
                          }),
                        );
                      } else {
                    // New character — mint an insert record; its UUID will be persisted.
                        const insertCharacter = mapDomainCharacterToInsertCharacter({
                          ...character,
                          projectId: project.id,
                        });
                        storyboardCharacters.push(
                          mapCharacterWithAssetsToCharacterBase({
                            ...insertCharacter,
                            description: character.description,
                          }),
                        );
                        newCharactersToInsertData.push(insertCharacter);
                      }
                    }

                    const newLocationsToInsertData: InsertLocation[] = [];

                    for (const location of data.storyboardAttributes.locations) {
                      const existing = existingLocationsByRefId.get(location.referenceId);

                      if (existing) {
                        // Existing location — use the real DB record so the id is valid.
                        storyboardLocations.push(
                          mapLocationWithAssetsToLocationBase({
                            ...existing,
                            description: location.description,
                          }),
                        );
                      } else {
                        // New location — mint an insert record; its UUID will be persisted.
                        const insertLocation = mapDomainLocationToInsertLocation({
                          ...location,
                          projectId: project.id,
                        });
                        storyboardLocations.push(
                          mapLocationWithAssetsToLocationBase({
                            ...insertLocation,
                            description: location.description,
                          }),
                        );
                        newLocationsToInsertData.push(insertLocation);
                      }
                    }

                    console.debug(
                      {
                        jobId,
                        newCharacters: newCharactersToInsertData.length,
                        newLocations: newLocationsToInsertData.length,
                      },
                      "Deduplication complete. Executing database insertions for enhanced assets.",
                    );

                    const [ insertedCharactersWithAssets, insertedLocationsWithAssets ] = await Promise.all([
                      newCharactersToInsertData.length > 0
                        ? this.projectRepository.createCharacters(project.id, newCharactersToInsertData)
                        : Promise.resolve([]),
                      newLocationsToInsertData.length > 0
                        ? this.projectRepository.createLocations(project.id, newLocationsToInsertData)
                        : Promise.resolve([]),
                    ]);

                    for (const character of insertedCharactersWithAssets) {
                      if (!character.name) {
                        throw new Error("Entity name is required for handle registration.");
                      }
                      try {
                        await tagRegistryService.registerHandle({
                          handle: `@${character.name.replace(/[^a-zA-Z0-9_]/g, "")}`,
                          entityId: character.id,
                          entityType: "character",
                          projectId: job.projectId,
                        });
                      } catch (errRegisterHandle) {
                        console.warn(
                          { entityId: character.id, error: errRegisterHandle },
                          "[Worker] Failed to register character handle.",
                        );
                      }
                    }

                    for (const location of insertedLocationsWithAssets) {
                      if (!location.name) {
                        throw new Error("Entity name is required for handle registration.");
                      }
                      try {
                        await tagRegistryService.registerHandle({
                          handle: `@${location.name.replace(/[^a-zA-Z0-9_]/g, "")}`,
                          entityId: location.id,
                          entityType: "location",
                          projectId: job.projectId,
                        });
                      } catch (errRegisterHandle) {
                        console.warn(
                          { entityId: location.id, error: errRegisterHandle },
                          "[Worker] Failed to register location handle.",
                        );
                      }
                    }

                    // Save description assets for newly created entities only — existing
                    // entities already have their description assets in the DB.
                    const newStoryboardCharacters = storyboardCharacters.filter(
                      (c) => !existingCharactersByRefId.has(c.referenceId),
                    );
                    const newStoryboardLocations = storyboardLocations.filter(
                      (l) => !existingLocationsByRefId.has(l.referenceId),
                    );

                    if (newStoryboardCharacters.length > 0) {
                      await this.createSaveAssetsCallback(job, startTime)(
                        {
                          projectId: project.id,
                          characterIds: newStoryboardCharacters.map((c) => c.id),
                        },
                        [ "description" ],
                        "text",
                        newStoryboardCharacters.map((c) => c.description),
                        [ { model: metadata.model } ],
                      );
                    }

                    if (newStoryboardLocations.length > 0) {
                      await this.createSaveAssetsCallback(job, startTime)(
                        {
                          projectId: project.id,
                          locationIds: newStoryboardLocations.map((l) => l.id),
                        },
                        [ "description" ],
                        "text",
                        newStoryboardLocations.map((l) => l.description),
                        [ { model: metadata.model } ],
                      );
                    }

                    const allCharactersWithAssets: CharacterWithAssets[] = [
                      ...existingCharactersWithAssets,
                      ...insertedCharactersWithAssets,
                    ];
                    const allLocationsWithAssets: LocationWithAssets[] = [
                      ...existingLocationsWithAssets,
                      ...insertedLocationsWithAssets,
                    ];

                    const scenesToInsertData: SceneBase[] = data.storyboardAttributes.scenes.map((scene) => {
                      const insertScene: SceneEntity = mapDomainSceneToInsertScene({
                        ...scene,
                        projectId: project.id,
                        locationId: mapReferenceIdsToIds(allLocationsWithAssets, [ scene.locationReferenceId ])[ 0 ],
                      });

                      const characterIds: string[] = mapReferenceIdsToIds(
                        allCharactersWithAssets,
                        scene.characterReferenceIds,
                      );

                      storyboardScenes.push(
                        mapSceneWithAssetsToSceneBase({
                          ...insertScene,
                          characterIds,
                          description: scene.description,
                        }),
                      );

                      return {
                        ...insertScene,
                        characterIds,
                        description: scene.description,
                      };
                    });

                    const allScenesWithAssets = await this.projectRepository.createScenes(
                      project.id,
                      scenesToInsertData,
                    );

                    if (storyboardScenes.length > 0) {
                      const sceneDescriptions = storyboardScenes.map((l) => l.description);
                      await this.createSaveAssetsCallback(job, startTime)(
                        {
                          projectId: project.id,
                          sceneIds: storyboardScenes.map((l) => l.id),
                        },
                        [ "description" ],
                        "text",
                        sceneDescriptions,
                        [ { model: metadata.model } ],
                      );
                    }

                    const updateMetadata: ProjectMetadata = {
                      ...project.metadata,
                      ...data.storyboardAttributes.metadata,
                    };

                    const [ refreshedCharacters, refreshedLocations, refreshedScenes ] = await Promise.all([
                      this.projectRepository.getProjectCharacters(project.id),
                      this.projectRepository.getProjectLocations(project.id),
                      this.projectRepository.getProjectScenes(project.id),
                    ]);

                    const nextStoryboard = storyboardManager.applyUpdates(makeEmptyLiveStoryboard(updateMetadata), {
                      metadata: updateMetadata,
                      characters: refreshedCharacters,
                      locations: refreshedLocations,
                      scenes: refreshedScenes,
                    });

                    updated = await this.projectRepository.updateProject(job.projectId, {
                      storyboard: nextStoryboard,
                      metadata: updateMetadata,
                      characters: allCharactersWithAssets,
                      locations: allLocationsWithAssets,
                      scenes: allScenesWithAssets,
                    });

                    await this.createSaveAssetsCallback(job, startTime)(
                      { projectId: project.id },
                      [ "storyboard" ],
                      "text",
                      [ JSON.stringify(updated.storyboard) ],
                      [ { model: metadata.model } ],
                    ).catch((error) => {
                      console.error(
                        { error, jobType: job.type, jobId, projectId: job.projectId },
                        "Non-fatal: Failed to save enhanced storyboard text asset.",
                      );
                    });

                    console.debug(
                      { jobId, projectId: project.id },
                      "ENHANCE_STORYBOARD pipeline completed successfully.",
                    );
                  } catch (updateError: any) {
                    console.error(
                      {
                        error: updateError,
                        jobType: job.type,
                        jobId,
                        projectId: job.projectId,
                      },
                      "Failed to persist enhanced project attributes.",
                    );
                    throw updateError;
                  }
                } catch (enhanceError: any) {
                  console.error(
                    {
                      error: enhanceError,
                      jobType: job.type,
                      jobId,
                      projectId: job.projectId,
                    },
                    "Compositional Agent failed to enhance storyboard.",
                  );
                  throw enhanceError;
                }
              } catch (caseError: any) {
                console.error(
                  {
                    error: caseError,
                    jobType: job.type,
                    jobId,
                    projectId: job.projectId,
                  },
                  "ENHANCE_STORYBOARD job case failed.",
                );
                throw caseError;
              }
              break;
            }

            case "SEMANTIC_ANALYSIS": {
              try {
                const project = await this.projectRepository.getProjectFullState(job.projectId);
                if (!project?.storyboard) throw new Error("No storyboard available.");

                try {
                  let { data, metadata } = await agents.semanticExpert.generateRules(project.storyboard);

                  try {
                    const proactiveRules = (await import("../shared/prompts/must-review/domain-rules.js")).getProactiveRules();
                    const uniqueRules = Array.from(new Set([ ...proactiveRules, ...data.dynamicRules ]));

                    const generationRules = uniqueRules;
                    const generationRulesHistory = [ ...project.generationRulesHistory, uniqueRules ];

                    updated = await this.projectRepository.updateProject(job.projectId, { generationRules });
                  } catch (updateError: any) {
                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                    throw updateError;
                  }
                } catch (analysisError: any) {
                  console.error({ error: analysisError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to generate rules");
                  throw analysisError;
                }
              } catch (caseError: any) {
                console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
                throw caseError;
              }
              break;
            }

            case "GENERATE_CHARACTER_IMAGES": {
              try {
                const project = await this.projectRepository.getProjectFullState(job.projectId);
                // CHANGE 2/4 — original read full character objects off job.payload.characters.
                // Payload now carries only characterIds; filter from the freshly loaded project.
                // Empty / absent characterIds → fall back to all project characters (batch runs).
                const charactersToProcess = job.payload?.characterIds?.length
                  ? project.characters.filter((c) => job.payload?.characterIds?.includes(c.id))
                  : project.characters;

                if (!charactersToProcess.length) {
                  console.log("No characters to process");
                  throw new Error("No characters to process.");
                }

                const hydratedCharacters: Character[] = charactersToProcess.map((c) => hydrateEntity(c, c.assets));

                try {
                  let { data, metadata } = await agents.continuityAgent.generateCharacterAssets(
                    hydratedCharacters,
                    project.generationRules,
                    this.createSaveAssetsCallback(job, startTime),
                    this.jobControlPlane.createIncrementAttemptHook(job),
                    {
                      userId: job.userId,
                      teamId: job.teamId
                    }
                  );

                  try {
                    const nextStoryboard = storyboardManager.applyUpdates(project.storyboard, {
                      metadata: project.storyboard.metadata,
                      characters: data.characters, // updated by this job
                      locations: project.locations, // pass-through — preserves storyboard entries
                      scenes: project.scenes, // pass-through
                    });

                    updated = await this.projectRepository.updateProject(job.projectId, {
                      characters: data.characters,
                      storyboard: nextStoryboard,
                    });
                  } catch (updateError: any) {
                    console.error(
                      {
                        error: updateError,
                        jobType: job.type,
                        jobId,
                        projectId: job.projectId,
                      },
                      "Failed to update project",
                    );
                    throw updateError;
                  }
                } catch (generateError: any) {
                  console.error(
                    {
                      error: generateError,
                      jobType: job.type,
                      jobId,
                      projectId: job.projectId,
                    },
                    "Failed to generate character assets",
                  );
                  throw generateError;
                }
              } catch (caseError: any) {
                console.error(
                  {
                    error: caseError,
                    jobType: job.type,
                    jobId,
                    projectId: job.projectId,
                  },
                  "Job case failed",
                );
                throw caseError;
              }
              break;
            }

            case "GENERATE_LOCATION_IMAGES": {
              try {
                const project = await this.projectRepository.getProjectFullState(job.projectId);
                // CHANGE 3/4 — original read full location objects off job.payload.locations.
                // Payload now carries only locationIds; filter from the freshly loaded project.
                // Empty / absent locationIds → fall back to all project locations (batch runs).
                const locationsToProcess = job.payload?.locationIds?.length
                  ? project.locations.filter((l) => job.payload?.locationIds?.includes(l.id))
                  : project.locations;

                if (!locationsToProcess.length) {
                  console.log("No locations to process");
                  throw new Error("No locations to process.");
                }

                try {
                  let { data, metadata } = await agents.continuityAgent.generateLocationAssets(
                    locationsToProcess.map((l) => hydrateEntity(l, l.assets)),
                    project.generationRules,
                    this.createSaveAssetsCallback(job, startTime),
                    this.jobControlPlane.createIncrementAttemptHook(job),
                    {
                      userId: job.userId,
                      teamId: job.teamId
                    }
                  );
                  try {
                    const nextStoryboard = storyboardManager.applyUpdates(project.storyboard, {
                      metadata: project.storyboard.metadata,
                      characters: project.characters, // pass-through
                      locations: data.locations, // updated by this job
                      scenes: project.scenes, // pass-through
                    });

                    updated = await this.projectRepository.updateProject(job.projectId, {
                      locations: data.locations,
                      storyboard: nextStoryboard, // [+]
                    });
                  } catch (updateError: any) {
                    console.error(
                      {
                        error: updateError,
                        jobType: job.type,
                        jobId,
                        projectId: job.projectId,
                      },
                      "Failed to update project",
                    );
                    throw updateError;
                  }
                } catch (generateError: any) {
                  console.error(
                    {
                      error: generateError,
                      jobType: job.type,
                      jobId,
                      projectId: job.projectId,
                    },
                    "Failed to generate location assets",
                  );
                  throw generateError;
                }
              } catch (caseError: any) {
                console.error(
                  {
                    error: caseError,
                    jobType: job.type,
                    jobId,
                    projectId: job.projectId,
                  },
                  "Job case failed",
                );
                throw caseError;
              }
              break;
            }

            // CHANGE 4/4 — new case for on-demand composite image generation.
            // Delegates image model calls and GCS uploads to processGenerateCompositeJob,
            // then persists the outputs via the standard saveAssets callback and refreshes
            // the project so publishStateUpdate delivers a complete FULL_STATE to the client.
            case "GENERATE_COMPOSITE": {
              try {
                const { data, metadata } = await processGenerateCompositeJob(
                  job,
                  this.textModel,
                  agents.storageManager,
                );

                if (!data.outputImages.length) {
                  throw new Error("GENERATE_COMPOSITE produced no output images.");
                }

                try {
                  await this.createSaveAssetsCallback(job, startTime)(
                    { projectId: job.projectId, fileIds: [job.payload.imageId] },
                    ["image_file"],
                    "image",
                    data.outputImages.map((img) => img.data),
                    [metadata],
                  );

                  updated = await this.projectRepository.getProjectFullState(job.projectId);
                } catch (updateError: any) {
                  console.error(
                    {
                      error: updateError,
                      jobType: job.type,
                      jobId,
                      projectId: job.projectId,
                    },
                    "Failed to save composite assets",
                  );
                  throw updateError;
                }
              } catch (caseError: any) {
                console.error(
                  {
                    error: caseError,
                    jobType: job.type,
                    jobId,
                    projectId: job.projectId,
                  },
                  "Job case failed",
                );
                throw caseError;
              }
              break;
            }

            // TODO MOVE DEFERRAL LOGIC INTO CONTINUTIY MANAGER
            // TODO ENSURE SCENES WITH A START FRAME OR END FRAME CAN STILL BE GENERATED
            case "GENERATE_SCENE_FRAMES": {
              try {
                const project = await this.projectRepository.getProjectFullState(job.projectId);
                const scenesToProcess = job.payload?.sceneIds?.length
                  ? project.scenes.filter((scene) => job.payload.sceneIds?.includes(scene.id))
                  : project.scenes;

                if (!scenesToProcess.length) {
                  console.warn(`[Job ${job.id}] Execution aborted: No valid scenes resolved for processing.`);
                  throw new Error("No scenes to process.");
                }

                try {
                  const result = await agents.continuityAgent.generateSceneFramesBatch(
                    hydrateProject(project),
                    scenesToProcess.map((scene) => hydrateEntity(scene, scene.assets)),
                    job.payload.assetKeys,
                    this.createSaveAssetsCallback(job, startTime),
                    this.createUpdateEntitiesCallback(job),
                    this.jobControlPlane.createIncrementAttemptHook(job),
                    { userId: job.userId, teamId: job.teamId }
                  );

                  if (!result?.data) {
                    throw new Error("Continuity agent returned malformed payload.");
                  }

                  const deferredSceneIds = result.data.deferredSceneIds;
                  if (deferredSceneIds && deferredSceneIds.length > 0) {
                    const currentAttempt = job.attempts?.currentAttempt ?? 0;
                    const MAX_CONTINUITY_DEFERRALS = 3;

                    if (currentAttempt < MAX_CONTINUITY_DEFERRALS) {
                      console.log(`[Job ${job.id}] CONTINUITY DEFERRAL: Dependencies pending for [${deferredSceneIds.join(", ")}]. Re-queueing job (Attempt ${currentAttempt}/${MAX_CONTINUITY_DEFERRALS}).`);
                      await this.jobControlPlane.requeueJob(job.id);

                      this.createUpdateEntitiesCallback(job)(deferredSceneIds.map((id) => ({
                        id, entityType: "scene",
                        entity: {
                          id, status: "pending" as const,
                          progressMessage: `Waiting for upstream scene continuity lock. Attempt ${currentAttempt + 1}/${MAX_CONTINUITY_DEFERRALS}`,
                        },
                      })));
                      return;
                    } else {
                      console.error(`🚨 [Job ${job.id}] CRITICAL CONTINUITY FAILURE. Pipeline bottleneck. Max deferrals breached for scenes: ${deferredSceneIds.join(", ")}. Executing independent fallback generation.`);

                      this.createUpdateEntitiesCallback(job)(deferredSceneIds.map((id) => ({
                        id, entityType: "scene",
                        entity: {
                          id, status: "pending" as const,
                          progressMessage: "Upstream continuity timeout. Generating unlinked start frame.",
                        },
                      })));

                      // Actually generate frames for deferred scenes independently.
                      // The first pass deferred these because their continuity dependencies
                      // (e.g. previous scene's end_frame) were not yet available.  Now either
                      // those dependencies have been resolved by the first pass, or they
                      // truly cannot be satisfied — either way we must attempt generation
                      // rather than silently falling through to stale result.data which
                      // does NOT contain these deferred scenes' frames.
                      const deferredScenes = scenesToProcess.filter(
                        (s) => deferredSceneIds.includes(s.id),
                      );
                      if (deferredScenes.length > 0) {
                        try {
                          const fallbackResult = await agents.continuityAgent.generateSceneFramesBatch(
                            hydrateProject(project),
                            deferredScenes.map((scene) => hydrateEntity(scene, scene.assets)),
                            job.payload.assetKeys,
                            this.createSaveAssetsCallback(job, startTime),
                            this.createUpdateEntitiesCallback(job),
                            this.jobControlPlane.createIncrementAttemptHook(job),
                            { userId: job.userId, teamId: job.teamId },
                          );

                          if (fallbackResult?.data) {
                            // Merge independently-generated frames into the main result
                            // so the persistence block below saves them.
                            for (let i = 0; i < result.data.updatedScenes.length; i++) {
                              const merged = fallbackResult.data.updatedScenes.find(
                                (fs) => fs.id === result.data.updatedScenes[ i ].id,
                              );
                              if (merged) result.data.updatedScenes[ i ] = merged;
                            }
                            // Clear the deferred list since we've attempted the fallback.
                            result.data.deferredSceneIds = result.data.deferredSceneIds.filter(
                              (id) => !deferredSceneIds.includes(id),
                            );
                          }
                        } catch (fallbackError) {
                          console.error(
                            { error: fallbackError, jobId, projectId: job.projectId },
                            "Independent fallback for deferred scenes failed. Continuing with partial results.",
                          );
                        }
                      }
                    }
                  }

                  const { data, metadata } = result;
                  const nextStoryboard = storyboardManager.applyUpdates(project.storyboard, {
                    metadata: project.storyboard.metadata,
                    characters: project.characters, locations: project.locations,
                    scenes: data.updatedScenes,
                  });

                  await this.projectRepository.updateProject(job.projectId, {
                    scenes: data.updatedScenes,
                    storyboard: nextStoryboard,
                  });

                } catch (generateError: any) {
                  console.error({ error: generateError, jobId, projectId: job.projectId }, "Continuity batch execution failed.");
                  throw generateError;
                }
              } catch (caseError: any) {
                console.error({ error: caseError, jobId, projectId: job.projectId }, "Fatal error processing GENERATE_SCENE_FRAMES job.");
                throw caseError;
              }
              break;
            }

            case "GENERATE_SCENE_VIDEO": {
              try {
                const project = await this.projectRepository.getProjectFullState(job.projectId);
                const hydratedProject = hydrateProject(project);
                const hydratedScene = hydratedProject.scenes.find((s) => s.id === job.payload.sceneId);
                if (!hydratedScene) throw new Error(`Scene ${job.payload.sceneId} not found`);

                try {
                  const {
                    enhancedPrompt,
                    characterReferenceImages,
                    locationReferenceImages,
                    sceneCharacters,
                    location,
                    previousScene,
                    generationRules,
                    currentSceneStartReferenceImage,
                    currentSceneEndReferenceImage,
                  } = await agents.continuityAgent.prepareAndRefineSceneInputs(
                    hydratedScene,
                    hydratedProject,
                    job.payload.overridePrompt,
                    this.createSaveAssetsCallback(job, startTime),
                  );

                  const [version] = await agents.assetManager.getNextVersionNumber(
                    { projectId: job.projectId, sceneIds: [hydratedScene.id] },
                    ["scene_video"],
                  );

                  let { data, metadata } = await agents.sceneAgent.generateSceneWithQualityCheck({
                    scene: hydratedScene,
                    enhancedPrompt,
                    sceneCharacters: sceneCharacters,
                    sceneLocation: location,
                    previousScene,
                    version,
                    characterReferenceImages,
                    locationReferenceImages,
                    startFrame: currentSceneStartReferenceImage,
                    endFrame: currentSceneEndReferenceImage,
                    generateAudio: !project.metadata.hasAudio,
                    saveAssets: this.createSaveAssetsCallback(job, startTime),
                    sendEntityUpdate: this.createUpdateEntitiesCallback(job),
                    incrementAttempt: this.jobControlPlane.createIncrementAttemptHook(job),
                    generationRules,
                    uniqueId: job.id,
                  });

                  try {
                    const updatedProject = agents.continuityAgent.updateNarrativeState(data.scene, hydratedProject);

                    let generationRules = updatedProject.generationRules;
                    if (metadata.evaluation) {
                      generationRules = Array.from(
                        new Set([...updatedProject.generationRules, ...extractGenerationRules([metadata.evaluation])]),
                      );
                    }
                    const forceRegenerateIndex = hydratedProject.forceRegenerateSceneIds.findIndex(
                      (id) => id === hydratedScene.id,
                    );
                    const forceRegenerateSceneIds = hydratedProject.forceRegenerateSceneIds
                      .slice(0, forceRegenerateIndex)
                      .concat(hydratedProject.forceRegenerateSceneIds.slice(forceRegenerateIndex + 1));

                    const nextStoryboard = storyboardManager.applyUpdates(project.storyboard, {
                      metadata: project.storyboard.metadata,
                      characters: updatedProject.characters, // narrative state updated
                      locations: updatedProject.locations,
                      scenes: updatedProject.scenes,
                    });

                    updated = await this.projectRepository.updateProject(job.projectId, {
                      characters: updatedProject.characters,
                      locations: updatedProject.locations,
                      scenes: updatedProject.scenes,
                      generationRules,
                      forceRegenerateSceneIds,
                      storyboard: nextStoryboard, // [+]
                    });

                    if (job.payload.renderInProgress !== false) {
                      try {
                        const fullProject = await this.projectRepository.getProjectFullState(job.projectId);
                        const scenes = fullProject.scenes || [];
                        const videoPaths = scenes
                          .map((s) => {
                            const sceneAssets = getAllBestAssets(s.assets);
                            return sceneAssets["scene_video"]?.data;
                          })
                          .filter((uri): uri is string => !!uri);

                        if (videoPaths.length > 0) {
                          const renderJob: any = {
                            ...job,
                            type: "RENDER_VIDEO",
                            payload: {
                              videoPaths,
                              audioGcsUri: fullProject.metadata.audioGcsUri,
                            },
                          };
                          const { videoGcsUri, thumbnailGcsUri, duration } =
                            await agents.mediaProcessingAgent.renderVideo(renderJob, fullProject.metadata.title);

                          await this.createSaveAssetsCallback(job, startTime)(
                            { projectId: job.projectId },
                            ["render_video"],
                            "video",
                            [videoGcsUri],
                            [{ model: this.videoModel.model, duration }],
                          );
                          await this.createSaveAssetsCallback(job, startTime)(
                            { projectId: job.projectId },
                            ["thumbnail"],
                            "image",
                            [thumbnailGcsUri],
                            [{ model: this.videoModel.model }],
                          );

                          updated = await this.projectRepository.getProjectFullState(job.projectId);
                        }
                      } catch (renderError) {
                        console.warn("Inline video render failed (non-blocking)", renderError);
                      }
                    }
                  } catch (updateError: any) {
                    console.error(
                      {
                        error: updateError,
                        jobType: job.type,
                        jobId,
                        projectId: job.projectId,
                      },
                      "Failed to update project",
                    );
                    throw updateError;
                  }
                } catch (generateError: any) {
                  console.error(
                    {
                      error: generateError,
                      jobType: job.type,
                      jobId,
                      projectId: job.projectId,
                    },
                    "Failed to generate scene video",
                  );
                  throw generateError;
                }
              } catch (caseError: any) {
                console.error(
                  {
                    error: caseError,
                    jobType: job.type,
                    jobId,
                    projectId: job.projectId,
                  },
                  "Job case failed",
                );
                throw caseError;
              }
              break;
            }

            case "RENDER_VIDEO": {
              try {
                let project = await this.projectRepository.getProject(job.projectId);
                if (!project) throw new Error("No project available.");

                try {
                  const { videoGcsUri, thumbnailGcsUri, duration } = await agents.mediaProcessingAgent.renderVideo(
                    job,
                    project.metadata.title,
                  );

                  try {
                    await this.createSaveAssetsCallback(job, startTime)(
                      { projectId: job.projectId },
                      ["render_video"],
                      "video",
                      [videoGcsUri],
                      [{ model: this.videoModel.model, duration }],
                    );
                    await this.createSaveAssetsCallback(job, startTime)(
                      { projectId: job.projectId },
                      ["thumbnail"],
                      "image",
                      [thumbnailGcsUri],
                      [{ model: this.videoModel.model }],
                    );

                    updated = await this.projectRepository.getProjectFullState(job.projectId);
                  } catch (updateError: any) {
                    console.error(
                      {
                        error: updateError,
                        jobType: job.type,
                        jobId,
                        projectId: job.projectId,
                      },
                      "Failed to finalize video render",
                    );
                    throw updateError;
                  }
                } catch (renderError: any) {
                  console.error(
                    {
                      error: renderError,
                      jobType: job.type,
                      jobId,
                      projectId: job.projectId,
                    },
                    "Failed to stitch scenes",
                  );
                  throw renderError;
                }
              } catch (caseError: any) {
                console.error(
                  {
                    error: caseError,
                    jobType: job.type,
                    jobId,
                    projectId: job.projectId,
                  },
                  "Job case failed",
                );
                throw caseError;
              }
              break;
            }

            case "CREATE_SCENES_WITH_ENTITIES": {
              const { sceneFields, startFrameGcsUri, startFrameMimeType, endFrameGcsUri, endFrameMimeType, mode, sceneIds } =
                job.payload;

              const traceId = `CREATE_SCENES_WITH_ENTITIES_${job.projectId}_${startTime}`;

              const saveAssets = this.createSaveAssetsCallback(job, startTime);

              // ── Step 0: Fetch all existing entities up-front ───────────────────────
              const project = await this.projectRepository.getProjectFullState(job.projectId);

              const [existingChars, existingLocs, existingScenes] = [
                project.characters,
                project.locations,
                project.scenes,
              ];

              const htmlCharacters = (sceneFields.characterReferenceIds || []).join(", ");
              const htmlLocation = sceneFields.locationReferenceId || "";

              // ── Partition scene fields into handles and plain text ─────────────────
              const [resultCharsParsed, resultLocParsed] = await Promise.all([
                this.kbService.extractAndResolveMentions({
                  htmlInput: htmlCharacters,
                  projectId: job.projectId,
                  userId: job.userId,
                }),

                this.kbService.extractAndResolveMentions({
                  htmlInput: htmlLocation,
                  projectId: job.projectId,
                  userId: job.userId,
                }),
              ]);

              const charHandles = resultCharsParsed.handlesResolved;
              const charPlainText = resultCharsParsed.textPlain;

              const locationHandle = resultLocParsed.handlesResolved[0] ?? null;
              const locationPlainText = resultLocParsed.textPlain;

              // Resolve @handles against existing project entities
              const resolvedExistingCharacters = existingChars.filter((c) => charHandles.includes(c.referenceId));
              const resolvedExistingLocation = locationHandle
                ? (existingLocs.find((l) => l.referenceId === locationHandle) ?? null)
                : null;

              const toolContext: ToolContext<TextModelController> & {
                projectRepository: ProjectRepository;
                incrementAttempt: IncrementAttemptHook;
              } = {
                provider: this.textModel,
                safetyRetries: this.getAgents(job.projectId).qualityAgent.qualityConfig.safetyRetries,
                storageManager: this.getAgents(job.projectId).storageManager,
                console,
                traceId,
                userId: job.userId,
                teamId: job.teamId,
                worldId: job.worldId,
                projectId: job.projectId,
                projectRepository: this.projectRepository,
                incrementAttempt: this.jobControlPlane.createIncrementAttemptHook(job),
              };

              // ── Pass 1: Parse plain-text descriptions → partial attrs (all types) ─
              // Single LLM call extracts characters, locations, and props from the
              // combined plain-text input. Skipped entirely when there is no
              // substantive text beyond @handle mentions.
              const combinedPlainText = [charPlainText, locationPlainText].filter(Boolean).join("\n\n");

              const {
                characters: charactersAttributes,
                locations: locationsAttributes,
                props: propsAttributes,
              } = needsEntityTextParsing(combinedPlainText)
                  ? await createParseEntitiesTool({ context: toolContext }).run({ input: combinedPlainText })
                  : { characters: [], locations: [], props: [] };

              // ── Filter & Normalize ───────────────────────────────────────────
              const validCharacters: CharacterAttributes[] = (charactersAttributes ?? []).filter(
                (char): char is CharacterAttributes => Boolean(char) && Object.keys(char).length > 0,
              );
              const validLocations: LocationAttributes[] = (locationsAttributes ?? []).filter(
                (loc): loc is LocationAttributes => Boolean(loc),
              );
              const validProps: PropAttributes[] = (propsAttributes ?? []).filter(
                (prop): prop is PropAttributes => Boolean(prop) && Object.keys(prop).length > 0,
              );

              console.log(
                {
                  projectId: job.projectId,
                  characters: validCharacters.length,
                  locations: validLocations.length,
                  props: validProps.length,
                },
                `[CSWE] Entities parsed from plain-text descriptions.`,
              );

              // ── Type-Safe Mapping ────────────────────────────────────────────
              const toInsertCharacters: InsertCharacter[] = validCharacters.map((attrChar) =>
                mapDomainCharacterToInsertCharacter({ ...attrChar, projectId: job.projectId }),
              );
              const toInsertLocations: InsertLocation[] = validLocations.map((attrLoc) =>
                mapDomainLocationToInsertLocation({ ...attrLoc, projectId: job.projectId }),
              );
              const toInsertProps: InsertProp[] = validProps.map((attrProp) =>
                mapDomainPropToInsertProp({ ...attrProp, projectId: job.projectId }),
              );

              await Promise.all([
                toInsertCharacters.length > 0
                  ? this.projectRepository.createCharacters(job.projectId, toInsertCharacters)
                  : Promise.resolve(),
                toInsertLocations.length > 0
                  ? this.projectRepository.createLocations(job.projectId, toInsertLocations)
                  : Promise.resolve(),
                toInsertProps.length > 0
                  ? this.projectRepository.createProps(job.projectId, toInsertProps)
                  : Promise.resolve(),
              ]);

              const characterIds = toInsertCharacters.map((c) => c.id);
              const locationIds = toInsertLocations.map((l) => l.id);
              const propIds = toInsertProps.map((p) => p.id);

              // Save entity description assets
              const saveAssetCalls: Promise<void>[] = [];
              if (characterIds.length > 0) {
                const characterDescriptions = validCharacters.map((c) => c.description);
                saveAssetCalls.push(
                  saveAssets(
                    { projectId: job.projectId, characterIds },
                    ["description"],
                    "text",
                    characterDescriptions,
                    [{ model: this.textModel.textModel }],
                  ),
                );
              }
              if (locationIds.length > 0) {
                const locationDescriptions = validLocations.map((l) => l.description);
                saveAssetCalls.push(
                  saveAssets({ projectId: job.projectId, locationIds }, ["description"], "text", locationDescriptions, [
                    { model: this.textModel.textModel },
                  ]),
                );
              }
              if (propIds.length > 0) {
                const propDescriptions = validProps.map((p) => p.description);
                saveAssetCalls.push(
                  saveAssets({ projectId: job.projectId, propIds }, ["description"], "text", propDescriptions, [
                    { model: this.textModel.textModel },
                  ]),
                );
              }
              await Promise.all(saveAssetCalls);

              // ── Refetch to get newly saved assets ────────────────────────────
              const [insertedCharactersUnsorted, insertedLocationsUnsorted, insertedPropsUnsorted] = await Promise.all([
                characterIds.length > 0 ? this.projectRepository.getCharactersByIds(characterIds) : Promise.resolve([]),
                locationIds.length > 0 ? this.projectRepository.getLocationsByIds(locationIds) : Promise.resolve([]),
                propIds.length > 0 ? this.projectRepository.getPropsByIds(propIds) : Promise.resolve([]),
              ]);

              // ── Register handles ─────────────────────────────────────────────
              for (const character of insertedCharactersUnsorted) {
                if (!character.name) {
                  throw new Error("Entity name is required for handle registration.");
                }
                try {
                  await tagRegistryService.registerHandle({
                    handle: `@${character.name.replace(/[^a-zA-Z0-9_]/g, "")}`,
                    entityId: character.id,
                    entityType: "character",
                    projectId: job.projectId,
                  });
                } catch (errRegisterHandle) {
                  console.warn(
                    { entityId: character.id, error: errRegisterHandle },
                    "[Worker] Failed to register character handle.",
                  );
                }
              }

              for (const location of insertedLocationsUnsorted) {
                if (!location.name) {
                  throw new Error("Entity name is required for handle registration.");
                }
                try {
                  await tagRegistryService.registerHandle({
                    handle: `@${location.name.replace(/[^a-zA-Z0-9_]/g, "")}`,
                    entityId: location.id,
                    entityType: "location",
                    projectId: job.projectId,
                  });
                } catch (errRegisterHandle) {
                  console.warn(
                    { entityId: location.id, error: errRegisterHandle },
                    "[Worker] Failed to register location handle.",
                  );
                }
              }

              for (const prop of insertedPropsUnsorted) {
                if (!prop.name) {
                  throw new Error("Entity name is required for handle registration.");
                }
                try {
                  await tagRegistryService.registerHandle({
                    handle: `@${prop.name.replace(/[^a-zA-Z0-9_]/g, "")}`,
                    entityId: prop.id,
                    entityType: "prop",
                    projectId: job.projectId,
                  });
                } catch (errRegisterHandle) {
                  console.warn(
                    { entityId: prop.id, error: errRegisterHandle },
                    "[Worker] Failed to register prop handle.",
                  );
                }
              }

              const [insertedCharacters, insertedLocations, _insertedProps] = await Promise.all([
                Promise.all(characterIds.map((id) => insertedCharactersUnsorted.find((c) => c.id === id)!)),
                Promise.all(locationIds.map((id) => insertedLocationsUnsorted.find((l) => l.id === id)!)),
                Promise.all(propIds.map((id) => insertedPropsUnsorted.find((p) => p.id === id)!)),
              ]);

              const nextCharacterVersions = await this.getAgents(job.projectId).assetManager.getNextVersionNumber(
                {
                  projectId: job.projectId,
                  characterIds,
                },
                ["character_image"],
              );

              const charactersWithVersion: (Character & { version: number })[] = insertedCharacters.map((c, cIdx) => ({
                ...hydrateEntity(c, c.assets),
                version: nextCharacterVersions[cIdx],
              }));

              const nextLocationVersions = await this.getAgents(job.projectId).assetManager.getNextVersionNumber(
                {
                  projectId: job.projectId,
                  locationIds,
                },
                ["location_image"],
              );

              const locationsWithVersion: (Location & { version: number })[] = insertedLocations.map((l, lIdx) => ({
                ...hydrateEntity(l, l.assets),
                version: nextLocationVersions[lIdx],
              }));

              const sceneLocation = resolvedExistingLocation ?? insertedLocations[0];
              const sceneIndex = existingScenes.length;

              // Generate all images + scene attributes in parallel
              const [generatedCharacterImagesResults, generatedLocationImageResult, sceneAttributesResults] =
                await Promise.all([
                  createGenerateCharacterImagesTool({ context: toolContext }).run({
                    characters: charactersWithVersion,
                    generationRules: project.generationRules,
                    attempt: job.attempts.currentAttempt,
                  }),

                  createGenerateLocationImagesTool({ context: toolContext }).run({
                    locations: locationsWithVersion,
                    generationRules: project.generationRules,
                    attempt: job.attempts.currentAttempt,
                  }),

                  createGenerateSceneAttributesTool({ context: toolContext }).run([
                    {
                      ...sceneFields,
                      sceneIndex,
                      id: sceneFields.id,
                      // characters: [
                      //   ...resolvedExistingCharacters.map((c) => hydrateEntity(c, c.assets)),
                      //   ...insertedCharacters,
                      // ].map((c) => CharacterAttributes.parse(c)),
                      // location: LocationAttributes.parse(hydrateEntity(sceneLocation, sceneLocation.assets)),
                      images: [
                        ...(startFrameGcsUri && startFrameMimeType
                          ? [
                            {
                              gcsUri: startFrameGcsUri,
                              publicUri: startFrameGcsUri,
                              mimeType: startFrameMimeType,
                            },
                          ]
                          : []),
                        ...(endFrameGcsUri && endFrameMimeType
                          ? [
                            {
                              gcsUri: endFrameGcsUri,
                              publicUri: endFrameGcsUri,
                              mimeType: endFrameMimeType,
                            },
                          ]
                          : []),
                      ],
                    },
                  ],
                  ),
                ]);

              const [characterImageUris, characterImageMetadatas] = generatedCharacterImagesResults
                .filter((r) => r.success)
                .reduce(
                  (acc, r) => {
                    acc[0].push(r.output);
                    acc[1].push(r.metadata);
                    return acc;
                  },
                  [[], []] as [
                    GenerateCharacterImagesResultSuccess["output"][],
                    GenerateCharacterImagesResultSuccess["metadata"][],
                  ],
                );

              // Save character images
              await saveAssets(
                { projectId: job.projectId, characterIds },
                ["character_image"],
                "image",
                characterImageUris,
                characterImageMetadatas,
              );

              const [locationImageUris, locationImageMetadatas] = generatedLocationImageResult
                .filter((r) => r.success)
                .reduce(
                  (acc, r) => {
                    acc[0].push(r.output);
                    acc[1].push(r.metadata);
                    return acc;
                  },
                  [[], []] as [
                    GenerateLocationImagesResultSuccess["output"][],
                    GenerateLocationImagesResultSuccess["metadata"][],
                  ],
                );

              // Save location images
              await saveAssets(
                { projectId: job.projectId, locationIds },
                ["location_image"],
                "image",
                locationImageUris,
                locationImageMetadatas,
              );

              // Insert scene
              const sceneAttributesList = sceneAttributesResults.filter((r) => r.success).map((r) => ({ ...r.attributes, id: r.id })); // existing id is kept here. important!
              const allSceneCharacters = [...resolvedExistingCharacters, ...insertedCharacters];
              const characterReferenceIds = allSceneCharacters.map((c) => c.referenceId);

              // DANGEROUS: sceneAttributesList type is cast by the tool, it may not be accurate. Assume it has 'id' prop.
              // TODO: fix sceneattributes property preservation and validation.

              const toInsertScenes: InsertScene[] = sceneAttributesList.map((sceneAttributes) => {
                return mapDomainSceneToInsertScene({
                  ...sceneAttributes,
                  projectId: job.projectId,
                  sceneIndex,
                  locationId: sceneLocation.id,
                  locationReferenceId: sceneLocation.referenceId,
                  characterReferenceIds,
                });
              });

              const [insertedScene] = await this.projectRepository.createScenes(job.projectId, toInsertScenes);

              // Save scene description asset
              await saveAssets(
                { projectId: job.projectId, sceneIds: [toInsertScenes[0].id] },
                ["description"],
                "text",
                [sceneAttributesList[0].description],
                [{ model: this.textModel.textModel }],
              );

              // Save user-provided scene frames if present in the job payload
              await Promise.all([
                startFrameGcsUri &&
                saveAssets(
                  { projectId: job.projectId, sceneIds: [toInsertScenes[0].id] },
                  ["scene_start_frame"],
                  "image",
                  [startFrameGcsUri],
                  [{ model: "user-upload" }],
                ),
                endFrameGcsUri &&
                saveAssets(
                  { projectId: job.projectId, sceneIds: [toInsertScenes[0].id] },
                  ["scene_end_frame"],
                  "image",
                  [endFrameGcsUri],
                  [{ model: "user-upload" }],
                ),
              ]);

              // refetch with assets
              const [scene] = await this.projectRepository.getScenesByIds([toInsertScenes[0].id]);

              // Emit batch ENTITY_CREATED event
              await this.publishPipelineEvent({
                type: "ENTITY_CREATED",
                projectId: job.projectId,
                worldId: job.worldId,
                userId: job.userId,
                teamId: job.teamId,
                payload: [
                  ...insertedCharacters.map((c) => ({
                    entityId: c.id,
                    entityType: "character" as const,
                    entity: c,
                  })),
                  ...(sceneLocation
                    ? [
                      {
                        entityId: sceneLocation.id,
                        entityType: "location" as const,
                        entity: sceneLocation,
                      },
                    ]
                    : []),
                  {
                    entityId: scene.id,
                    entityType: "scene" as const,
                    entity: scene,
                  },
                ],
                timestamp: new Date().toISOString(),
              });

              updated = await this.projectRepository.getProjectFullState(job.projectId);

              // [+] Pattern B: post-read. All description assets were saved above and are
              // [+] now present on updated.characters / locations / scenes.
              const nextStoryboard = storyboardManager.applyUpdates(updated.storyboard, {
                metadata: updated.storyboard.metadata,
                characters: updated.characters,
                locations: updated.locations,
                scenes: updated.scenes,
              });
              await this.projectRepository.updateProject(job.projectId, {
                storyboard: nextStoryboard,
              });

              updated = { ...updated, storyboard: nextStoryboard };

              break;
            }

            case "GENERATE_CHARACTERS": {
              const { projectId, payload: charactersData } = job;

              const traceId = `generate-characters-${job.id}-${startTime}`;

              const toolContext: ToolContext<TextModelController> & {
                projectRepository: ProjectRepository;
                tagRegistry: TagRegistryService;
              } = {
                provider: this.textModel,
                safetyRetries: this.getAgents(job.projectId).qualityAgent.qualityConfig.safetyRetries,
                storageManager: this.getAgents(job.projectId).storageManager,
                console,
                traceId,
                userId: job.userId,
                teamId: job.teamId,
                worldId: job.worldId,
                projectId: job.projectId,
                projectRepository: this.projectRepository,
                tagRegistry: tagRegistryService,
              };

              const characterAttributesResults = await createGenerateCharacterAttributesTool({
                context: toolContext,
              }).run(charactersData);
              const characterAttributesSuccess = characterAttributesResults
                .filter((c) => c.success)
                .map((c) => ({ ...c.attributes, id: c.id, projectId: job.projectId }));
              const insertedCharacters = await createInsertCharactersTool({
                context: toolContext,
              }).run({ characters: characterAttributesSuccess });

              for (const character of insertedCharacters) {
                if (!character.name) {
                  throw new Error("Entity name is required for handle registration.");
                }
                try {
                  await tagRegistryService.registerHandle({
                    handle: `@${character.name.replace(/[^a-zA-Z0-9_]/g, "")}`,
                    entityId: character.id,
                    entityType: "character",
                    projectId: job.projectId,
                  });
                } catch (errRegisterHandle) {
                  console.warn(
                    { entityId: character.id, error: errRegisterHandle },
                    "[Worker] Failed to register character handle.",
                  );
                }
              }

              await this.publishPipelineEvent({
                type: "ENTITY_CREATED",
                projectId: job.projectId,
                worldId: job.worldId,
                userId: job.userId,
                teamId: job.teamId,
                payload: insertedCharacters.map((c) => ({
                  entityId: c.id,
                  entityType: "character" as const,
                  entity: c,
                })),
                timestamp: new Date().toISOString(),
              });

              updated = await this.projectRepository.getProjectFullState(job.projectId);

              const nextStoryboard = storyboardManager.applyUpdates(updated.storyboard, {
                metadata: updated.storyboard.metadata,
                characters: updated.characters,
                locations: updated.locations,
                scenes: updated.scenes,
              });
              await this.projectRepository.updateProject(job.projectId, {
                storyboard: nextStoryboard,
              });
              updated = { ...updated, storyboard: nextStoryboard };

              break;
            }
            case "GENERATE_LOCATIONS": {
              const { projectId, payload: locationsData } = job;

              const traceId = `generate-locations-${job.id}-${startTime}`;

              const toolContext: ToolContext<TextModelController> & {
                projectRepository: ProjectRepository;
                tagRegistry: TagRegistryService;
              } = {
                provider: this.textModel,
                safetyRetries: this.getAgents(job.projectId).qualityAgent.qualityConfig.safetyRetries,
                storageManager: this.getAgents(job.projectId).storageManager,
                console,
                traceId,
                userId: job.userId,
                teamId: job.teamId,
                worldId: job.worldId,
                projectId: job.projectId,
                projectRepository: this.projectRepository,
                tagRegistry: tagRegistryService,
              };

              const locationAttributes = await createGenerateLocationAttributesTool({
                context: toolContext,
              }).run(locationsData);
              const locationAttributesSuccess = locationAttributes
                .filter((c) => c.success)
                .map((c) => ({ ...c.attributes, id: c.id, projectId: job.projectId }));
              const insertedLocations = await createInsertLocationsTool({
                context: toolContext,
              }).run({ locations: locationAttributesSuccess });

              for (const location of insertedLocations) {
                if (!location.name) {
                  throw new Error("Entity name is required for handle registration.");
                }
                try {
                  await tagRegistryService.registerHandle({
                    handle: `@${location.name.replace(/[^a-zA-Z0-9_]/g, "")}`,
                    entityId: location.id,
                    entityType: "location",
                    projectId: job.projectId,
                  });
                } catch (errRegisterHandle) {
                  console.warn(
                    { entityId: location.id, error: errRegisterHandle },
                    "[Worker] Failed to register location handle.",
                  );
                }
              }

              await this.publishPipelineEvent({
                type: "ENTITY_CREATED",
                projectId: job.projectId,
                worldId: job.worldId,
                userId: job.userId,
                teamId: job.teamId,
                payload: insertedLocations.map((l) => ({
                  entityId: l.id,
                  entityType: "location" as const,
                  entity: l,
                })),
                timestamp: new Date().toISOString(),
              });

              updated = await this.projectRepository.getProjectFullState(job.projectId);

              const nextStoryboard = storyboardManager.applyUpdates(updated.storyboard, {
                metadata: updated.storyboard.metadata,
                characters: updated.characters,
                locations: updated.locations,
                scenes: updated.scenes,
              });
              await this.projectRepository.updateProject(job.projectId, {
                storyboard: nextStoryboard,
              });
              updated = { ...updated, storyboard: nextStoryboard };

              break;
            }
            case "GENERATE_ENTITIES": {
              const { projectId } = job;
              const project = await this.projectRepository.getProjectFullState(job.projectId);

              const rawEntities = normalizeGenerateEntitiesPayload(job.payload);

              const traceId = `generate-entities-${job.id}`;

              const toolContext: ToolContext<TextModelController> & {
                projectRepository: ProjectRepository;
                incrementAttempt: IncrementAttemptHook;
                tagRegistry: TagRegistryService;
                saveAssets: SaveAssetsCallback;
              } = {
                provider: this.textModel,
                safetyRetries: this.getAgents(job.projectId).qualityAgent.qualityConfig.safetyRetries,
                storageManager: this.getAgents(job.projectId).storageManager,
                console,
                traceId,
                userId: job.userId,
                teamId: job.teamId,
                worldId: job.worldId,
                projectId: job.projectId,
                projectRepository: this.projectRepository,
                incrementAttempt: this.jobControlPlane.createIncrementAttemptHook(job),
                saveAssets: this.createSaveAssetsCallback(job, startTime),
                tagRegistry: tagRegistryService,
              };

              const groupedEntities = groupEntitiesByEntityPrimitiveType(rawEntities);

              type GenerateEntityEnvelope = GenerateCharacterEntity | GenerateLocationEntity | GeneratePropEntity;

              const createEntitiesResults: GenerateEntityEnvelope[] = (
                await Promise.all(
                  Object.entries(groupedEntities).map(async ([type, entities]) => {
                    const entityType = type as EntityPrimitiveType;
                    if (!entities?.length) return [];

                    if (entityType === "character") {
                      const typedEntities = entities as GenerateCharacterEntity[];
                      const characters = typedEntities.map((e) => ({
                        ...e.data,
                        images: e.images,
                      }));

                      const characterAttributesResults = await createGenerateCharactersPipelineTool({
                        context: toolContext,
                        attributesTool: createGenerateCharacterAttributesTool({ context: toolContext }),
                        imagesTool: createGenerateCharacterImagesTool({ context: toolContext }),
                        insertCharacters: (characters) =>
                          createInsertCharactersTool({ context: toolContext }).run({ characters }),
                      }).run({
                        characters,
                        generationRules: project.generationRules,
                        attempt: job.attempts.currentAttempt,
                      });

                      // --- 🔍 DEBUG VISIBILITY: GENERATE CHARACTERS ---
                      const charFailures = characterAttributesResults.filter((r) => r.success === false);
                      if (charFailures.length > 0) {
                        console.error(`[Tool Error] Generate characters returned errors:`, charFailures);
                      }

                      return characterAttributesResults
                        .filter((r) => r.success === true)
                        .map((r, i) => ({ r, origin: typedEntities[i] }))
                        .map(({ r, origin }) => ({
                          entityType: "character" as const,
                          data: { ...r.entity, id: origin.data.id },
                          images: origin.images,
                        }));
                    }

                    if (entityType === "location") {
                      const typedEntities = entities as GenerateLocationEntity[];
                      const locations = typedEntities.map((e) => ({
                        ...e.data,
                        images: e.images,
                      }));
                      const locationAttributesResults = await createGenerateLocationsPipelineTool({
                        context: toolContext,
                        attributesTool: createGenerateLocationAttributesTool({ context: toolContext }),
                        imagesTool: createGenerateLocationImagesTool({ context: toolContext }),
                        insertLocations: (locations) =>
                          createInsertLocationsTool({ context: toolContext }).run({ locations }),
                      }).run({
                        locations,
                        generationRules: project.generationRules,
                        attempt: job.attempts.currentAttempt,
                      });

                      const locFailures = locationAttributesResults.filter((r) => r.success === false);
                      if (locFailures.length > 0) {
                        console.error(`[Tool Error] Generate locations returned errors:`, locFailures);
                      }

                      return locationAttributesResults
                        .filter((r) => r.success)
                        .map((r, i) => ({ r, origin: typedEntities[i] }))
                        .map(({ r, origin }) => ({
                          entityType: "location" as const,
                          data: { ...r.location, id: origin.data.id },
                          images: origin.images,
                        }));
                    }

                    if (entityType === "prop") {
                      const typedEntities = entities as GeneratePropEntity[];
                      const props = typedEntities.map((e) => ({
                        ...e.data,
                        images: e.images,
                      }));
                      const propAttributesResults = await createGeneratePropsPipelineTool({
                        context: toolContext,
                        attributesTool: createGeneratePropAttributesTool({ context: toolContext }),
                        imagesTool: createGeneratePropImagesTool({ context: toolContext }),
                        insertProps: (props) => createInsertPropsTool({ context: toolContext }).run({ props }),
                      }).run({ props, generationRules: project.generationRules, attempt: job.attempts.currentAttempt });

                      const propFailures = propAttributesResults.filter((r) => r.success === false);
                      if (propFailures.length > 0) {
                        console.error(`[Tool Error] Generate props returned errors:`, propFailures);
                      }

                      return propAttributesResults
                        .filter((r) => r.success)
                        .map((r, i) => ({ r, origin: typedEntities[i] }))
                        .map(({ r, origin }) => ({
                          entityType: "prop" as const,
                          data: { ...r.entity, id: origin.data.id },
                          images: origin.images,
                        }));
                    }

                    if (entityType === "scene") {
                      console.warn(
                        "Scene generation not supported in this endpoint. Use the scene generation endpoint.",
                      );
                    }

                    return [];
                  }),
                )
              ).flat();

              // ↕ use createEntitiesResults here before insert (asset args, logging, etc.)

              // ── Phase 2: insert — re-dispatch by entityType, which is preserved on each envelope ──
              // const insertEntitiesResults = (
              //   await Promise.all(
              //     (["character", "location", "prop"] as const).map(async (entityType) => {
              //       if (entityType === "character") {
              //         const charactersGenerated = createEntitiesResults
              //           .filter((e) => e.entityType === "character")
              //           .map((e: any) => ({ ...e.data, projectId }));
              //         if (!charactersGenerated.length) return [];

              //         const insertResults = await createInsertCharactersTool({
              //           context: toolContext,
              //         }).run({ characters: charactersGenerated });

              //         const insertFailures = insertResults.filter((r: any) => r.success === false);
              //         if (insertFailures.length > 0) {
              //           console.error(`[Tool Error] Insert characters returned errors:`, insertFailures);
              //         }

              //         return insertResults;
              //       }

              //       if (entityType === "location") {
              //         const locationsGenerated = createEntitiesResults
              //           .filter((e) => e.entityType === "location")
              //           .map((e: any) => ({ ...e.data, projectId }));
              //         if (!locationsGenerated.length) return [];

              //         const insertResults = await createInsertLocationsTool({
              //           context: toolContext,
              //         }).run({ locations: locationsGenerated });

              //         const insertFailures = insertResults.filter((r: any) => r.success === false);
              //         if (insertFailures.length > 0) {
              //           console.error(`[Tool Error] Insert locations returned errors:`, insertFailures);
              //         }

              //         return insertResults;
              //       }
              //       if (entityType === "prop") {
              //         const propsGenerated = createEntitiesResults
              //           .filter((e) => e.entityType === "prop")
              //           .map((e: any) => ({ ...e.data, projectId }));
              //         if (!propsGenerated.length) return [];

              //         const insertResults = await createInsertPropsTool({
              //           context: toolContext,
              //         }).run({ props: propsGenerated });

              //         const insertFailures = insertResults.filter((r: any) => r.success === false);
              //         if (insertFailures.length > 0) {
              //           console.error(`[Tool Error] Insert props returned errors:`, insertFailures);
              //         }

              //         return insertResults;
              //       }

              //       const _exhaustive: never = entityType; // ← compile error if a case is ever missing
              //       throw new Error(`Unhandled entity type: ${_exhaustive}`);
              //     }),
              //   )
              // ).flat();

              // const createAndInsertEntitiesResults = await Promise.all(
              //   Object.entries(groupedEntities).map(async ([type, entities]) => {
              //     const entityType = type as EntityPrimitiveType;

              //     if (!entities || entities.length === 0) return [];

              //     if (entityType === "character") {
              //       const characterInputs = (entities as GenerateCharacterEntity[]).map(
              //         (entity) => ({
              //           ...entity.data,
              //           images: entity.images,
              //         }),
              //       );

              //       const characterAttributesResults = await createGenerateCharacterAttributesTool(
              //         { context: toolContext },
              //       ).run(characterInputs);
              //       const success = characterAttributesResults
              //         .filter((c) => c.success)
              //         .map((c) => ({ ...c.output, projectId }));
              //       return createInsertCharactersTool({ context: toolContext }).run(
              //         success,
              //       );
              //     }

              //     if (entityType === "location") {
              //       const locationInputs = (entities as GenerateLocationEntity[]).map(
              //         (entity) => ({
              //           ...entity.data,
              //           images: entity.images,
              //         }),
              //       );
              //       const locationAttributesResults = await createGenerateLocationAttributesTool({
              //         context: toolContext,
              //       }).run(locationInputs);
              //       const success = locationAttributesResults
              //         .filter((l) => l.success)
              //         .map((l) => ({ ...l.output, projectId }));
              //       return createInsertLocationsTool({ context: toolContext }).run(
              //         success,
              //       );
              //     }

              //     if (entityType === "prop") {
              //       const propInputs = (entities as GeneratePropEntity[]).map(
              //         (entity) => ({
              //           ...entity.data,
              //           images: entity.images,
              //         }),
              //       );
              //       const propAttributesResults = await createGeneratePropAttributesTool({
              //         context: toolContext,
              //       }).run(propInputs);
              //       const success = propAttributesResults
              //         .filter((l) => l.success)
              //         .map((l) => ({ ...l.output, projectId }));
              //       return createInsertPropsTool({ context: toolContext }).run(success);
              //     }

              //     if (entityType === "scene") {
              //       console.warn(
              //         "Scene generation not supported in this endpoint. Use the scene generation endpoint.",
              //       );
              //     }

              //     return [];
              //   }),
              // );

              // insertedEntities.push(...createAndInsertEntitiesResults.flat());

              // await Promise.all([
              // Desription asset creation
              // ...Object.entries(groupEntitiesByEntityPrimitiveType(createEntitiesResults)).map(
              //   async ([type, entities]) => {
              //     const entityType = type as EntityPrimitiveType;
              //     if (!entities?.length) return;

              //     const operations = buildEntityCreatableAssetDescriptionArgs(entityType, entities, projectId);

              //     const assetResults =
              //       await this.getAgents(projectId).assetManager.batchCreateVersionedAssets(operations);

              //     // --- 🔍 DEBUG VISIBILITY: DESCRIPTION ASSETS ---
              //     if (assetResults?.errors?.length > 0) {
              //       console.error(`[Asset Error] Description assets for ${entityType} failed:`, assetResults.errors);
              //     }

              //     return assetResults;
              //   },
              // ),

              // // Image asset creation: one batchCreateVersionedAssets call per entity type
              // ...Object.entries(groupedEntities).map(async ([type, entities]) => {
              //   const entityType = type as EntityPrimitiveType;
              //   if (!entities?.length) return;

              //   const operations = buildEntityCreatableAssetImageArgs(
              //     entityType,
              //     entities as InsertEntitiesInput,
              //     projectId,
              //   );

              //   const assetResults =
              //     await this.getAgents(projectId).assetManager.batchCreateVersionedAssets(operations);

              //   if (assetResults?.errors?.length > 0) {
              //     console.error(`[Asset Error] Image assets for ${entityType} failed:`, assetResults.errors);
              //   }

              //   return assetResults;
              // }),

              // Handle registration: all inserted entities in parallel
              //   Promise.all(
              //     insertEntitiesResults.map(async (entity) => {
              //       const rawEntity = rawEntities.find((e) => e.data.id === entity.id);
              //       if (!rawEntity) throw new Error("Entity not found in raw entities.");
              //       if (!entity.name) throw new Error("Entity name is required for handle registration.");

              //       await tagRegistryService
              //         .registerHandle({
              //           handle: `@${entity.name.replace(/[^a-zA-Z0-9_]/g, "")}`,
              //           entityId: entity.id,
              //           entityType: rawEntity.entityType as "character" | "location" | "prop",
              //           projectId,
              //         })
              //         .catch((err) => {
              //           console.warn({ entityId: entity.id, error: err }, "[Worker] Failed to register entity handle.");
              //         });
              //     }),
              //   ),
              // ]);

              // const insertedEntityEnvelopes = insertEntitiesResults.map((inserted) => {
              //   const rawEntity = rawEntities.find((e) => e.data.id === inserted.id);
              //   if (!rawEntity) throw new Error("Entity not found in raw entities.");

              //   if (rawEntity.entityType === "file") return;

              //   if (!inserted.name) throw new Error("Entity name is required for handle registration.");
              //   return {
              //     entityId: inserted.id,
              //     entityType: rawEntity.entityType,
              //     entity: inserted,
              //   };
              // });

              // const [updatedEntities] = await Promise.all([
              //   await this.projectRepository.getEntities(insertedEntityEnvelopes as any),
              // ]);

              // await this.publishPipelineEvent({
              //   type: "ENTITY_CREATED",
              //   projectId: job.projectId,
              //   worldId: job.worldId,
              //   userId: job.userId,
              //   teamId: job.teamId,
              //   payload: updatedEntities.map((updated) => {
              //     return {
              //       entityId: updated.entity.id,
              //       entityType: updated.entityType,
              //       entity: updated.entity,
              //     } as any;
              //   }),
              //   timestamp: new Date().toISOString(),
              // });

              updated = await this.projectRepository.getProjectFullState(projectId);

              const nextStoryboard = storyboardManager.applyUpdates(updated.storyboard, {
                metadata: updated.storyboard.metadata,
                characters: updated.characters,
                locations: updated.locations,
                scenes: updated.scenes,
              });
              await this.projectRepository.updateProject(projectId, {
                storyboard: nextStoryboard,
              });
              updated = { ...updated, storyboard: nextStoryboard };

              break;
            }

            default:
              throw new Error(`Unknown job type: ${JSON.stringify(job)}`);
          }

          const endTime = Date.now();
          const durationMs = endTime - startTime;
          this.publishStateUpdate({ project: updated, userId: job.userId });

          const updatedJob = await this.jobControlPlane.updateJobSafe(jobId, job.attempts.currentAttempt, {
            state: "COMPLETED",
          });
          this.publishJobEvent({
            type: "JOB_COMPLETED",
            projectId: updatedJob.projectId,
            userId: updatedJob.userId,
            teamId: updatedJob.teamId,
            metadata: buildJobEventMetadata(updatedJob),
          });
        } catch (error: any) {
          console.error(
            {
              error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
                ...(error.cause && { cause: error.cause }),
              },
              job,
            },
            "Execution failed",
          );

          const isRAIError =
            error instanceof RAIError ||
            error.name === "RAIError" ||
            (error.message &&
              typeof error.message === "string" &&
              (error.message.includes("safety") || error.message.includes("RAI")));

          if (isRAIError) {
            console.warn(
              { jobId, jobType: job.type, error: error.message },
              "RAI/Safety error detected - marking as FATAL for intervention",
            );

            await this.jobControlPlane.updateJobSafe(jobId, job.attempts.currentAttempt, {
              state: "FATAL",
              error: (error.message as string).slice(0, 500),
              recoveryContext: {
                reason: "PERMANENT_ERROR",
                triggeredBy: "DISPATCHER",
                previousJobId: jobId,
              } as RecoveryContext,
            });
          } else {
            await this.jobControlPlane.updateJobSafe(jobId, job.attempts.currentAttempt, {
              state: "FAILED",
              error: (error.message as string).slice(0, 80),
            });
          }

          await this.publishJobEvent({
            type: "JOB_FAILED",
            projectId: job.projectId,
            userId: job.userId,
            teamId: job.teamId,
            metadata: buildJobEventMetadata(job),
            error: `${error.name}: ${error.message}`.slice(0, 200),
          });
        }
      },
    );
  }
}
