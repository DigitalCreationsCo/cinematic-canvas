import { JobControlPlane } from "../shared/services/job-control-plane.js";
import { GenerativeResultEnhanceStoryboard, Job, JobEvent } from "../shared/types/job.types.js";
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
import { VersionMetric, AssetVersion, Project, Character, Location, Scene, Storyboard, ProjectMetadata, InsertProject, SceneEntity, SceneAttributes, InsertScene, WorkflowMetrics, Scope, AssetType, AssetKey, UpdateScene, UpdateScenesCallbackArgs, SaveAssetsCallbackArgs } from "../shared/types/index.js";
import { SaveAssetsCallback, PipelineEvent, UpdateScenesCallback, RecordMetricsCallback } from "../shared/types/pipeline.types.js";
import { ProjectRepository } from "../shared/services/project-repository.js";
import { MediaController } from "../shared/services/media-controller.js";
import { AssetVersionManager } from "../shared/services/asset-version-manager.js";
import { logContextStore } from "../shared/logger/index.js";
import { DistributedLockManager } from "../shared/services/lock-manager.js";
import { v7 as uuidv7 } from 'uuid';
import { extractGenerationRules } from "../shared/prompts/prompt-composer.js";
import { mapDbProjectToDomain } from "../shared/domain/project-mappers.js";
import { mapDomainSceneToInsertSceneDb } from "../shared/domain/scene-mappers.js";
import { mapDomainCharacterToInsertCharacterDb } from "../shared/domain/character-mappers.js";
import { mapDomainLocationToInsertLocationDb, mapReferenceIdsToIds } from "../shared/domain/location-mappers.js";
import { recordVersionMetric } from '../shared/services/metrics-worker.js';
import { entityIdAt } from "../shared/utils/assets-utils.js";



/**
 * Orchestrates job execution for AI agents.
 * Ensures execution happens within a safe asynchronous context.
 */
export class WorkerService {

    private textModel = new TextModelController('google');
    private videoModel = new VideoModelController('google');
    private projectRepository = new ProjectRepository();

    constructor(
        private gcpProjectId: string,
        private workerId: string,
        private bucketName: string,
        private jobControlPlane: JobControlPlane,
        private lockManager: DistributedLockManager,
        private publishJobEvent: (event: JobEvent) => Promise<void>,
        private publishPipelineEvent: (event: PipelineEvent) => Promise<void>,
    ) { }

