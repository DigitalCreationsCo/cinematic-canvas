import { PipelineCommand, PipelineEvent } from "../shared/types/pipeline.types.js";
import { Project, ProjectMetadata, Storyboard, WorkflowState } from "../shared/types/index.js";
import { CinematicVideoWorkflow } from "./graph.js";
import { CheckpointerManager } from "./checkpointer-manager.js";
import { RunnableConfig } from "@langchain/core/runnables";
import { Command, CompiledStateGraph, START } from "@langchain/langgraph";
import { handleStream } from "./helpers/stream-helper.js";
import { GCPStorageManager } from "../shared/services/storage-manager.js";
import { JobControlPlane } from "../shared/services/job-control-plane.js";
import { v7 as uuidv7 } from 'uuid';
import { ProjectRepository } from "../shared/services/project-repository.js";
import { mergeParamsIntoState } from "../shared/utils/utils.js";
import { getAllBestAssets } from "../shared/utils/assets-utils.js";
import { DistributedLockManager } from "../shared/services/lock-manager.js";
import { AssetVersionManager } from "../shared/services/asset-version-manager.js";



export class WorkflowOperator {
    private checkpointerManager: CheckpointerManager;
    private controlPlane: JobControlPlane;
    publishEvent: (event: PipelineEvent) => Promise<void>;
    private projectRepository: ProjectRepository;
    private lockManager: DistributedLockManager;
    private activeControllers: Map<string, AbortController> = new Map();
    private gcpProjectId: string;
    private bucketName: string;

    constructor(
        checkpointerManager: CheckpointerManager,
        controlPlane: JobControlPlane,
        publishEvent: (event: PipelineEvent) => Promise<void>,
        projectRepository: ProjectRepository,
        lockManager: DistributedLockManager,
        gcpProjectId: string,
        bucketName: string
    ) {
        this.checkpointerManager = checkpointerManager;
        this.controlPlane = controlPlane;
        this.projectRepository = projectRepository;
        this.lockManager = lockManager;

        this.gcpProjectId = gcpProjectId;
        this.bucketName = bucketName;
        
        this.publishEvent = publishEvent;
    }

    public getAbortController(projectId: string): AbortController {
        let controller = this.activeControllers.get(projectId);
        if (!controller || controller.signal.aborted) {
            controller = new AbortController();
            this.activeControllers.set(projectId, controller);
        }
        return controller;
    }

    private getWorkflowInstance(projectId: string, controller?: AbortController): CinematicVideoWorkflow {
        const workflow = new CinematicVideoWorkflow({
            gcpProjectId: this.gcpProjectId,
            projectId,
            bucketName: this.bucketName,
            jobControlPlane: this.controlPlane,
            lockManager: this.lockManager,
            controller
        });
        workflow.publishEvent = this.publishEvent;
        return workflow;
    }

    private async withProjectLock<T>(projectId: string, action: () => Promise<T>): Promise<T> {
        const lockAcquired = await this.lockManager.acquireLock(projectId, {
            lockTTL: 60000,
            heartbeatInterval: 20000,
        });

        if (!lockAcquired) {
            console.error(`[WorkflowOperator] ❌ Failed to acquire lock for project ${projectId}. Another operation is likely in progress.`);
            throw new Error(`Project ${projectId} is currently locked by another process.`);
        }

        try {
            return await action();
        } finally {
            await this.lockManager.releaseLock(projectId);
        }
    }

    private async getCompiledGraph(projectId: string, controller?: AbortController): Promise<CompiledStateGraph<WorkflowState, Partial<WorkflowState>, string>> {
        const workflow = this.getWorkflowInstance(projectId, controller);
        const checkpointer = this.checkpointerManager.getCheckpointer();
        if (!checkpointer) {
            throw new Error("Checkpointer not initialized");
        }
        return workflow.graph.compile({ checkpointer });
    }

    private getRunnableConfig(projectId: string): RunnableConfig {
        const controller = this.getAbortController(projectId);
        return {
            configurable: { thread_id: projectId },
            signal: controller.signal
        };
    }

