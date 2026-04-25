import { GenerateSceneVideoCommand, PipelineCommand, PipelineEvent } from "../shared/types/pipeline.types.js";
import { WorkflowState } from "../shared/types/index.js";
import { CinematicVideoWorkflow } from "./graph.js";
import { CheckpointerManager } from "./checkpointer-manager.js";
import { RunnableConfig } from "@langchain/core/runnables";
import { Command, CompiledStateGraph, START } from "@langchain/langgraph";
import { handleStream } from "./helpers/stream-helper.js";
import { JobControlPlane } from "../shared/services/job-control-plane.js";
import { generateId } from "#shared/utils/id.js";
import { ProjectRepository } from "../shared/services/project-repository.js";
import { DistributedLockManager } from "../shared/services/lock-manager.js";
import { ISacGitService } from "../shared/services/sac/ISacGitService.js";



export class WorkflowOperator {
    private checkpointerManager: CheckpointerManager;
    private controlPlane: JobControlPlane;
    publishEvent: (event: PipelineEvent) => Promise<void>;
    private projectRepository: ProjectRepository;
    private sacRepository: ISacGitService;
    private lockManager: DistributedLockManager;
    private activeControllers: Map<string, AbortController> = new Map();
    private gcpProjectId: string;
    private bucketName: string;