    private async publishStateUpdate(project: Project) {
        this.publishPipelineEvent({
            type: "FULL_STATE",
            projectId: project.id,
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

    private createUpdateScenesCallback = (job: Job): UpdateScenesCallback => {
        async function sendUpdateScenes(
            this: WorkerService,
            ...[ sceneIds, updates, saveToDb = true ]: Parameters<UpdateScenesCallback>
        ) {
            try {
                console.log({ projectId: job.projectId, sceneIds: sceneIds.length, updates: updates.length }, `Updating scenes`);
                if (saveToDb) {
                    await this.projectRepository.updateScenes(updates);
                }

                await this.publishPipelineEvent({
                    type: "SCENE_UPDATE",
                    projectId: job.projectId,
                    payload: { sceneIds, updates },
                    timestamp: new Date().toISOString(),
                });
            } catch (error) {
                console.error({ error, functionName: "sendUpdateScenes", projectId: job.projectId, jobId: job.id, workerId: this.workerId }, `Error updating scenes`);
                throw error;
            }
        }
        return sendUpdateScenes.bind(this);
    };


    private createSaveAssetsCallback = (job: Job): SaveAssetsCallback => {
        async function saveAssets(
            this: WorkerService,
            ...[ scope, assetKeys, type, assets, metadata, setBest = true ]: SaveAssetsCallbackArgs
        ) {
            try {
                const assetHistories = await this.getAgents(job.projectId).assetManager.createVersionedAssets(
                    scope,
                    assetKeys,
                    type,
                    assets,
                    metadata.map(m => ({ ...m, jobId: job.id })) as AssetVersion[ 'metadata' ][],
                    setBest
                );

                const payload = assetHistories.map((history, index) => ({
                    entityId: entityIdAt(scope).ids[index],
                    assetKey: assetKeys[ index ] ?? assetKeys[ 0 ],
                    history: history,
                }));

                await this.publishPipelineEvent({
                    type: "NEW_ASSETS_BATCH",
                    projectId: job.projectId,
                    payload: payload,
                    timestamp: new Date().toISOString(),
                });
            } catch (error) {
                console.error({ error, functionName: "saveAssets", projectId: job.projectId, jobId: job.id, workerId: this.workerId }, `Error saving assets`);
                throw error;
            }
        }
        return saveAssets.bind(this);
    };

    private createAttemptMetricCallback = (job: Job, startTime = Date.now()): RecordMetricsCallback => {
        async function saveMetric(
            this: WorkerService,
            ...[ attemptMetrics ]: Parameters<RecordMetricsCallback>): Promise<WorkflowMetrics | undefined> {
            try {
            const endTime = Date.now();
            const attemptDuration = endTime - startTime;

            const metricsArray = Array.isArray(attemptMetrics) ? attemptMetrics : [ attemptMetrics ];

            const versionMetrics: Omit<VersionMetric,"regression">[] = metricsArray.map(m => ({
                ...m,
                startTime,
                endTime,
                attemptDuration,
                jobId: job.id,
                trendHistory: [],
            }));

            const assetKeys = versionMetrics.map(m => m.assetKey);

            return recordVersionMetric(job.projectId, assetKeys, versionMetrics);
            } catch (error) {
                console.error({ error, functionName: "saveMetric", projectId: job.projectId, jobId: job.id, workerId: this.workerId });
            }
        }
        return saveMetric.bind(this);
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

        let [ job, claimedAtISO ] = claim;
        const startTime = new Date(claimedAtISO).getTime();

        await logContextStore.run({
            jobId: job.id,
            jobUniqueKey: job.uniqueKey,
            projectId: job.projectId,
            w_id: this.workerId,
            correlationId: uuidv7(),
            shouldPublish: true
        }, async () => {
            try {

                await this.publishJobEvent({ type: "JOB_STARTED", jobId });
                console.log({ job, startTime }, `Executing job.`);

                const controller = new AbortController();
                const agents = this.getAgents(job.projectId, controller.signal);

                let updated: Project;
                switch (job.type) {
                    case "EXPAND_CREATIVE_PROMPT": {
                        try {
                            let project = await this.projectRepository.getProject(job.projectId);
                            if (!project.metadata.initialPrompt) throw new Error("No user prompt provided");

                            try {
                                let { data, metadata } = await agents.compositionalAgent.expandCreativePrompt(
                                    project.metadata.title,
                                    project.metadata.initialPrompt,
                                    { maxRetries: 3, attempt: 1, initialDelay: 1000, projectId: job.projectId }
                                );

                                try {
                                    updated = await this.projectRepository.updateProject(project.id, {
                                        metadata: {
                                            ...project.metadata, enhancedPrompt: data.expandedPrompt,
                                        }
                                    });
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                                    throw new Error(`Failed to update project: ${updateError.message}`);
                                }
                            } catch (generateError: any) {
                                console.error({ error: generateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to generate");
                                throw new Error(`Failed to generate: ${generateError.message}`);
                            }
                        } catch (caseError: any) {
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
                            throw caseError;
                        }
                        break;
                    }

                    case "GENERATE_STORYBOARD": {
                        try {
                            let project = await this.projectRepository.getProject(job.projectId);
                            if (!project.metadata.enhancedPrompt) throw new Error("No enhanced prompt available");

                            try {
                                let { data, metadata } = await agents.compositionalAgent.generateStoryboardExclusivelyFromPrompt(
                                    project.metadata.title,
                                    project.metadata.enhancedPrompt,
                                    { attempt: job.attempts.currentAttempt, maxRetries: job.attempts.maxRetries, projectId: job.projectId },
                                );

                                try {
                                    const characters: Character[] = data.storyboardAttributes.characters.map((character) => mapDomainCharacterToInsertCharacterDb({
                                        ...character,
                                        projectId: project.id,
                                    }));
                                    const locations: Location[] = data.storyboardAttributes.locations.map((location) => mapDomainLocationToInsertLocationDb({
                                        ...location,
                                        projectId: project.id,
                                    }));
                                    const scenes: Scene[] = data.storyboardAttributes.scenes.map(({ characterReferenceIds, ...s }) => {
                                        const sceneEntity: SceneEntity = mapDomainSceneToInsertSceneDb({
                                            ...s,
                                            projectId: project.id,
                                            locationId: mapReferenceIdsToIds(locations, [ s.locationReferenceId ])[ 0 ],
                                        });
                                        const characterIds: string[] = mapReferenceIdsToIds(characters, characterReferenceIds);
                                        return Scene.parse({
                                            ...sceneEntity,
                                            characterReferenceIds,
                                            characterIds,
                                            progressMessage: ""
                                        });
                                    });

                                    await this.projectRepository.createCharacters(project.id, characters);
                                    await this.projectRepository.createLocations(project.id, locations);
                                    await this.projectRepository.createScenes(project.id, scenes);

                                    const updateMetadata: ProjectMetadata = { ...project.metadata, ...data.storyboardAttributes.metadata };
                                    const storyboard: Storyboard = {
                                        ...data.storyboardAttributes,
                                        metadata: updateMetadata,
                                        scenes,
                                        characters,
                                        locations,
                                    };

                                    await this.createSaveAssetsCallback(job)({ projectId: project.id }, [ 'storyboard' ], 'text', [ JSON.stringify(storyboard) ], [ { model: metadata.model } ]);
                                    updated = await this.projectRepository.updateProject(project.id, { ...project, metadata: updateMetadata, storyboard, scenes, characters, locations });
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                                    throw new Error(`Failed to update project: ${updateError.message}`);
                                }
                            } catch (generateError: any) {
                                console.error({ error: generateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to generate storyboard");
                                throw new Error(`Failed to generate: ${generateError.message}`);
                            }
                        } catch (caseError: any) {
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
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

                                    await this.createSaveAssetsCallback(job)({ projectId: project.id }, [ "audio_analysis" ], 'text', [ JSON.stringify(data.analysis) ], [ { model: metadata.model } ]);

                                    const projectMetadata: ProjectMetadata = { ...project.metadata, ...analysisData };
                                    const storyboard: Storyboard = { metadata: projectMetadata, scenes: [], characters: [], locations: [] };

                                    project = { ...project, status: "pending", metadata: projectMetadata, storyboard, audioAnalysis: data.analysis };

                                    updated = await this.projectRepository.updateProject(job.projectId, project);
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                                    throw new Error(`Failed to update project: ${updateError.message}`);
                                }
                            } catch (processError: any) {
                                console.error({ model: this.textModel.textModel, error: processError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to process audio");
                                throw new Error(`Failed to process: ${processError.message}`);
                            }
                        } catch (caseError: any) {
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
                            throw caseError;
                        }
                        break;
                    }

                    case "ENHANCE_STORYBOARD": {
                        try {
                            let project = await this.projectRepository.getProject(job.projectId);
                            if (!project?.storyboard || !project.storyboard.scenes) throw new Error("No scenes available.");
                            if (!project?.metadata.enhancedPrompt) throw new Error("No enhanced prompt available.");

                            try {
                                let data: GenerativeResultEnhanceStoryboard[ 'data' ];
                                let metadata: GenerativeResultEnhanceStoryboard[ 'metadata' ];

                                if (project.metadata.hasAudio && project.audioAnalysis) {
                                    ({ data, metadata } = await agents.compositionalAgent.generateFullStoryboard(
                                        project.metadata.title,
                                        project.metadata.enhancedPrompt,
                                        project.audioAnalysis.segments,
                                        { initialDelay: 30000, attempt: job.attempts.currentAttempt, maxRetries: job.attempts.maxRetries, projectId: job.projectId },
                                    ));
                                } else {
                                    ({ data, metadata } = await agents.compositionalAgent.generateFullStoryboard(
                                        project.metadata.title,
                                        project.metadata.enhancedPrompt,
                                        project.storyboard.scenes,
                                        { initialDelay: 30000, attempt: job.attempts.currentAttempt, maxRetries: job.attempts.maxRetries, projectId: job.projectId },
                                    ));
                                }

                                try {
                                    const characters: Character[] = data.storyboardAttributes.characters.map((character) => mapDomainCharacterToInsertCharacterDb({
                                        ...character,
                                        projectId: project.id,
                                    }));
                                    const locations: Location[] = data.storyboardAttributes.locations.map((location) => mapDomainLocationToInsertLocationDb({
                                        ...location,
                                        projectId: project.id,
                                    }));
                                    const scenes: Scene[] = data.storyboardAttributes.scenes.map(({ characterReferenceIds, ...s }) => {
                                        const sceneEntity: SceneEntity = mapDomainSceneToInsertSceneDb({
                                            ...s,
                                            projectId: project.id,
                                            locationId: mapReferenceIdsToIds(locations, [ s.locationReferenceId ])[ 0 ],
                                        });
                                        const characterIds: string[] = mapReferenceIdsToIds(characters, characterReferenceIds);

                                        return Scene.parse({
                                            ...sceneEntity,
                                            characterReferenceIds,
                                            characterIds,
                                            progressMessage: ""
                                        });
                                    });

                                    await this.projectRepository.createCharacters(project.id, characters);
                                    await this.projectRepository.createLocations(project.id, locations);
                                    await this.projectRepository.createScenes(project.id, scenes);

                                    const updateMetadata: ProjectMetadata = { ...project.metadata, ...data.storyboardAttributes.metadata };
                                    const updatedStoryboard: Storyboard = { ...data.storyboardAttributes, characters, locations, scenes, metadata: updateMetadata };
                                    const fullProject: Project = { ...project, storyboard: updatedStoryboard, metadata: updateMetadata, characters, locations, scenes };

                                    updated = await this.projectRepository.updateProject(job.projectId, fullProject);

                                    await this.createSaveAssetsCallback(job)({ projectId: project.id }, [ 'storyboard' ], 'text', [ JSON.stringify(updated.storyboard) ], [ { model: metadata.model } ]);
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                                    throw new Error(`Failed to update project: ${updateError.message}`);
                                }
                            } catch (enhanceError: any) {
                                console.error({ error: enhanceError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to enhance storyboard");
                                throw new Error(`Failed to enhance: ${enhanceError.message}`);
                            }
                        } catch (caseError: any) {
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
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
                                    const proactiveRules = (await import("../shared/prompts/generation-rules-presets.js")).getProactiveRules();
                                    const uniqueRules = Array.from(new Set([ ...proactiveRules, ...data.dynamicRules ]));

                                    project.generationRules = uniqueRules;
                                    project.generationRulesHistory.push(uniqueRules);

                                    updated = await this.projectRepository.updateProject(job.projectId, project);
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                                    throw new Error(`Failed to update project: ${updateError.message}`);
                                }
                            } catch (analysisError: any) {
                                console.error({ error: analysisError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to generate rules");
                                throw new Error(`Failed to generate rules: ${analysisError.message}`);
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
                            const charactersToProcess = job.payload?.characters?.length
                                ? job.payload.characters
                                : project.characters;

                            if (!charactersToProcess.length) {
                                console.log("No characters to process");
                                throw new Error("No characters to process.");
                            }

                            try {
                                let { data, metadata } = await agents.continuityAgent.generateCharacterAssets(
                                    charactersToProcess,
                                    project.generationRules,
                                    this.createSaveAssetsCallback(job),
                                    this.jobControlPlane.createIncrementAttemptHook(job),
                                    this.createAttemptMetricCallback(job)
                                );

                                try {

                                    updated = await this.projectRepository.updateProject(job.projectId, { characters: data.characters });
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                                    throw new Error(`Failed to update project: ${updateError.message}`);
                                }
                            } catch (generateError: any) {
                                console.error({ error: generateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to generate character assets");
                                throw new Error(`Failed to generate: ${generateError.message}`);
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
                            const locationsToProcess = job.payload?.locations?.length
                                ? job.payload.locations
                                : project.locations;

                            if (!locationsToProcess.length) {
                                console.log("No locations to process");
                                throw new Error("No locations to process.");
                            }

                            try {
                                let { data, metadata } = await agents.continuityAgent.generateLocationAssets(
                                    locationsToProcess,
                                    project.generationRules,
                                    this.createSaveAssetsCallback(job),
                                    this.jobControlPlane.createIncrementAttemptHook(job),
                                    this.createAttemptMetricCallback(job)
                                );
                                try {

                                    updated = await this.projectRepository.updateProject(job.projectId, { locations: data.locations });
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                                    throw new Error(`Failed to update project: ${updateError.message}`);
                                }
                            } catch (generateError: any) {
                                console.error({ error: generateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to generate location assets");
                                throw new Error(`Failed to generate: ${generateError.message}`);
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
                                ? project.scenes.filter(scene => job.payload.sceneIds.includes(scene.id))
                                : project.scenes;

                            if (!scenesToProcess.length) {
                                console.log("No scenes to process");
                                throw new Error("No scenes to process.");
                            }

                            try {
                                const result = await agents.continuityAgent.generateSceneFramesBatch(
                                    project,
                                    scenesToProcess,
                                    job.payload.assetKeys,
                                    this.createSaveAssetsCallback(job),
                                    this.createUpdateScenesCallback(job),
                                    this.jobControlPlane.createIncrementAttemptHook(job),
                                    this.createAttemptMetricCallback(job)
                                );

                                if (!result || !result.data) {
                                    throw new Error("Frame generation returned invalid result");
                                }

                                const { data, metadata } = result;
                                try {

                                    updated = await this.projectRepository.updateProject(job.projectId, { scenes: data.updatedScenes });
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                                    throw new Error(`Failed to update project: ${updateError.message}`);
                                }
                            } catch (generateError: any) {
                                console.error({ error: generateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to generate scene frames");
                                throw new Error(`Failed to generate: ${generateError.message}`);
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
                            const scene = project.scenes.find(s => s.id === job.payload.sceneId);
                            if (!scene) throw new Error(`Scene ${job.payload.sceneId} not found`);

                            try {
                                const isAudioGenerated = project.metadata.hasAudio;

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
                                } = await agents.continuityAgent.prepareAndRefineSceneInputs(scene, project, job.payload.overridePrompt, this.createSaveAssetsCallback(job));

                                const [ version ] = await agents.assetManager.getNextVersionNumber({ projectId: job.projectId, sceneIds: [ scene.id ] }, [ 'scene_video' ]);
                                let { data, metadata } = await agents.sceneAgent.generateSceneWithQualityCheck({
                                    scene,
                                    enhancedPrompt,
                                    sceneCharacters,
                                    sceneLocation: location,
                                    previousScene,
                                    version,
                                    characterReferenceImages,
                                    locationReferenceImages,
                                    startFrame: currentSceneStartReferenceImage,
                                    endFrame: currentSceneEndReferenceImage,
                                    generateAudio: isAudioGenerated,
                                    saveAssets: this.createSaveAssetsCallback(job),
                                    sendUpdateScenes: this.createUpdateScenesCallback(job),
                                    incrementAttempt: this.jobControlPlane.createIncrementAttemptHook(job),
                                    saveMetric: this.createAttemptMetricCallback(job),
                                    generationRules,
                                    uniqueId: job.id
                                });

                                try {
                                    const updatedProject = agents.continuityAgent.updateNarrativeState(data.scene, project);

                                    if (metadata.evaluation) {
                                        updatedProject.generationRules = Array.from(new Set(...updatedProject.generationRules, ...extractGenerationRules([ metadata.evaluation ])));
                                    }

                                    const forceRegenerateIndex = project?.forceRegenerateSceneIds.findIndex(id => id === scene.id);
                                    updatedProject.forceRegenerateSceneIds = project.forceRegenerateSceneIds.slice(0, forceRegenerateIndex).concat(project.forceRegenerateSceneIds.slice(forceRegenerateIndex + 1));

                                    updated = await this.projectRepository.updateProject(job.projectId, updatedProject);
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project");
                                    throw new Error(`Failed to update project: ${updateError.message}`);
                                }
                            } catch (generateError: any) {
                                console.error({ error: generateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to generate scene video");
                                throw new Error(`Failed to generate: ${generateError.message}`);
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

                                    await this.createSaveAssetsCallback(job)({ projectId: job.projectId }, [ 'render_video' ], 'video', [ videoGcsUri ], [ { model: this.videoModel.model, duration } ]);
                                    await this.createSaveAssetsCallback(job)({ projectId: job.projectId }, [ 'thumbnail' ], 'image', [ thumbnailGcsUri ], [ { model: this.videoModel.model } ]);

                                    updated = await this.projectRepository.getProjectFullState(job.projectId);
                                } catch (updateError: any) {
                                    console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to finalize video render");
                                    throw new Error(`Failed to update project: ${updateError.message}`);
                                }
                            } catch (renderError: any) {
                                console.error({ error: renderError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to stitch scenes");
                                throw new Error(`Failed to render: ${renderError.message}`);
                            }
                        } catch (caseError: any) {
                            console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
                            throw caseError;
                        }
                        break;
                    }

                    // case "FRAME_RENDER": {
                        // try {
                        //     try {
                        //         let payload = job.payload;

                        //         const projectCharacters = await this.projectRepository.getProjectCharacters(job.projectId);
                        //         const projectLocations = await this.projectRepository.getProjectLocations(job.projectId);
                        //         const projectScenes = await this.projectRepository.getProjectScenes(job.projectId);
                        //         const scene = projectScenes.find(s => s.id === payload.sceneId);
                        //         if (!scene) {
                        //             console.error(`[WorkflowOperator.regenerateFrame] Scene not found`);
                        //             return;
                        //         }

                        //         const sceneCharacters = projectCharacters.filter(char => scene.characterIds.includes(char.id));
                        //         const sceneLocation = projectLocations.find(loc => loc.id === scene.locationId)!;
                        //         const previousScene = projectScenes.find(s => s.sceneIndex === scene.sceneIndex - 1);
                        //         const previousSceneAssets = previousScene?.assets;

                        //         const allReferenceImages = [...payload.previousFrameReferenceImage, ...payload.referenceImages];
                                    
                        //         await agents.frameCompositionAgent.generateImage(
                        //             payload.scene,
                        //             payload.prompt,
                        //             payload.framePosition,
                        //             payload.sceneCharacters,
                        //             payload.sceneLocations,
                        //             payload.previousFrame,
                        //             payload.referenceImages,
                        //             this.createSaveAssetsCallback(job),
                        //             this.createUpdateScenesCallback(job),
                        //             this.jobControlPlane.createIncrementAttemptHook(job),
                        //             this.createAttemptMetricCallback(job),
                        //             job.id,
                        //         );
                        //         try {

                        //             updated = await this.projectRepository.getProjectFullState(job.projectId);
                        //         } catch (updateError: any) {
                        //             console.error({ error: updateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to update project state");
                        //             throw new Error(`Failed to update project: ${updateError.message}`);
                        //         }
                        //     } catch (generateError: any) {
                        //         console.error({ error: generateError, jobType: job.type, jobId, projectId: job.projectId }, "Failed to generate frame image");
                        //         throw new Error(`Failed to generate: ${generateError.message}`);
                        //     }
                        // } catch (caseError: any) {
                        //     console.error({ error: caseError, jobType: job.type, jobId, projectId: job.projectId }, "Job case failed");
                        //     throw caseError;
                        // }
                        // break;
                    // }

                    default:
                        throw new Error(`Unknown job type: ${JSON.stringify(job)}`);
                }

                const endTime = Date.now();
                const durationMs = endTime - startTime;
                this.publishStateUpdate(updated);

                job = await this.jobControlPlane.updateJobSafe(jobId, job.attempts.currentAttempt, { state: "COMPLETED" });
                this.publishJobEvent({ type: "JOB_COMPLETED", jobId, projectId: job.projectId });

                console.log({ job, durationMs }, `Job completed in ${durationMs / 1000}s`);

            } catch (error: any) {
                console.error({
                    error: {
                        name: error.name,
                        message: error.message,
                        stack: error.stack,  // Add this!
                        ...(error.cause && { cause: error.cause }), // Include cause if present
                    },
                    job,
                    jobType: job.type,  // Make it easier to identify which case failed
                }, "Execution failed");

                await this.jobControlPlane.updateJobSafeAndIncrementAttempt(jobId, job.attempts.currentAttempt, { state: "FAILED", error: (error.message as string).slice(0, 80) });
                await this.publishJobEvent({
                    type: "JOB_FAILED", jobId, error: `${error.name}: ${error.message}`.slice(0, 200),
                });
            }
        });
    }
}
