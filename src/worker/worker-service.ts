// src/worker/worker-service.ts
import { JobControlPlane } from "../shared/services/job-control-plane.js";
import { GenerativeResultEnhanceStoryboard, GenerativeResultExpandCreativePrompt, Job, JobEvent } from "../shared/types/job.types.js";
import { GCPStorageManager } from "../shared/services/storage-manager.js";
import { TextModelController } from "../shared/lm/text-model-controller.js";
import { VideoModelController } from "../shared/lm/video-model-controller.js";
import { MediaProcessingAgent } from "../shared/agents/media-processing-agent.js";
import { CompositionalAgent } from "../shared/agents/compositional-agent.js";
import { QualityCheckAgent } from "../shared/agents/quality-check-agent.js";
import { SemanticExpertAgent } from "../shared/agents/semantic-expert-agent.js";
import { FrameCompositionAgent } from "../shared/agents/frame-composition-agent.js";
import { SceneGeneratorAgent } from "../shared/agents/scene-generator.js";
import { ContinuityManagerAgent } from "../shared/agents/continuity-manager.js";
import { AssetVersion, Project, Character, CharacterBase, LocationBase, SceneBase, Location, Scene, Storyboard, ProjectMetadata, SceneEntity, UpdateScene, SaveAssetsCallbackArgs, ProjectEntity, AssetRegistry, CharacterAttributes, LocationAttributes, CharacterWithAssets, LocationWithAssets, InsertLocation, InsertCharacter, SceneAttributes, InsertScene, buildJobEventMetadata } from "../shared/types/index.js";
import { SaveAssetsCallback, PipelineEvent, UpdateEntitiesCallback, } from "../shared/types/pipeline.types.js";
import { ProjectRepository } from "../shared/services/project-repository.js";
import { MediaController } from "../shared/services/media-controller.js";
import { AssetVersionManager } from "../shared/services/asset-version-manager.js";
import { logContextStore } from "../shared/logger/index.js";
import { DistributedLockManager } from "../shared/services/lock-manager.js";
import { generateId } from "#shared/utils/id.js";
import { extractGenerationRules } from "../shared/prompts/prompt-utils.js";
import { mapSceneWithAssetsToSceneBase, mapDomainSceneToInsertScene } from "../shared/entity/scene-mappers.js";
import { mapCharacterWithAssetsToCharacterBase, mapCharacterWithAssetsToCharacterAttributes, mapDomainCharacterToInsertCharacter } from "../shared/entity/character-mappers.js";
import { mapLocationWithAssetsToLocationBase, mapLocationWithAssetsToLocationAttributes, mapDomainLocationToInsertLocation, mapReferenceIdsToIds } from "../shared/entity/location-mappers.js";
import { entityIdAt, getAllBestAssets } from "../shared/utils/assets-utils.js";
import { hydrateEntity, hydrateProject } from "../shared/utils/entity.utils.js";
import { RAIError } from "../shared/utils/errors.js";
import { RecoveryContext } from "../shared/types/job.types.js";
import { processGenerateCompositeJob } from "./generateCompositeWorker.js";
import { GenerationTools, toReferenceId } from "../shared/tools/generation-tools.js";
import { KBHydrator } from "../shared/services/sac/KBHydrator.js";

/**
 * Orchestrates job execution for AI agents.
 * Ensures execution happens within a safe asynchronous context.
 */
export class WorkerService {

    private textModel = new TextModelController('google');
    private videoModel = new VideoModelController('google');
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

    private async publishStateUpdate({ project, userId }: { project: Project, userId: string }) {
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

        const frameCompositionAgent = new FrameCompositionAgent(
            this.textModel,
            this.textModel,
            qualityAgent,
            storageManager,
            assetManager,
            agentOptions
        );

        console.debug({ projectId, workerId: this.workerId, textModel: this.textModel.textModel, imageModel: this.textModel.imageModel, videoModel: this.videoModel.model, qualityCheckModel: this.textModel.qualityCheckModel }, `Initializing agents`);

        return {
            assetManager,
            storageManager,
            mediaProcessingAgent: new MediaProcessingAgent(this.textModel, storageManager, mediaController, agentOptions),
            compositionalAgent: new CompositionalAgent(this.textModel, storageManager, assetManager, agentOptions),
            semanticExpert: new SemanticExpertAgent(this.textModel),
            frameCompositionAgent,
            sceneAgent: new SceneGeneratorAgent(this.videoModel, qualityAgent, storageManager, assetManager, agentOptions),
            continuityAgent: new ContinuityManagerAgent(
                this.textModel,
                this.textModel,
                frameCompositionAgent,
                qualityAgent,
                storageManager,
                assetManager,
                agentOptions
            )
        };
    }