    public async stopPipeline(projectId: string) {
        console.log(`[WorkflowOperator.stopPipeline] Stopping pipeline ${projectId}`, { projectId });
        const controller = this.activeControllers.get(projectId);
        if (controller) {
            controller.abort();
            this.activeControllers.delete(projectId);
            console.log(`[WorkflowOperator] Aborted controller for ${projectId}`);
        } else {
            console.warn(`[WorkflowOperator] No active controller found for ${projectId} to stop.`, { projectId });
        }
    }

    async startPipeline(projectId: string, payload: Extract<PipelineCommand, { type: "START_PIPELINE"; }>[ 'payload' ]) {
        
        return this.withProjectLock(projectId, async () => {
            const initialProject = await this.buildInitialProject(projectId, payload);

            const inserted = await this.projectRepository.createProject(initialProject);
            
            const config = this.getRunnableConfig(projectId);
            const state: WorkflowState = WorkflowState.parse({
                id: inserted.id,
                projectId: inserted.id,
                project: null,
                hasAudio: inserted.metadata.hasAudio,
                currentSceneIndex: inserted.currentSceneIndex,
            });

            await this.publishEvent({
                type: "WORKFLOW_STARTED",
                projectId: inserted.id,
                payload: { project: inserted },
                timestamp: new Date().toISOString()
            });
            
            const graph = await this.getCompiledGraph(projectId, this.getAbortController(projectId));
            const stream = await graph.stream(state, {
                ...config,
                streamMode: [ "values" ],
                recursionLimit: 100,
            });
            try {
                await handleStream(projectId, stream, "startPipeline", this.publishEvent);
            } finally {
                this.activeControllers.delete(projectId); // Ensure memory is cleared
            }
        });
    }


    async resumePipeline(projectId: string, options?: { forceRestart?: boolean, resumeValue?: any; }) {

        return this.withProjectLock(projectId, async () => {
            const project = await this.projectRepository.getProject(projectId);

            const config = this.getRunnableConfig(projectId);
            const graph = await this.getCompiledGraph(projectId, this.getAbortController(projectId));
            const snapshot = await graph.getState(config);

            console.debug({
                projectId, config, snapshot,
                nextNodes: snapshot.next, // If this is empty and input is null, graph won't run.
                snapshotHasValues: !!snapshot.values
            }, `Inspecting state`);    

            let input: Command | null = null;

            if (options?.forceRestart || !snapshot.next.length) {
                console.debug({ projectId, functionName: this.resumePipeline[ 'name' ] }, 'Restarting thread from START');
                input = new Command({
                    goto: START,
                    update: {
                        currentSceneIndex: project.currentSceneIndex || 0,
                        errors: [],
                        nodeAttempts: {},
                        __interrupt__: undefined
                    }
                });
            }

            const isInterrupted = snapshot.tasks.some(task => task.interrupts.some(i => i.value.type));
            if (isInterrupted && options?.resumeValue) {
                console.log({ projectId, functionName: this.resumePipeline[ 'name' ] }, 'Resuming from interrupt with provided value.');
                input = new Command({
                    resume: options.resumeValue,
                    update: {
                        __interrupt__: undefined,
                        __interrupt_resolved__: true,
                    },
                });
            }

            // Handle Retry / Unresolved State
            // If we haven't built an input yet, but the graph has pending nodes (snapshot.next),
            // we must explicitly tell it to 'goto' those nodes to resume execution.
            if (!input && snapshot.next && snapshot.next.length > 0) {
                console.log({ projectId, nextNodes: snapshot.next }, 'Triggering retry on pending nodes via Command.');
                input = new Command({
                    goto: snapshot.next,
                    resume: options?.resumeValue,
                    update: {
                        __interrupt__: undefined,
                        __interrupt_resolved__: true,
                    },
                });
            }

            const stream = await graph.stream(input, {
                ...config,
                streamMode: [ "values" ],
                recursionLimit: 100,
            });
            try {
                await handleStream(projectId, stream, "resumePipeline", this.publishEvent);
            } finally {
                this.activeControllers.delete(projectId);
            }
        });
    }


