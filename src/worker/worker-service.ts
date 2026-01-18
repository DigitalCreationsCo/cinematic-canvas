import { JobControlPlane } from "../pipeline/services/job-control-plane";
import { GenerativeResultEnvelope, JobEvent, JobRecord, JobType } from "../shared/types/job.types";
import { GCPStorageManager } from "../workflow/storage-manager";
import { TextModelController } from "../workflow/llm/text-model-controller";
import { VideoModelController } from "../workflow/llm/video-model-controller";
import { AudioProcessingAgent } from "../workflow/agents/audio-processing-agent";
import { CompositionalAgent } from "../workflow/agents/compositional-agent";
import { QualityCheckAgent } from "../workflow/agents/quality-check-agent";
import { SemanticExpertAgent } from "../workflow/agents/semantic-expert-agent";
import { FrameCompositionAgent } from "../workflow/agents/frame-composition-agent";
import { SceneGeneratorAgent } from "../workflow/agents/scene-generator";
import { ContinuityManagerAgent } from "../workflow/agents/continuity-manager";
import { VersionMetric, AssetVersion, Scene, Project } from "../shared/types/workflow.types";
import { SaveAssetsCallback, PipelineEvent, UpdateSceneCallback, GetAttemptMetricCallback, OnAttemptCallback } from "../shared/types/pipeline.types";
import { ProjectRepository } from "../pipeline/project-repository";
import { MediaController } from "../workflow/media-controller";
import { AssetVersionManager } from "../workflow/asset-version-manager";
import { logContextStore } from "../shared/logger";
import { DistributedLockManager } from "../pipeline/services/lock-manager";
import { v7 as uuidv7 } from 'uuid';
import { videoModelName } from "../workflow/llm/google/models";
import { extractGenerationRules } from "src/workflow/prompts/prompt-composer";



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

    /**
     * Retrieve agents with tenant-hydrated functionality
     * @param projectId 
     * @param signal 
     * @returns 
     */
    private getAgents(projectId: string, signal?: AbortSignal) {

        const assetManager = new AssetVersionManager(this.projectRepository);
        const storageManager = new GCPStorageManager(this.gcpProjectId, projectId, this.bucketName);
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

        return {
            assetManager,
            storageManager,
            audioProcessingAgent: new AudioProcessingAgent(this.textModel, storageManager, mediaController, agentOptions),
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

    /**
     * Processes a dispatched job by claiming it and executing the relevant agent logic.
     * Uses AsyncLocalStorage to ensure all logs and agent sub-tasks are traceable.
     * @param jobId - The ID of the job dispatched by the system.
     */
    async processJob(jobId: string) {

        const claim = await this.jobControlPlane.claimJob(jobId);
        if (!claim) {
            console.warn(`[Worker] Job ${jobId} unavailable or concurrency limit reached.`);
            return;
        }

        const [ job, claimedAtISO ] = claim;
        const startTime = new Date(claimedAtISO).getTime();

        await logContextStore.run({
            jobId: job.id,
            jobUniqueKey: job.uniqueKey,
            projectId: job.projectId,
            w_id: this.workerId,
            correlationId: uuidv7(),
            shouldPublishLog: false
        }, async () => {
            try {

                await this.publishJobEvent({ type: "JOB_STARTED", jobId });
                console.log(`[Worker ${this.workerId}] Executing work for job ${jobId} (${job.type})`);

                const controller = new AbortController();
                const agents = this.getAgents(job.projectId, controller.signal);

                const updateScene: UpdateSceneCallback = async (scene, saveToDb = true) => {
                    console.log(`[Job ${jobId}] Progress: ${scene.progressMessage}`);
                    if (saveToDb) this.projectRepository.updateScenes([ scene ]);

                    this.publishPipelineEvent({
                        type: "SCENE_UPDATE",
                        projectId: job.projectId,
                        payload: { scene },
                        timestamp: new Date().toISOString(),
                    });
                };

                const createIncrementer = (jobId: string): OnAttemptCallback => async (attempt: number) => {
                    this.jobControlPlane.updateJobSafeAndIncrementAttempt(jobId, attempt);
                };

                const getAttemptMetric = (): GetAttemptMetricCallback => (attemptMetric): VersionMetric => {
                    const endTime = Date.now();
                    const attemptDuration = endTime - startTime;
                    const versionMetric = {
                        ...attemptMetric,
                        endTime,
                        attemptDuration,
                        jobId,
                    };
                    return versionMetric;
                    // save the metric here or after calling
                };
                const saveMetric = getAttemptMetric();

                const saveAssets: SaveAssetsCallback = async (...[ scope, assetKey, type, assets, metadata, setBest ]) => {
                    await agents.assetManager.createVersionedAssets(
                        scope,
                        assetKey,
                        type,
                        assets,
                        { ...metadata, jobId } as AssetVersion[ 'metadata' ],
                        setBest
                    );
                };

                type JobResultType<T extends JobType> = Extract<JobRecord, { type: T; }>[ 'result' ];

                let data!: JobResultType<typeof job.type>;
                let metadata: GenerativeResultEnvelope<typeof job.result>[ 'metadata' ];

                switch (job.type) {
                    case "EXPAND_CREATIVE_PROMPT": {

                        let project = await this.projectRepository.getProject(job.projectId);

                        ({ data, metadata } = await agents.compositionalAgent.expandCreativePrompt(
                            job.payload.title,
                            job.payload.initialPrompt,
                            { maxRetries: 3, attempt: 1, initialDelay: 1000, projectId: job.projectId }
                        ));

                             await this.projectRepository.updateInitialProject(project.id, {
                            ...project,
                            metadata: {
                                ...project.metadata, enhancedPrompt: data.expandedPrompt,
                            }
                        });

                        await this.jobControlPlane.updateJobSafe(jobId, job.attempt, { state: "COMPLETED", result: data });

                        break;
                    }
                    case "GENERATE_STORYBOARD": {

                        let project = await this.projectRepository.getProject(job.projectId);

                        ({ data, metadata } = await agents.compositionalAgent.generateStoryboardFromPrompt(
                            job.payload.title,
                            job.payload.enhancedPrompt,
                            { attempt: job.attempt, maxRetries: job.maxRetries, projectId: job.projectId },
                            saveAssets
                        ));

                        await this.projectRepository.createScenes(project.id, data.storyboard.scenes);
                        await this.projectRepository.createCharacters(project.id, data.storyboard.characters);
                        await this.projectRepository.createLocations(project.id, data.storyboard.locations);

                        await this.projectRepository.updateInitialProject(project.id, { storyboard: data.storyboard });

                        await this.jobControlPlane.updateJobSafe(jobId, job.attempt, { state: "COMPLETED", result: data });

                        break;
                    }

                    case "PROCESS_AUDIO_TO_SCENES": {

                        let project = await this.projectRepository.getProject(job.projectId);

                        ({ data, metadata } = await agents.audioProcessingAgent.processAudioToScenes(
                            job.payload.audioPublicUri,
                            job.payload.enhancedPrompt,
                        ));

                        const { segments, ...analysisData } = data.analysis;


                        const projetMetadata = {
                            ...project.metadata,
                            ...analysisData,
                        };

                        project = {
                            ...project,
                            status: "pending",
                            metadata: projetMetadata,
                            scenes: segments as Scene[],
                            characters: [],
                            locations: [],
                            storyboard: {
                                metadata: projetMetadata,
                                scenes: segments as Scene[],
                                characters: [],
                                locations: [],
                            },
                        } as Project;

                        await this.projectRepository.updateInitialProject(job.projectId, project);

                        await this.jobControlPlane.updateJobSafe(jobId, job.attempt, { state: "COMPLETED", result: data });

                        break;
                    }
                    case "ENHANCE_STORYBOARD": {

                        let project = await this.projectRepository.getProject(job.projectId);

                        ({ data, metadata } = await agents.compositionalAgent.generateFullStoryboard(
                            job.payload.storyboard,
                            job.payload.enhancedPrompt,
                            { initialDelay: 30000, attempt: job.attempt, maxRetries: job.maxRetries, projectId: job.projectId },
                            saveAssets,
                        ));

                        await this.projectRepository.createScenes(project.id, data.storyboard.scenes);
                        await this.projectRepository.createCharacters(project.id, data.storyboard.characters);
                        await this.projectRepository.createLocations(project.id, data.storyboard.locations);

                        project = {
                            ...project,
                            status: "pending",
                            storyboard: data.storyboard,
                            metadata: data.storyboard.metadata,
                            scenes: data.storyboard.scenes,
                            characters: data.storyboard.characters,
                            locations: data.storyboard.locations,
                        } as Project;

                        await this.projectRepository.updateProject(job.projectId, project);

                        await this.jobControlPlane.updateJobSafe(jobId, job.attempt, { state: "COMPLETED", result: data });

                        break;
                    }
                    case "SEMANTIC_ANALYSIS": {
                        const project = await this.projectRepository.getProjectFullState(job.projectId);

                        ({ data, metadata } = await agents.semanticExpert.generateRules(project.storyboard));

                        const proactiveRules = (await import("../workflow/prompts/generation-rules-presets")).getProactiveRules();
                        const uniqueRules = Array.from(new Set([ ...proactiveRules, ...data.dynamicRules ]));

                        project.generationRules = uniqueRules;
                        project.generationRulesHistory.push(uniqueRules);

                        await this.projectRepository.updateProject(job.projectId, project);

                        await this.jobControlPlane.updateJobSafe(jobId, job.attempt, { state: "COMPLETED", result: data });

                        break;
                    }
                    case "GENERATE_CHARACTER_ASSETS": {

                        ({ data, metadata } = await agents.continuityAgent.generateCharacterAssets(
                            job.payload.characters,
                            job.payload.generationRules,
                            saveAssets,
                            createIncrementer(jobId),
                        ));

                        await this.projectRepository.updateCharacters(data.characters);

                        await this.jobControlPlane.updateJobSafe(jobId, job.attempt, { state: "COMPLETED", result: data });

                        break;
                    }

                    case "GENERATE_LOCATION_ASSETS": {
                        const locations = await this.projectRepository.getProjectLocations(job.projectId);

                        ({ data, metadata } = await agents.continuityAgent.generateLocationAssets(
                            locations,
                            job.payload.generationRules,
                            saveAssets,
                            createIncrementer(jobId),
                        ));

                        await this.projectRepository.updateLocations(data.locations);

                        await this.jobControlPlane.updateJobSafe(jobId, job.attempt, { state: "COMPLETED", result: data });

                        break;
                    }

                    case "GENERATE_SCENE_FRAMES": {
                        const project = await this.projectRepository.getProjectFullState(job.projectId);

                        ({ data, metadata } = await agents.continuityAgent.generateSceneFramesBatch(
                            project,
                            job.assetKey as 'scene_start_frame' | 'scene_end_frame',
                            saveAssets,
                            updateScene,
                            createIncrementer(jobId),
                        ));

                        await this.projectRepository.updateProject(job.projectId, project);

                        await this.jobControlPlane.updateJobSafe(jobId, job.attempt, { state: "COMPLETED", result: data });

                        break;
                    }

                    case "GENERATE_SCENE_VIDEO": {

                        const project = await this.projectRepository.getProjectFullState(job.projectId);
                        const scene = project.scenes[ job.payload.sceneIndex ];
                        const generateAudio = project.metadata.hasAudio;

                        const {
                            enhancedPrompt,
                            characterReferenceImages,
                            locationReferenceImages,
                            sceneCharacters,
                            location,
                            previousScene,
                            generationRules,
                        } = await agents.continuityAgent.prepareAndRefineSceneInputs(scene, project, job.payload.overridePrompt, saveAssets);

                        const assets = scene.assets;
                        const startFrame = assets[ 'scene_start_frame' ]!.versions[ assets[ 'scene_start_frame' ]!.best ].data;
                        const endFrame = assets[ 'scene_end_frame' ]!.versions[ assets[ 'scene_end_frame' ]!.best ].data;

                        const { data, metadata } = await agents.sceneAgent.generateSceneWithQualityCheck({
                            scene,
                            enhancedPrompt,
                            sceneCharacters,
                            sceneLocation: location,
                            previousScene,
                            version: job.payload.version,
                            startFrame: startFrame,
                            endFrame: endFrame,
                            characterReferenceImages,
                            locationReferenceImages,
                            generateAudio,
                            saveAssets,
                            updateScene,
                            onAttempt: createIncrementer(jobId),
                            saveMetric,
                            generationRules
                        });

                        const updatedProject = agents.continuityAgent.updateNarrativeState(data.scene, project);

                        if (metadata.evaluation) {
                            updatedProject.generationRules = Array.from(new Set(...updatedProject.generationRules, ...extractGenerationRules([ metadata.evaluation ])));
                        }

                        const forceRegenerateIndex = project?.forceRegenerateSceneIds.findIndex(id => id === scene.id);
                        updatedProject.forceRegenerateSceneIds = project.forceRegenerateSceneIds.slice(0, forceRegenerateIndex).concat(project.forceRegenerateSceneIds.slice(forceRegenerateIndex + 1));

                        await this.projectRepository.updateProject(job.projectId, updatedProject);

                        await this.jobControlPlane.updateJobSafe(jobId, job.attempt, { state: "COMPLETED", result: data });

                        break;
                    }

                    case "RENDER_VIDEO": {
                        let renderedVideo;
                        if (job.payload.audioGcsUri) {
                            renderedVideo = await agents.audioProcessingAgent.mediaController.stitchScenes(job.payload.videoPaths, job.projectId, job.attempt, job.payload.audioGcsUri);
                        } else {
                            renderedVideo = await agents.audioProcessingAgent.mediaController.stitchScenes(job.payload.videoPaths, job.projectId, job.attempt);
                        }

                        data = { renderedVideo };
                        metadata = { model: videoModelName, attempts: 1, acceptedAttempt: 1 };

                        saveAssets(
                            { projectId: job.projectId },
                            'render_video',
                            'video',
                            [ renderedVideo ],
                            metadata,
                        );

                        await this.jobControlPlane.updateJobSafe(jobId, job.attempt, { state: "COMPLETED", result: data });

                        break;
                    }

                    case "FRAME_RENDER": {
                        let payload = job.payload;

                        ({ data, metadata, } = await agents.frameCompositionAgent.generateImage(
                            payload.scene,
                            payload.prompt,
                            payload.framePosition,
                            payload.sceneCharacters,
                            payload.sceneLocations,
                            payload.previousFrame,
                            payload.referenceImages,
                            saveAssets,
                            updateScene,
                            createIncrementer(jobId),
                        ));

                        await this.jobControlPlane.updateJobSafe(jobId, job.attempt, { state: "COMPLETED", result: data });

                        break;
                    }
                    default:
                        throw new Error(`Unknown job type: ${JSON.stringify(job)}`);
                }

                const endTime = Date.now();
                const durationMs = endTime - startTime;
                this.publishJobEvent({ type: "JOB_COMPLETED", jobId });

                console.log(`[Worker ${this.workerId}] Job ${jobId} completed in ${durationMs}ms`);

            } catch (error: any) {
                console.error(`[Job ${jobId}] Execution failed:`, { error, job });
                await this.jobControlPlane.updateJobSafeAndIncrementAttempt(jobId, job.attempt, { state: "FAILED", error: error.message, attempt: job.attempt + 1 });
                await this.publishJobEvent({ type: "JOB_FAILED", jobId, error: error.message });
            }
        });
    }
}