    constructor(
        checkpointerManager: CheckpointerManager,
        controlPlane: JobControlPlane,
        publishEvent: (event: PipelineEvent) => Promise<any>,
        projectRepository: ProjectRepository,
        sacRepository: ISacGitService,
        lockManager: DistributedLockManager,
        gcpProjectId: string,
        bucketName: string
    ) {
        this.checkpointerManager = checkpointerManager;
        this.controlPlane = controlPlane;
        this.projectRepository = projectRepository;
        this.sacRepository = sacRepository;
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

    private getWorkflowInstance(projectId: string, worldId?: string, controller?: AbortController): CinematicVideoWorkflow {
        const workflow = new CinematicVideoWorkflow({
            gcpProjectId: this.gcpProjectId,
            worldId,
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

    private async getCompiledGraph({ projectId, worldId }: { projectId: string, worldId?: string, }, controller?: AbortController): Promise<CompiledStateGraph<WorkflowState, Partial<WorkflowState>, string>> {

        const workflow = this.getWorkflowInstance(projectId, worldId, controller);
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

    async startPipeline(packet: PipelineCommand, payload: Extract<PipelineCommand, { type: "START_PIPELINE"; }>['payload']) {

        const { projectId, worldId, teamId, userId } = packet;
        return this.withProjectLock(projectId, async () => {

            const project = await this.projectRepository.getProjectFullState(projectId);

            const config = this.getRunnableConfig(projectId);
            const state: WorkflowState = WorkflowState.parse({
                id: project.id,
                projectId: project.id,
                worldId: worldId,
                teamId: teamId,
                userId: userId,
                project: project,
                hasAudio: project.metadata.hasAudio,
                currentSceneIndex: project.currentSceneIndex,
            });

            await this.publishEvent({
                type: "WORKFLOW_STARTED",
                projectId: project.id,
                worldId: worldId,
                teamId: teamId,
                userId: userId,
                payload: { project: project },
                timestamp: new Date().toISOString()
            });

            const graph = await this.getCompiledGraph({ projectId, worldId }, this.getAbortController(projectId));
            const stream = await graph.stream(state, {
                ...config,
                streamMode: ["values"],
                recursionLimit: 100,
            });

            try {
                await handleStream(packet, "startPipeline", stream, this.publishEvent, graph, config);
            } finally {
                this.activeControllers.delete(projectId); // Ensure memory is cleared
            }
        });
    }


    async resumePipeline(packet: { projectId: string, worldId?: string, teamId: string, userId: string }, options?: { forceRestart?: boolean, resumeValue?: any; }) {

        const { projectId, worldId, teamId, userId } = packet;
        return this.withProjectLock(projectId, async () => {
            const project = await this.projectRepository.getProject(projectId);

            const config = this.getRunnableConfig(projectId);
            const graph = await this.getCompiledGraph(packet, this.getAbortController(projectId));
            const snapshot = await graph.getState(config);

            console.debug({
                projectId, config, snapshot,
                nextNodes: snapshot.next, // If this is empty and input is null, graph won't run.
                snapshotHasValues: !!snapshot.values
            }, `Inspecting state`);

            let input: Command | null = null;

            if (options?.forceRestart || !snapshot.next.length) {
                console.debug({ projectId, functionName: this.resumePipeline['name'] }, 'Restarting thread from START');
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
                console.log({ projectId, functionName: this.resumePipeline['name'] }, 'Resuming from interrupt with provided value.');
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
                streamMode: ["values"],
                recursionLimit: 100,
            });
            try {
                await handleStream(packet, "resumePipeline", stream, this.publishEvent, graph, config);
            } finally {
                this.activeControllers.delete(projectId);
            }
        });
    }


    async regenerateScene(command: GenerateSceneVideoCommand) {
        const { projectId, worldId, teamId, userId, payload } = command;

        return this.withProjectLock(projectId, async () => {
            const config = this.getRunnableConfig(projectId);
            const existingCheckpoint = await this.checkpointerManager.loadCheckpoint(config);
            if (!existingCheckpoint) {
                console.warn(`[WorkflowOperator.regenerateScene] No checkpoint found to regenerate scene ${payload.sceneId}`);
            }

            await this.projectRepository.appendProjectForceRegenerateSceneIds(projectId, [payload.sceneId]);

            const graph = await this.getCompiledGraph(command, this.getAbortController(projectId));
            const stream = await graph.stream(new Command({
                goto: "process_scene",
            }), {
                ...config,
                streamMode: ["values"],
                recursionLimit: 100,
            });

            try {
                await handleStream(command, "regenerateScene", stream, this.publishEvent, graph, config);
            } finally {
                this.activeControllers.delete(projectId); // Ensure memory is cleared
            }
        });
    }


    async resolveIntervention(packet: PipelineCommand, payload: Extract<PipelineCommand, { type: "RESOLVE_INTERVENTION"; }>['payload']) {

        const { projectId, worldId, teamId, userId } = packet;

        return this.withProjectLock(projectId, async () => {
            try {

                const config = this.getRunnableConfig(projectId);
                const existingCheckpoint = await this.checkpointerManager.loadCheckpoint(config);
                if (!existingCheckpoint) {
                    throw new Error(`No checkpoint found for ${projectId}`);
                }

                const state = WorkflowState.parse(existingCheckpoint.channel_values as WorkflowState);
                const interrupt = state.__interrupt__?.[0]?.value;
                if (!interrupt) {
                    console.warn(`[WorkflowOperator] No interrupt to resolve`);
                    return;
                }

                let command: Command;
                if (payload.action === 'abort') {
                    const updatedState = { __interrupt__: undefined, __interrupt_resolved__: true };
                    await this.checkpointerManager.saveCheckpoint(config, existingCheckpoint, updatedState);

                    await this.publishEvent({
                        commandId: generateId(),
                        type: "WORKFLOW_FAILED",
                        projectId,
                        worldId,
                        teamId,
                        userId,
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
                                worldId,
                                teamId,
                                userId,
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

                            const graph = await this.getCompiledGraph(packet, this.getAbortController(projectId));
                            const stream = await graph.stream(command, {
                                ...config,
                                streamMode: ["values"],
                                recursionLimit: 100,
                            });
                            await handleStream(packet, "resolveIntervention", stream, this.publishEvent, graph, config);
                        }
                            break;
                    }
                }
            } finally {
                this.activeControllers.delete(projectId);
            }
        });
    }


    // async updateSceneAsset(projectId: string, payload: Extract<PipelineCommand, { type: "ENTITY_UPDATED"; }>[ 'payload' ]) {

    //     console.log(`[WorkflowOperator] Updating ${assetKey} for ${entityType} ${entityId} to version ${version}`);
    //     const assetManager = new AssetVersionManager(this.projectRepository);

    //     // 1. Update Asset History in DB
    //     // If version is null, we treat it as "unsetting" the best version (set to 0)
    //     const targetVersion = version === null ? 0 : version;
    //     await assetManager.setBestVersion({ projectId, sceneIds: [ scene.id ] }, [ assetKey ], [ targetVersion ]);

    //     // 2. Refresh Scene State
    //     // We must fetch the latest scene from DB because assetManager has updated the 'assets' column
    //     // and potentially some flat fields. Our local 'scene' object is now stale.
    //     const [updatedScene] = await this.projectRepository.getScenesByIds([scene.id]);

    //     // 3. Determine the data for the selected version
    //     const sceneAssets = getAllBestAssets(updatedScene.assets);
    //     const bestVersionData = sceneAssets[assetKey]?.data || "";

    //     // 4. Sync Flat Fields
    //     // AssetManager syncs 'generatedVideo' but NOT 'startFrame' or 'endFrame'.
    //     // We manually ensure these fields match the selected version.
    //     let needsUpdate = false;

    //     // 'scene_video' -> 'generatedVideo' is handled by AssetManager, but we check for status updates.
    //     if (assetKey === 'scene_video') {
    //         // If we have valid video data and status isn't complete, mark it complete.
    //         if (bestVersionData && updatedScene.status !== 'complete') {
    //             await this.projectRepository.updateScenes([{id: updatedScene.id, projectId: updatedScene.projectId, sceneIndex: updatedScene.sceneIndex, status: 'complete'}]);
    //             // Status update saves to DB, so we might not need another save unless other fields changed.
    //             // However, to be safe if start/end frames also changed in this same logic (unlikely but possible in future), we keep needsUpdate logic separate.
    //         }
    //     }

    //     // 5. Persist Flat Field Updates if necessary
    //     if (needsUpdate) {
    //         await this.projectRepository.updateScenes([ updatedScene ]);
    //     }

    //     // 6. Broadcast new state
    //     await this.getProjectState(projectId);
    // }

    async getProjectState(command: PipelineCommand) {

        const { projectId, worldId, teamId, userId } = command;

        try {
            const project = await this.projectRepository.getProjectFullState(projectId);
            await this.publishEvent({
                type: "FULL_STATE",
                commandId: generateId(),
                projectId,
                worldId,
                teamId,
                userId,
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
}