    async regenerateScene(projectId: string, { sceneId, promptModification, forceRegenerate }: Extract<PipelineCommand, { type: "REGENERATE_SCENE"; }>[ 'payload' ]) {
        return this.withProjectLock(projectId, async () => {
            const config = this.getRunnableConfig(projectId);
            const existingCheckpoint = await this.checkpointerManager.loadCheckpoint(config);
            if (!existingCheckpoint) {
                console.warn(`[WorkflowOperator.regenerateScene] No checkpoint found to regenerate scene ${sceneId}`);
            }

            await this.projectRepository.appendProjectForceRegenerateSceneIds(projectId, [ sceneId ]);

            const command = new Command({
                goto: "process_scene",
            });

            const graph = await this.getCompiledGraph(projectId, this.getAbortController(projectId));
            const stream = await graph.stream(command, {
                ...config,
                streamMode: [ "values" ],
                recursionLimit: 100,
            });
            
            try {
                await handleStream(projectId, stream, "regenerateScene", this.publishEvent);
            } finally {
                this.activeControllers.delete(projectId); // Ensure memory is cleared
            }
        });
    }


    async resolveIntervention(projectId: string, payload: Extract<PipelineCommand, { type: "RESOLVE_INTERVENTION"; }>[ 'payload' ]) {
        return this.withProjectLock(projectId, async () => {
            try {

                const config = this.getRunnableConfig(projectId);   
            const existingCheckpoint = await this.checkpointerManager.loadCheckpoint(config);
            if (!existingCheckpoint) {
                throw new Error(`No checkpoint found for ${projectId}`);
            }

            const state = WorkflowState.parse(existingCheckpoint.channel_values as WorkflowState);
            const interrupt = state.__interrupt__?.[ 0 ]?.value;
            if (!interrupt) {
                console.warn(`[WorkflowOperator] No interrupt to resolve`);
                return;
            }

            let command: Command;
                if (payload.action === 'abort') {
                    const updatedState = { __interrupt__: undefined, __interrupt_resolved__: true };
                    await this.checkpointerManager.saveCheckpoint(config, existingCheckpoint, updatedState);

                    await this.publishEvent({
                        commandId: uuidv7(),
                        type: "WORKFLOW_FAILED",
                        projectId: projectId,
                        payload: { error: "Workflow canceled", nodeName: interrupt.nodeName },
                        timestamp: new Date().toISOString()
                    });
                    return;

                } else if (payload.action === 'skip') {
                    const updatedState = {
                        __interrupt__: undefined,
                        __interrupt_resolved__: true,
                        // errors: [ {
                        //     projectId,
                        //     node: interrupt.nodeName,
                        //     error: interrupt.error,
                        //     shouldRetry: false,
                        //     timestamp: new Date().toISOString()
                        // } ]
                    };
                    command = new Command({ resume: updatedState });

                } else {

                    const { revisedParams, action, jobType } = payload;

                    switch (jobType) {
                        case "GENERATE_SCENE_VIDEO": {
                            const sceneId = revisedParams.sceneId;
                            const promptModification = revisedParams.overridePrompt || revisedParams.prompt;

                            await this.controlPlane.createJob({
                                projectId: projectId,
                                type: "GENERATE_SCENE_VIDEO",
                                assetKey: "scene_video",
                                uniqueKey: this.controlPlane.uniqueKey(sceneId, 'scene_video'),
                                workflowId: projectId,
                                payload: {
                                    sceneId,
                                    overridePrompt: promptModification,
                                },
                            });
                        }
                            break;
                        default: {
                            console.log({ jobType, revisedParams, interrupt, action }, `Resolving intervention`);
                    // const paramsToUse = revisedParams
                    //     ? { ...(interrupt.params || {}), ...revisedParams }
                    //     : (interrupt.params || {});

                            const updatedState = {
                                // ...mergeParamsIntoState(state, paramsToUse),
                                __interrupt__: undefined,
                                __interrupt_resolved__: true,
                            };
                            command = new Command({ resume: updatedState });

                            const graph = await this.getCompiledGraph(projectId, this.getAbortController(projectId));
                            const stream = await graph.stream(command, {
                                ...config,
                                streamMode: [ "values" ],
                                recursionLimit: 100,
                            });
                            await handleStream(projectId, stream, "resolveIntervention", this.publishEvent);
                        }
                            break;
                    }
                }
            } finally {
                this.activeControllers.delete(projectId); 
            }
        });
    }