    private createUpdateEntitiesCallback = (job: Job): UpdateEntitiesCallback => {
        const sendUpdateEntities = async (
            updates: Array<{
                id: string;
                entityType: 'scene' | 'character' | 'location';
                entity: Partial<Scene> | Partial<Character> | Partial<Location>;
                assets?: AssetRegistry;
            }>,
            saveToDb = true
        ) => {
            try {
                console.log({ projectId: job.projectId, count: updates.length }, `Updating entities`);
                if (saveToDb) {
                    const sceneUpdates = updates
                        .filter(u => u.entityType === 'scene')
                        .map(u => ({
                            id: u.id,
                            ...u.entity as Partial<Scene>
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
                    payload: updates,
                    timestamp: new Date().toISOString(),
                });
            } catch (error) {
                console.error({ error, functionName: "sendUpdateEntities", projectId: job.projectId, jobId: job.id, workerId: this.workerId }, `Error updating entities`);
                throw error;
            }
        };
        return sendUpdateEntities;
    };


    private createSaveAssetsCallback = (job: Job, jobStartTime: number): SaveAssetsCallback => {
        async function saveAssets(
            this: WorkerService,
            ...[scope, assetKeys, type, assets, metadata, setBest = true, callbackStartTime = jobStartTime]: SaveAssetsCallbackArgs
        ) {
            try {
                const assetHistories = await this.getAgents(job.projectId).assetManager.createVersionedAssets(
                    scope,
                    assetKeys,
                    type,
                    assets,
                    metadata.map(m => ({ ...m, jobId: job.id })) as AssetVersion['metadata'][],
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
                console.error({ error, functionName: "saveAssets", projectId: job.projectId, jobId: job.id, workerId: this.workerId }, `Error saving assets`);
                // throw error;
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

        await logContextStore.run({
            jobId: job.id,
            jobUniqueKey: job.uniqueKey,
            projectId: job.projectId,
            w_id: this.workerId,
            correlationId: generateId(),
            shouldPublish: false,
            jobType: job.type,
            attempt: job.attempts.currentAttempt
        }, async () => {
            try {

                await this.publishJobEvent({
                    type: "JOB_STARTED",
                    projectId: job.projectId,
                    userId: job.userId,
                    teamId: job.teamId,
                    metadata: buildJobEventMetadata(job),
                }); console.log({ job, startTime }, `Executing job.`);

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
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
                            throw caseError;
                        }

                        let result: GenerativeResultExpandCreativePrompt;
                        try {
                            result = await agents.compositionalAgent.expandCreativePrompt(
                                project.metadata.title,
                                project.metadata.initialPrompt,
                                { maxRetries: 3, attempt: 1, initialDelay: 1000, projectId: job.projectId }
                            );
                        } catch (generateError: any) {
                            console.error({ error: generateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to generate");
                            throw generateError;
                        }

                        try {
                            updated = await this.projectRepository.updateProject(project.id, {
                                metadata: {
                                    ...project.metadata, enhancedPrompt: result.data.expandedPrompt,
                                }
                            });
                        } catch (updateError: any) {
                            console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                            throw updateError;
                        }
                        break;
                    }

                    case "GENERATE_STORYBOARD": {
                        try {
                            console.debug({ jobType: job.type, jobId, projectId: job.projectId }, "Initiating GENERATE_STORYBOARD pipeline.");

                            let project = await this.projectRepository.getProject(job.projectId);
                            if (!project.metadata.enhancedPrompt) throw new Error("No enhanced prompt available");

                            try {
                                const existingCharactersWithAssets = await this.projectRepository.getProjectCharacters(job.projectId);
                                const existingLocationsWithAssets = await this.projectRepository.getProjectLocations(job.projectId);

                                console.debug({ jobId, characterCount: existingCharactersWithAssets.length, locationCount: existingLocationsWithAssets.length }, "Retrieved existing project assets.");

                                let { data, metadata } = await agents.compositionalAgent.generateStoryboardExclusivelyFromPrompt(
                                    project.metadata.title,
                                    project.metadata.enhancedPrompt,
                                    { attempt: job.attempts.currentAttempt, maxRetries: job.attempts.maxRetries, projectId: job.projectId },
                                    existingCharactersWithAssets.map(mapCharacterWithAssetsToCharacterAttributes),

                                    // error: description was expected here, but undefined
                                    existingLocationsWithAssets.map(mapLocationWithAssetsToLocationAttributes),
                                );

                                try {

                                    const storyboardCharacters: CharacterBase[] = [];
                                    const storyboardLocations: LocationBase[] = [];
                                    const storyboardScenes: SceneBase[] = [];


                                    const allCharactersInsertData: InsertCharacter[] = data.storyboardAttributes.characters.map((character) => {
                                        const insertCharacter = mapDomainCharacterToInsertCharacter({
                                            ...character,
                                            projectId: project.id,
                                        });
                                        storyboardCharacters.push(mapCharacterWithAssetsToCharacterBase({ ...insertCharacter, description: character.description }));
                                        return insertCharacter;
                                    });

                                    const allLocationsInsertData: InsertLocation[] = data.storyboardAttributes.locations.map((location) => {
                                        const insertLocation = mapDomainLocationToInsertLocation({
                                            ...location,
                                            projectId: project.id,
                                        });
                                        storyboardLocations.push(mapLocationWithAssetsToLocationBase({ ...insertLocation, description: location.description }));
                                        return insertLocation;
                                    });


                                    // Deduplicate: filter out characters/locations that already exist in the project
                                    const existingCharacterReferenceIds = new Set(existingCharactersWithAssets.map(c => c.referenceId));
                                    const existingLocationReferenceIds = new Set(existingLocationsWithAssets.map(l => l.referenceId));

                                    const newCharactersToInsertData = allCharactersInsertData.filter(c => !existingCharacterReferenceIds.has(c.referenceId));
                                    const newLocationsToInsertData = allLocationsInsertData.filter(l => !existingLocationReferenceIds.has(l.referenceId));

                                    console.debug({ jobId, newCharacters: newCharactersToInsertData.length, newLocations: newLocationsToInsertData.length }, "Deduplication complete. Executing database insertions.");

                                    const [insertedCharactersWithAssets, insertedLocationsWithAssets] = await Promise.all([
                                        newCharactersToInsertData.length > 0 ? this.projectRepository.createCharacters(project.id, newCharactersToInsertData) : Promise.resolve([]),
                                        newLocationsToInsertData.length > 0 ? this.projectRepository.createLocations(project.id, newLocationsToInsertData) : Promise.resolve([])
                                    ]);

                                    // Save description assets for newly created entities only
                                    if (storyboardCharacters.length > 0) {
                                        const characterDescriptions = storyboardCharacters.map(c => c.description);
                                        await this.createSaveAssetsCallback(job, startTime)({ projectId: project.id, characterIds: storyboardCharacters.map(c => c.id) }, ['description'], 'text', characterDescriptions, [{ model: metadata.model }]);
                                    }

                                    if (storyboardLocations.length > 0) {
                                        const locationDescriptions = storyboardLocations.map(l => l.description);
                                        await this.createSaveAssetsCallback(job, startTime)({ projectId: project.id, locationIds: storyboardLocations.map(l => l.id) }, ['description'], 'text', locationDescriptions, [{ model: metadata.model }]);
                                    }

                                    const allCharactersWithAssets = [...existingCharactersWithAssets, ...insertedCharactersWithAssets];
                                    const allLocationsWithAssets = [...existingLocationsWithAssets, ...insertedLocationsWithAssets];


                                    const scenesToInsertData: SceneBase[] = data.storyboardAttributes.scenes.map((scene) => {
                                        const insertScene: SceneEntity = mapDomainSceneToInsertScene({
                                            ...scene,
                                            projectId: project.id,
                                            locationId: mapReferenceIdsToIds(allLocationsWithAssets, [scene.locationReferenceId])[0],
                                        });

                                        const characterIds = mapReferenceIdsToIds(allCharactersWithAssets, scene.characterReferenceIds);

                                        storyboardScenes.push(mapSceneWithAssetsToSceneBase({
                                            ...insertScene,
                                            characterIds,
                                            description: scene.description
                                        }));

                                        return {
                                            ...insertScene,
                                            description: scene.description,
                                            characterIds,
                                        };
                                    });

                                    const allScenesWithAssets = await this.projectRepository.createScenes(project.id, scenesToInsertData);

                                    if (storyboardScenes.length > 0) {
                                        const sceneDescriptions = storyboardScenes.map(l => l.description);
                                        await this.createSaveAssetsCallback(job, startTime)({ projectId: project.id, sceneIds: storyboardScenes.map(l => l.id) }, ['description'], 'text', sceneDescriptions, [{ model: metadata.model }]);
                                    }


                                    const updateMetadata: ProjectMetadata = { ...project.metadata, ...data.storyboardAttributes.metadata };

                                    const storyboard: Storyboard = {
                                        ...data.storyboardAttributes,
                                        metadata: updateMetadata,
                                        scenes: storyboardScenes,
                                        characters: storyboardCharacters,
                                        locations: storyboardLocations,
                                    };


                                    updated = await this.projectRepository.updateProject(project.id, {
                                        metadata: updateMetadata,
                                        storyboard,
                                        scenes: allScenesWithAssets,
                                        characters: allCharactersWithAssets,
                                        locations: allLocationsWithAssets
                                    });

                                    // Await asset save to prevent race condition worker termination
                                    await this.createSaveAssetsCallback(job, startTime)({ projectId: project.id }, ['storyboard'], 'text', [JSON.stringify(storyboard)], [{ model: metadata.model }]).catch((error) => {
                                        console.error({ error, jobType: job.type, jobId, projectId: job.projectId }, "Non-fatal: Failed to save storyboard text asset.");
                                    });
                                    console.debug({ jobId, projectId: project.id }, "GENERATE_STORYBOARD pipeline completed successfully.");

                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed during database insertion or asset compilation.");
                                    throw updateError;
                                }
                            } catch (generateError: any) {
                                console.error({ error: generateError, jobType: job.type, jobId, projectId: job.projectId }, "Compositional Agent failed to generate storyboard.");
                                throw generateError;
                            }
                        } catch (caseError: any) {
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "GENERATE_STORYBOARD job case failed.");
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

                                    await this.createSaveAssetsCallback(job, startTime)({ projectId: project.id }, ["audio_analysis"], 'text', [JSON.stringify(data.analysis)], [{ model: metadata.model }]).catch((error) => {
                                        console.error({ error, jobType: job.type, jobId, projectId: job.projectId }, "Failed to save assets");
                                    });

                                    const projectMetadata: ProjectMetadata = { ...project.metadata, ...analysisData };
                                    const storyboard: Storyboard = { metadata: projectMetadata, scenes: [], characters: [], locations: [] };

                                    updated = await this.projectRepository.updateProject(job.projectId, { status: "pending", metadata: projectMetadata, storyboard, audioAnalysis: data.analysis });

                                    // Passing only the fields that need to be updated
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                                    throw updateError;
                                }
                            } catch (processError: any) {
                                console.error({ model: this.textModel.textModel, error: processError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to process audio");
                                throw processError;
                            }
                        } catch (caseError: any) {
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
                            throw caseError;
                        }
                        break;
                    }

                    case "ENHANCE_STORYBOARD": {
                        try {
                            console.debug({ jobType: job.type, jobId, projectId: job.projectId }, "Initiating ENHANCE_STORYBOARD pipeline.");

                            let project = await this.projectRepository.getProject(job.projectId);
                            if (!project?.storyboard || !project.storyboard.scenes) throw new Error("No scenes available.");
                            if (!project?.metadata.enhancedPrompt) throw new Error("No enhanced prompt available.");

                            try {
                                const existingCharactersWithAssets = await this.projectRepository.getProjectCharacters(job.projectId);
                                const existingLocationsWithAssets = await this.projectRepository.getProjectLocations(job.projectId);

                                let data: GenerativeResultEnhanceStoryboard['data'];
                                let metadata: GenerativeResultEnhanceStoryboard['metadata'];

                                console.debug({ jobId, hasAudio: project.metadata.hasAudio }, "Executing Compositional Agent storyboard enhancement.");

                                if (project.metadata.hasAudio && project.audioAnalysis) {
                                    ({ data, metadata } = await agents.compositionalAgent.generateStoryboardFromAudioAnalysis(
                                        project.metadata.title,
                                        project.metadata.enhancedPrompt,
                                        project.audioAnalysis.segments,
                                        { initialDelay: 30000, attempt: job.attempts.currentAttempt, maxRetries: job.attempts.maxRetries, projectId: job.projectId },
                                        existingCharactersWithAssets.map(mapCharacterWithAssetsToCharacterAttributes),
                                        existingLocationsWithAssets.map(mapLocationWithAssetsToLocationAttributes),
                                    ));
                                } else {
                                    ({ data, metadata } = await agents.compositionalAgent.generateStoryboardFromAudioAnalysis(
                                        project.metadata.title,
                                        project.metadata.enhancedPrompt,
                                        project.storyboard.scenes,
                                        { initialDelay: 30000, attempt: job.attempts.currentAttempt, maxRetries: job.attempts.maxRetries, projectId: job.projectId },
                                        existingCharactersWithAssets.map(mapCharacterWithAssetsToCharacterAttributes),
                                        existingLocationsWithAssets.map(mapLocationWithAssetsToLocationAttributes),
                                    ));
                                }

                                try {

                                    const storyboardCharacters: CharacterBase[] = [];
                                    const storyboardLocations: LocationBase[] = [];
                                    const storyboardScenes: SceneBase[] = [];

                                    const allCharactersInsertData: InsertCharacter[] = data.storyboardAttributes.characters.map((character) => {
                                        const insertCharacter = mapDomainCharacterToInsertCharacter({
                                            ...character,
                                            projectId: project.id,
                                        });
                                        storyboardCharacters.push(mapCharacterWithAssetsToCharacterBase({ ...insertCharacter, description: character.description }));
                                        return insertCharacter;
                                    });

                                    const allLocationsInsertData: InsertLocation[] = data.storyboardAttributes.locations.map((location) => {
                                        const insertLocation = mapDomainLocationToInsertLocation({
                                            ...location,
                                            projectId: project.id,
                                        });
                                        storyboardLocations.push(mapLocationWithAssetsToLocationBase({ ...insertLocation, description: location.description }));
                                        return insertLocation;
                                    });


                                    const existingCharacterReferenceIds = new Set(existingCharactersWithAssets.map(c => c.referenceId));
                                    const existingLocationReferenceIds = new Set(existingLocationsWithAssets.map(l => l.referenceId));

                                    const newCharactersToInsertData = allCharactersInsertData.filter(c => !existingCharacterReferenceIds.has(c.referenceId));
                                    const newLocationsToInsertData = allLocationsInsertData.filter(l => !existingLocationReferenceIds.has(l.referenceId));

                                    console.debug({ jobId, newCharacters: newCharactersToInsertData.length, newLocations: newLocationsToInsertData.length }, "Deduplication complete. Executing database insertions for enhanced assets.");

                                    const [insertedCharactersWithAssets, insertedLocationsWithAssets] = await Promise.all([
                                        newCharactersToInsertData.length > 0 ? this.projectRepository.createCharacters(project.id, newCharactersToInsertData) : Promise.resolve([]),
                                        newLocationsToInsertData.length > 0 ? this.projectRepository.createLocations(project.id, newLocationsToInsertData) : Promise.resolve([])
                                    ]);

                                    // Save description assets for newly created entities only
                                    if (storyboardCharacters.length > 0) {
                                        const characterDescriptions = storyboardCharacters.map(c => c.description);
                                        await this.createSaveAssetsCallback(job, startTime)({ projectId: project.id, characterIds: storyboardCharacters.map(c => c.id) }, ['description'], 'text', characterDescriptions, [{ model: metadata.model }]);
                                    }

                                    if (storyboardLocations.length > 0) {
                                        const locationDescriptions = storyboardLocations.map(l => l.description);
                                        await this.createSaveAssetsCallback(job, startTime)({ projectId: project.id, locationIds: storyboardLocations.map(l => l.id) }, ['description'], 'text', locationDescriptions, [{ model: metadata.model }]);
                                    }

                                    const allCharactersWithAssets: CharacterWithAssets[] = [...existingCharactersWithAssets, ...insertedCharactersWithAssets];
                                    const allLocationsWithAssets: LocationWithAssets[] = [...existingLocationsWithAssets, ...insertedLocationsWithAssets];


                                    const scenesToInsertData: SceneBase[] = data.storyboardAttributes.scenes.map((scene) => {
                                        const insertScene: SceneEntity = mapDomainSceneToInsertScene({
                                            ...scene,
                                            projectId: project.id,
                                            locationId: mapReferenceIdsToIds(allLocationsWithAssets, [scene.locationReferenceId])[0],
                                        });

                                        const characterIds: string[] = mapReferenceIdsToIds(allCharactersWithAssets, scene.characterReferenceIds);

                                        storyboardScenes.push(mapSceneWithAssetsToSceneBase({
                                            ...insertScene,
                                            characterIds,
                                            description: scene.description
                                        }));

                                        return {
                                            ...insertScene,
                                            characterIds,
                                            description: scene.description
                                        };
                                    });

                                    const allScenesWithAssets = await this.projectRepository.createScenes(project.id, scenesToInsertData);

                                    if (storyboardScenes.length > 0) {
                                        const sceneDescriptions = storyboardScenes.map(l => l.description);
                                        await this.createSaveAssetsCallback(job, startTime)({ projectId: project.id, sceneIds: storyboardScenes.map(l => l.id) }, ['description'], 'text', sceneDescriptions, [{ model: metadata.model }]);
                                    }


                                    const updateMetadata: ProjectMetadata = { ...project.metadata, ...data.storyboardAttributes.metadata };

                                    const storyboard: Storyboard = {
                                        ...data.storyboardAttributes,
                                        metadata: updateMetadata,
                                        characters: storyboardCharacters,
                                        locations: storyboardLocations,
                                        scenes: storyboardScenes,
                                    };

                                    updated = await this.projectRepository.updateProject(job.projectId, {
                                        storyboard,
                                        metadata: updateMetadata,
                                        characters: allCharactersWithAssets,
                                        locations: allLocationsWithAssets,
                                        scenes: allScenesWithAssets
                                    });

                                    await this.createSaveAssetsCallback(job, startTime)({ projectId: project.id }, ['storyboard'], 'text', [JSON.stringify(updated.storyboard)], [{ model: metadata.model }]).catch((error) => {
                                        console.error({ error, jobType: job.type, jobId, projectId: job.projectId }, "Non-fatal: Failed to save enhanced storyboard text asset.");
                                    });
                                    console.debug({ jobId, projectId: project.id }, "ENHANCE_STORYBOARD pipeline completed successfully.");

                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to persist enhanced project attributes.");
                                    throw updateError;
                                }
                            } catch (enhanceError: any) {
                                console.error({ error: enhanceError, jobType: job.type, jobId, projectId: job.projectId }, "Compositional Agent failed to enhance storyboard.");
                                throw enhanceError;
                            }
                        } catch (caseError: any) {
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "ENHANCE_STORYBOARD job case failed.");
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
                                    const uniqueRules = Array.from(new Set([...proactiveRules, ...data.dynamicRules]));

                                    const generationRules = uniqueRules;
                                    const generationRulesHistory = [...project.generationRulesHistory, uniqueRules];

                                    updated = await this.projectRepository.updateProject(job.projectId, { generationRules, generationRulesHistory });
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

                    case "GENERATE_CHARACTER_ASSETS": {
                        try {
                            const project = await this.projectRepository.getProjectFullState(job.projectId);
                            // CHANGE 2/4 — original read full character objects off job.payload.characters.
                            // Payload now carries only characterIds; filter from the freshly loaded project.
                            // Empty / absent characterIds → fall back to all project characters (batch runs).
                            const charactersToProcess = job.payload.characterIds.length
                                ? project.characters.filter(c => (job.payload.characterIds).includes(c.id))
                                : project.characters;

                            if (!charactersToProcess.length) {
                                console.log("No characters to process");
                                throw new Error("No characters to process.");
                            }

                            const hydratedCharacters: Character[] = charactersToProcess.map(c => hydrateEntity(c, c.assets));

                            try {
                                let { data, metadata } = await agents.continuityAgent.generateCharacterAssets(
                                    hydratedCharacters,
                                    project.generationRules,
                                    this.createSaveAssetsCallback(job, startTime),
                                    this.jobControlPlane.createIncrementAttemptHook(job),
                                );

                                try {

                                    updated = await this.projectRepository.updateProject(job.projectId, { characters: data.characters });
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                                    throw updateError;
                                }
                            } catch (generateError: any) {
                                console.error({ error: generateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to generate character assets");
                                throw generateError;
                            }
                        } catch (caseError: any) {
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
                            throw caseError;
                        }
                        break;
                    }

                    case "GENERATE_LOCATION_ASSETS": {
                        try {
                            const project = await this.projectRepository.getProjectFullState(job.projectId);
                            // CHANGE 3/4 — original read full location objects off job.payload.locations.
                            // Payload now carries only locationIds; filter from the freshly loaded project.
                            // Empty / absent locationIds → fall back to all project locations (batch runs).
                            const locationsToProcess = job.payload.locationIds.length
                                ? project.locations.filter(l => (job.payload.locationIds).includes(l.id))
                                : project.locations;

                            if (!locationsToProcess.length) {
                                console.log("No locations to process");
                                throw new Error("No locations to process.");
                            }

                            try {
                                let { data, metadata } = await agents.continuityAgent.generateLocationAssets(
                                    locationsToProcess.map(l => hydrateEntity(l, l.assets)),
                                    project.generationRules,
                                    this.createSaveAssetsCallback(job, startTime),
                                    this.jobControlPlane.createIncrementAttemptHook(job),
                                );
                                try {

                                    updated = await this.projectRepository.updateProject(job.projectId, { locations: data.locations });
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                                    throw updateError;
                                }
                            } catch (generateError: any) {
                                console.error({ error: generateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to generate location assets");
                                throw generateError;
                            }
                        } catch (caseError: any) {
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
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
                                    ['image_file'],
                                    'image',
                                    data.outputImages.map((img) => img.data),
                                    [metadata],
                                );

                                updated = await this.projectRepository.getProjectFullState(job.projectId);
                            } catch (updateError: any) {
                                console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to save composite assets");
                                throw updateError;
                            }
                        } catch (caseError: any) {
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
                            throw caseError;
                        }
                        break;
                    }

                    case "GENERATE_SCENE_FRAMES": {

                        try {
                            const project = await this.projectRepository.getProjectFullState(job.projectId);
                            const scenesToProcess = job.payload?.sceneIds?.length
                                ? project.scenes.filter(scene => job.payload.sceneIds?.includes(scene.id))
                                : project.scenes;
                            if (!scenesToProcess.length) {
                                console.log("No scenes to process");
                                throw new Error("No scenes to process.");
                            }

                            try {
                                const result = await agents.continuityAgent.generateSceneFramesBatch(
                                    hydrateProject(project),
                                    scenesToProcess.map(scene => hydrateEntity(scene, scene.assets)),
                                    job.payload.assetKeys,
                                    this.createSaveAssetsCallback(job, startTime),
                                    this.createUpdateEntitiesCallback(job),
                                    this.jobControlPlane.createIncrementAttemptHook(job),
                                );
                                if (!result || !result.data) {
                                    throw new Error("Frame generation returned invalid result");
                                }

                                // Phase 3: Implement Continuity Retry Logic
                                const deferredSceneIds = result.data.deferredSceneIds;

                                if (deferredSceneIds && deferredSceneIds.length > 0) {
                                    const currentAttempt = job.attempts.currentAttempt || 0;
                                    const MAX_CONTINUITY_DEFERRALS = 3;

                                    if (currentAttempt < MAX_CONTINUITY_DEFERRALS) {
                                        console.log(`[CONTINUITY DEFERRAL] Scenes [${deferredSceneIds.join(', ')}] are waiting for previous frames. Retrying (Attempt ${currentAttempt}/${MAX_CONTINUITY_DEFERRALS})...`);

                                        // Re-enqueue the job with a 5-second backoff using requeueJob
                                        await this.jobControlPlane.requeueJob(job.id);

                                        // Send update message about the deferral
                                        this.createUpdateEntitiesCallback(job)(deferredSceneIds.map((id) => {
                                            const scene = scenesToProcess.find(s => s.id === id)!;
                                            return {
                                                id,
                                                entityType: 'scene',
                                                entity: {
                                                    id,
                                                    status: "pending" as const,
                                                    progressMessage: `Waiting for previous scene frames. Attempt ${currentAttempt + 1}/${MAX_CONTINUITY_DEFERRALS}`
                                                }
                                            };
                                        }));

                                        // Exit current execution to allow retry
                                        return;
                                    } else {
                                        // VERBOSE LOGGING ON LIMIT REACHED
                                        console.error(`🚨 [CRITICAL CONTINUITY FAILURE] Scene continuity limit reached for Job ${jobId}. 
                                        The following scenes were marked 'Continuous' but their dependencies never materialized: ${deferredSceneIds.join(', ')}. 
                                        Architectural Root Cause: Parallel generation bottleneck or upstream failure in previous scene.`);

                                        // Fallback: Proceed with standard generation to avoid stalling the pipeline indefinitely
                                        console.warn("Falling back to autonomous generation for dependent frames to preserve pipeline flow.");

                                        // Update scenes with warning message
                                        this.createUpdateEntitiesCallback(job)(deferredSceneIds.map(id => {
                                            const scene = scenesToProcess.find(s => s.id === id)!;
                                            return {
                                                id,
                                                entityType: 'scene',
                                                entity: {
                                                    id,
                                                    projectId: scene.projectId,
                                                    sceneIndex: scene.sceneIndex,
                                                    status: "pending" as const,
                                                    progressMessage: "Couldn't get previous scene frame. Generating a new start frame."
                                                }
                                            };
                                        }));
                                    }
                                }

                                const { data, metadata } = result;

                                try {
                                    updated = await this.projectRepository.updateProject(job.projectId, { scenes: data.updatedScenes });
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                                    throw updateError;
                                }
                            } catch (generateError: any) {
                                console.error({ error: generateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to generate scene frames");
                                throw generateError;
                            }
                        } catch (caseError: any) {
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
                            throw caseError;
                        }
                        break;
                    }

                    case "GENERATE_SCENE_VIDEO": {
                        try {
                            const project = await this.projectRepository.getProjectFullState(job.projectId);
                            const hydratedProject = hydrateProject(project);
                            const hydratedScene = hydratedProject.scenes.find(s => s.id === job.payload.sceneId);
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
                                    this.createSaveAssetsCallback(job, startTime)
                                );

                                const [version] = await agents.assetManager.getNextVersionNumber({ projectId: job.projectId, sceneIds: [hydratedScene.id] }, ['scene_video']);

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
                                    uniqueId: job.id
                                });

                                try {
                                    const updatedProject = agents.continuityAgent.updateNarrativeState(
                                        data.scene,
                                        hydratedProject
                                    );

                                    let generationRules = updatedProject.generationRules;
                                    if (metadata.evaluation) {
                                        generationRules = Array.from(new Set([...updatedProject.generationRules, ...extractGenerationRules([metadata.evaluation])]));
                                    }
                                    const forceRegenerateIndex = hydratedProject.forceRegenerateSceneIds.findIndex(id => id === hydratedScene.id);
                                    const forceRegenerateSceneIds = hydratedProject.forceRegenerateSceneIds.slice(0, forceRegenerateIndex).concat(hydratedProject.forceRegenerateSceneIds.slice(forceRegenerateIndex + 1));

                                    updated = await this.projectRepository.updateProject(job.projectId, { characters: updatedProject.characters, locations: updatedProject.locations, scenes: updatedProject.scenes, generationRules, forceRegenerateSceneIds });

                                    if (job.payload.renderInProgress !== false) {
                                        try {
                                            const fullProject = await this.projectRepository.getProjectFullState(job.projectId);
                                            const scenes = fullProject.scenes || [];
                                            const videoPaths = scenes.map(s => {
                                                const sceneAssets = getAllBestAssets(s.assets);
                                                return sceneAssets['scene_video']?.data;
                                            }).filter((uri): uri is string => !!uri);

                                            if (videoPaths.length > 0) {
                                                const renderJob: any = {
                                                    ...job,
                                                    type: "RENDER_VIDEO",
                                                    payload: {
                                                        videoPaths,
                                                        audioGcsUri: fullProject.metadata.audioGcsUri,
                                                    }
                                                };
                                                const { videoGcsUri, thumbnailGcsUri, duration } = await agents.mediaProcessingAgent.renderVideo(renderJob, fullProject.metadata.title);

                                                await this.createSaveAssetsCallback(job, startTime)({ projectId: job.projectId }, ['render_video'], 'video', [videoGcsUri], [{ model: this.videoModel.model, duration }]);
                                                await this.createSaveAssetsCallback(job, startTime)({ projectId: job.projectId }, ['thumbnail'], 'image', [thumbnailGcsUri], [{ model: this.videoModel.model }]);

                                                updated = await this.projectRepository.getProjectFullState(job.projectId);
                                            }
                                        } catch (renderError) {
                                            console.warn("Inline video render failed (non-blocking)", renderError);
                                        }
                                    }
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                                    throw updateError;
                                }
                            } catch (generateError: any) {
                                console.error({ error: generateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to generate scene video");
                                throw generateError;
                            }
                        } catch (caseError: any) {
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
                            throw caseError;
                        }
                        break;
                    }

                    case "RENDER_VIDEO": {
                        try {
                            let project = await this.projectRepository.getProject(job.projectId);
                            if (!project) throw new Error("No project available.");

                            try {
                                const { videoGcsUri, thumbnailGcsUri, duration } = await agents.mediaProcessingAgent.renderVideo(job, project.metadata.title);

                                try {

                                    await this.createSaveAssetsCallback(job, startTime)({ projectId: job.projectId }, ['render_video'], 'video', [videoGcsUri], [{ model: this.videoModel.model, duration }]);
                                    await this.createSaveAssetsCallback(job, startTime)({ projectId: job.projectId }, ['thumbnail'], 'image', [thumbnailGcsUri], [{ model: this.videoModel.model }]);

                                    updated = await this.projectRepository.getProjectFullState(job.projectId);
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to finalize video render");
                                    throw updateError;
                                }
                            } catch (renderError: any) {
                                console.error({ error: renderError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to stitch scenes");
                                throw renderError;
                            }
                        } catch (caseError: any) {
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
                            throw caseError;
                        }
                        break;
                    }

                    case "CREATE_SCENE_WITH_ENTITIES": {
                        const {
                            userId,
                            sceneFields,
                            sceneImageGcsUri,
                            sceneImageMimeType,
                            startFrameGcsUri,
                            startFrameMimeType,
                            endFrameGcsUri,
                            endFrameMimeType,
                        } = job.payload;

                        const tools = new GenerationTools();
                        const saveAssets = this.createSaveAssetsCallback(job, startTime);

                        // ── Step 0: Fetch all existing entities up-front ───────────────────────
                        // All DB reads happen before any LLM work to keep transactions short.
                        const [existingChars, existingLocs, existingScenes] = await Promise.all([
                            this.projectRepository.getProjectCharacters(job.projectId),
                            this.projectRepository.getProjectLocations(job.projectId),
                            this.projectRepository.getProjectScenes(job.projectId),
                        ]);
                        const sceneIndex = existingScenes.length;

                        const htmlCharacters = (sceneFields.characterReferenceIds || []).join(", ");
                        const htmlLocation = (sceneFields.locationReferenceId || "");

                        // ── Partition scene fields into handles and plain text ─────────────────
                        const [resultCharsParsed, resultLocParsed] = await Promise.all([
                            this.kbService.extractAndResolveMentions({
                                textInputHtml: htmlCharacters,
                                idProject: job.projectId,
                                idUser: job.userId,
                            }),

                            this.kbService.extractAndResolveMentions({
                                textInputHtml: htmlLocation,
                                idProject: job.projectId,
                                idUser: job.userId,
                            })
                        ]);

                        const charHandles = resultCharsParsed.handlesResolved;
                        const charPlainText = resultCharsParsed.textPlain

                        const locHandle = resultLocParsed.handlesResolved[0] ?? null;
                        const locPlainText = resultLocParsed.textPlain;

                        // Resolve @handles against existing project entities
                        const resolvedChars = existingChars.filter(c => charHandles.includes(c.referenceId));
                        const resolvedLoc = locHandle
                            ? existingLocs.find(l => l.referenceId === locHandle) ?? null
                            : null;

                        // ── Pass 1 (concurrent): Parse plain-text descriptions → partial attrs ─
                        // Skipped entirely when there is no substantive plain text.
                        const [parsedChars, parsedLoc] = await Promise.all([
                            GenerationTools.needsTextParsing(charPlainText)
                                ? tools.parseCharactersFromText(charPlainText)
                                : Promise.resolve([] as Partial<CharacterAttributes>[]),
                            GenerationTools.needsTextParsing(locPlainText) && !resolvedLoc
                                ? tools.parseLocationFromText(locPlainText)
                                : Promise.resolve(null as Partial<LocationAttributes> | null),
                        ]);

                        // ── Pass 2 (fully concurrent): Generate attrs + images ─────────────────
                        // All LLM calls — character attrs, location attrs, scene attrs, and every
                        // image — are fired in parallel in a single Promise.all.
                        type CharResult = { attrs: CharacterAttributes; imageBytes: string; imageMimeType: string };
                        type LocResult = { attrs: LocationAttributes; imageBytes: string; imageMimeType: string } | null;

                        const [generatedCharResults, generatedLocResult, generatedSceneAttrs] = await Promise.all([

                            // New characters: attributes + portrait image, all concurrently
                            Promise.all(
                                parsedChars.map(async (partial): Promise<CharResult> => {
                                    const [attrs, image] = await Promise.all([
                                        tools.generateCharacterAttributes(partial),
                                        tools.generateCharacterImage(partial),
                                    ]);
                                    return { attrs, imageBytes: image.imageBytes, imageMimeType: image.mimeType };
                                })
                            ),

                            // New location: attributes + scene image, concurrently
                            (async (): Promise<LocResult> => {
                                if (!parsedLoc) return null;
                                const [attrs, image] = await Promise.all([
                                    tools.generateLocationAttributes(parsedLoc),
                                    tools.generateLocationImage(parsedLoc),
                                ]);
                                return { attrs, imageBytes: image.imageBytes, imageMimeType: image.mimeType };
                            })(),

                            // Scene: content attributes only — relationship fields are set below
                            tools.generateSceneAttributes(
                                sceneFields as Partial<SceneAttributes>,
                                {
                                    characterNames: [
                                        ...resolvedChars.map(c => c.name),
                                        ...parsedChars.map(c => c.name ?? "").filter(Boolean),
                                    ],
                                    locationName: resolvedLoc?.name ?? parsedLoc?.name,
                                },
                                sceneImageGcsUri,
                                sceneImageMimeType
                            ),

                        ] as const);

                        // ── Step 3a: Insert new characters + save descriptions and images ───────
                        const newCharsInsert = generatedCharResults.map(({ attrs }) =>
                            mapDomainCharacterToInsertCharacter({
                                ...attrs,
                                projectId: job.projectId,
                                id: generateId(),
                                referenceId: attrs.referenceId || toReferenceId(attrs.name),
                            })
                        );

                        const newChars = newCharsInsert.length > 0
                            ? await this.projectRepository.createCharacters(job.projectId, newCharsInsert)
                            : [];

                        if (newChars.length > 0) {
                            await Promise.all([
                                // Description assets (versioned text)
                                saveAssets(
                                    { projectId: job.projectId, characterIds: newChars.map(c => c.id) },
                                    ["description"],
                                    "text",
                                    generatedCharResults.map(r => r.attrs.description ?? ""),
                                    generatedCharResults.map(() => ({ model: this.textModel.textModel }))
                                ),
                                // Portrait images (upload bytes → GCS → asset version)
                                ...generatedCharResults.map(async ({ imageBytes, imageMimeType }, i) => {
                                    const char = newChars[i];
                                    if (!char) return;
                                    const gcsUri = await agents.storageManager.uploadBuffer(
                                        Buffer.from(imageBytes, "base64"),
                                        agents.storageManager.getObjectPath({ version: 0, type: "character_image", characterId: char.id, projectId: job.projectId }),
                                        imageMimeType
                                    );
                                    await saveAssets(
                                        { projectId: job.projectId, characterIds: [char.id] },
                                        ["character_image"],
                                        "image",
                                        [gcsUri],
                                        [{ model: this.textModel.imageModel }]
                                    );
                                }),
                            ]);
                        }

                        // ── Step 3b: Insert new location + save description and image ───────────
                        const newLocInsert = generatedLocResult
                            ? [mapDomainLocationToInsertLocation({
                                ...generatedLocResult.attrs,
                                projectId: job.projectId,
                                id: generateId(),
                                referenceId: generatedLocResult.attrs.referenceId || toReferenceId(generatedLocResult.attrs.name),
                            })]
                            : [];

                        const newLocs = newLocInsert.length > 0
                            ? await this.projectRepository.createLocations(job.projectId, newLocInsert)
                            : [];
                        const newLoc = newLocs[0] ?? null;

                        if (generatedLocResult && newLoc) {
                            const { attrs, imageBytes, imageMimeType } = generatedLocResult;
                            await Promise.all([
                                saveAssets(
                                    { projectId: job.projectId, locationIds: [newLoc.id] },
                                    ["description"],
                                    "text",
                                    [attrs.description],
                                    [{ model: this.textModel.textModel }]
                                ),
                                (async () => {
                                    const outputPath = agents.storageManager.getObjectPath({ version: 0, type: "location_image", locationId: newLoc.id, projectId: job.projectId });
                                    const gcsUri = await agents.storageManager.uploadBuffer(
                                        Buffer.from(imageBytes, "base64"),
                                        outputPath,
                                        imageMimeType
                                    );
                                    await saveAssets(
                                        { projectId: job.projectId, locationIds: [newLoc.id] },
                                        ["location_image"],
                                        "image",
                                        [gcsUri],
                                        [{ model: this.textModel.imageModel }]
                                    );
                                })(),
                            ]);
                        }

                        // ── Step 4: Insert scene ────────────────────────────────────────────────
                        const allChars = [...resolvedChars, ...newChars];
                        const finalLoc = resolvedLoc ?? newLoc;

                        const [insertedScene] = await this.projectRepository.createScenes(job.projectId, [
                            mapDomainSceneToInsertScene({
                                ...generatedSceneAttrs,
                                projectId: job.projectId,
                                id: generateId(),
                                sceneIndex,
                                locationId: finalLoc?.id,
                                locationReferenceId: finalLoc?.referenceId,
                                // characterIds: allChars.map(c => c.id),
                                characterReferenceIds: allChars.map(c => c.referenceId),
                            }),
                        ]);

                        // Save scene description asset
                        if (generatedSceneAttrs.description) {
                            await saveAssets(
                                { projectId: job.projectId, sceneIds: [insertedScene.id] },
                                ["description"],
                                "text",
                                [generatedSceneAttrs.description],
                                [{ model: this.textModel.textModel }]
                            );
                        }

                        // Save user-provided scene frames if present in the job payload
                        await Promise.all([
                            startFrameGcsUri && saveAssets(
                                { projectId: job.projectId, sceneIds: [insertedScene.id] },
                                ["scene_start_frame"], "image", [startFrameGcsUri],
                                [{ model: "user-upload" }]
                            ),
                            endFrameGcsUri && saveAssets(
                                { projectId: job.projectId, sceneIds: [insertedScene.id] },
                                ["scene_end_frame"], "image", [endFrameGcsUri],
                                [{ model: "user-upload" }]
                            ),
                        ].filter(Boolean));

                        // ── Step 5: Emit batch ENTITY_CREATED event ─────────────────────────────
                        await this.publishPipelineEvent({
                            type: "ENTITY_CREATED",
                            projectId: job.projectId,
                            worldId: job.worldId,
                            userId: job.userId,
                            teamId: job.teamId,
                            payload: [
                                ...newChars.map(c => ({
                                    entityId: c.id,
                                    entityType: "character" as const,
                                    entity: c,
                                })),
                                ...(newLoc ? [{
                                    entityId: newLoc.id,
                                    entityType: "location" as const,
                                    entity: newLoc,
                                }] : []),
                                {
                                    entityId: insertedScene.id,
                                    entityType: "scene" as const,
                                    entity: insertedScene,
                                },
                            ],
                            timestamp: new Date().toISOString(),
                        });

                        updated = await this.projectRepository.getProjectFullState(job.projectId);
                        break;
                    }

                    default:
                        throw new Error(`Unknown job type: ${JSON.stringify(job)}`);
                }

                const endTime = Date.now();
                const durationMs = endTime - startTime;
                this.publishStateUpdate({ project: updated, userId: job.userId });

                const updatedJob = await this.jobControlPlane.updateJobSafe(jobId, job.attempts.currentAttempt, { state: "COMPLETED" });
                this.publishJobEvent({
                    type: "JOB_COMPLETED",
                    projectId: updatedJob.projectId,
                    userId: updatedJob.userId,
                    teamId: updatedJob.teamId,
                    metadata: buildJobEventMetadata(updatedJob),
                });

            } catch (error: any) {
                console.error({
                    error: {
                        name: error.name,
                        message: error.message,
                        stack: error.stack,
                        ...(error.cause && { cause: error.cause }),
                    },
                    job,
                }, "Execution failed");

                const isRAIError = error instanceof RAIError ||
                    error.name === 'RAIError' ||
                    (error.message && typeof error.message === 'string' &&
                        (error.message.includes('safety') || error.message.includes('RAI')));

                if (isRAIError) {
                    console.warn({ jobId, jobType: job.type, error: error.message }, "RAI/Safety error detected - marking as FATAL for intervention");

                    await this.jobControlPlane.updateJobSafe(jobId, job.attempts.currentAttempt, {
                        state: "FATAL",
                        error: (error.message as string).slice(0, 500),
                        recoveryContext: {
                            reason: "PERMANENT_ERROR",
                            triggeredBy: "DISPATCHER",
                            previousJobId: jobId
                        } as RecoveryContext
                    });
                } else {
                    await this.jobControlPlane.updateJobSafe(jobId, job.attempts.currentAttempt, { state: "FAILED", error: (error.message as string).slice(0, 80) });
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
        });
    }
}