    async updateSceneAsset(projectId: string, { scene, assetKey, version }: Extract<PipelineCommand, { type: "UPDATE_SCENE_ASSET"; }>[ 'payload' ]) {

        console.log(`[WorkflowOperator] Updating ${assetKey} for scene ${scene.id} to version ${version}`);
        const assetManager = new AssetVersionManager(this.projectRepository);

        // 1. Update Asset History in DB
        // If version is null, we treat it as "unsetting" the best version (set to 0)
        const targetVersion = version === null ? 0 : version;
        await assetManager.setBestVersion({ projectId, sceneIds: [ scene.id ] }, [ assetKey ], [ targetVersion ]);

        // 2. Refresh Scene State
        // We must fetch the latest scene from DB because assetManager has updated the 'assets' column
        // and potentially some flat fields. Our local 'scene' object is now stale.
        const [updatedScene] = await this.projectRepository.getScenesByIds([scene.id]);

        // 3. Determine the data for the selected version
        const sceneAssets = getAllBestAssets(updatedScene.assets);
        const bestVersionData = sceneAssets[assetKey]?.data || "";

        // 4. Sync Flat Fields
        // AssetManager syncs 'generatedVideo' but NOT 'startFrame' or 'endFrame'.
        // We manually ensure these fields match the selected version.
        let needsUpdate = false;

        // 'scene_video' -> 'generatedVideo' is handled by AssetManager, but we check for status updates.
        if (assetKey === 'scene_video') {
            // If we have valid video data and status isn't complete, mark it complete.
            if (bestVersionData && updatedScene.status !== 'complete') {
                await this.projectRepository.updateScenes([{id: updatedScene.id, projectId: updatedScene.projectId, sceneIndex: updatedScene.sceneIndex, status: 'complete'}]);
                // Status update saves to DB, so we might not need another save unless other fields changed.
                // However, to be safe if start/end frames also changed in this same logic (unlikely but possible in future), we keep needsUpdate logic separate.
            }
        }

        // 5. Persist Flat Field Updates if necessary
        if (needsUpdate) {
            await this.projectRepository.updateScenes([ updatedScene ]);
        }

        // 6. Broadcast new state
        await this.getProjectState(projectId);
    }

    async getProjectState(projectId: string) {
        try {
            const project = await this.projectRepository.getProjectFullState(projectId);
            await this.publishEvent({
                type: "FULL_STATE",
                commandId: uuidv7(),
                projectId,
                payload: {
                    project
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error({ projectId, functionName: 'getProjectState', error });
        }
        return;
    }

    private async buildInitialProject(projectId: string, payload: Extract<PipelineCommand, { type: "START_PIPELINE"; }>[ 'payload' ]): Promise<Project> {

        try {
            console.log(`[WorkflowOperator] Building initial state from DB for ${projectId}`);
            const project = await this.projectRepository.getProject(projectId);

            if (project) {
                return Project.parse(project);
            }
        } catch (error) {
            console.warn({ shouldPublish: false }, "No existing project found in DB. ");
            console.log("Starting fresh workflow");
        }

        const sm = new GCPStorageManager(this.gcpProjectId, this.bucketName);

        let { guidanceLevel, audioGcsUri, initialPrompt, title, systemInstructions, negativePrompt } = payload;
        let audioPublicUri;
        if (audioGcsUri) {
            audioPublicUri = sm.getPublicUrl(audioGcsUri);
        }

        const metadata = ProjectMetadata.parse({
            projectId: projectId,
            title: title,
            initialPrompt: initialPrompt,
            audioGcsUri: audioGcsUri,
            audioPublicUri: audioPublicUri,
            hasAudio: !!audioGcsUri,
        });

        const storyboard = Storyboard.parse({ metadata });

        return Project.parse({
            id: projectId,
            metadata,
            storyboard,
            guidanceLevel,
            // systemInstructions, // not included in schema yet
            // negativePrompt,
        });
    }

}
