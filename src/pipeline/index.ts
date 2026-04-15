// src/pipeline/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cinematic Canvas – Pipeline Domain
//
// Supports two execution modes:
//   1. Monolith  – called via initializePipeline({ eventBus, poolManager, lockManager })
//   2. Distributed – run directly; bootstraps its own PubSubEventBus + resources
// ─────────────────────────────────────────────────────────────────────────────
import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { ApiError as StorageApiError } from "@google-cloud/storage";

import { IEventBus } from "../shared/messaging/event-bus.types.js";
import {
    SUBSCRIPTION_NAMES,
} from "../shared/config.js";
import { PipelineCommand, PipelineEvent } from "../shared/types/pipeline.types.js";
import { JobEvent } from "../shared/types/job.types.js";

import { CheckpointerManager } from "./checkpointer-manager.js";
import { WorkflowOperator } from "./workflow-service.js";
import { CinematicVideoWorkflow } from "./graph.js";
import { PipelineCommandHandler } from "./command-handler.js";

import { PoolManager } from "../shared/services/pool-manager.js";
import { DistributedLockManager } from "../shared/services/lock-manager.js";
import { JobControlPlane } from "../shared/services/job-control-plane.js";
import { JobLifecycleMonitor } from "../shared/services/job-lifecycle-monitor.js";
import { ProjectRepository } from "../shared/services/project-repository.js";
import { GCPStorageManager } from "../shared/services/storage-manager.js";
import { MediaGarbageCollector } from "../shared/services/media-garbage-collector.js";
import { getSacGitService } from "../shared/services/sac/SacGitServiceStub.js";

import { generateId } from "#shared/utils/id.js";
import { initLogger, logContextStore, LogContext } from "../shared/logger/index.js";
import { getPool, initializeDatabase } from "../shared/db/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineDependencies {
    eventBus: IEventBus;
    poolManager: PoolManager;
    lockManager: DistributedLockManager;
}

export interface PipelineHandle {
    stop(): Promise<void>;
}

// ─── Core initialiser (Monolith + Distributed shared logic) ──────────────────

export async function initializePipeline(
    deps: PipelineDependencies
): Promise<PipelineHandle> {
    const { eventBus, poolManager, lockManager } = deps;

    const pipelineInstanceId = generateId();
    const logContext: LogContext = {
        w_id: pipelineInstanceId,
        correlationId: generateId(),
        shouldPublish: false,
    };

    console.log(
        { pipelineInstanceId },
        "[Pipeline] Initialising pipeline domain..."
    );

    // ── Infrastructure ──────────────────────────────────────────────────────

    const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (!gcpProjectId) throw new Error("[Pipeline] GOOGLE_CLOUD_PROJECT is not set.");

    const bucketName = process.env.GOOGLE_CLOUD_BUCKET;
    if (!bucketName) throw new Error("[Pipeline] GOOGLE_CLOUD_BUCKET is not set.");

    const postgresUrl = process.env.POSTGRES_URL;
    if (!postgresUrl) throw new Error("[Pipeline] POSTGRES_URL is not set.");

    // ── Domain services ─────────────────────────────────────────────────────

    const checkpointerManager = new CheckpointerManager({ pool: getPool() });
    await checkpointerManager.init();
    console.debug("[Pipeline] CheckpointerManager initialised.");

    await lockManager.init();
    console.debug("[Pipeline] LockManager initialised.");

    // Thin wrappers so domain services call eventBus instead of raw PubSub
    const publishJobEventViaEventBus = (eventPayload: JobEvent): Promise<string> =>
        eventBus.publishJobEvent(eventPayload);

    const publishPipelineEventViaEventBus = (eventPayload: PipelineEvent): Promise<string> =>
        eventBus.publishPipelineEvent(eventPayload);

    const jobControlPlane = new JobControlPlane(
        poolManager,
        publishJobEventViaEventBus
    );

    const jobLifecycleMonitor = JobLifecycleMonitor.getInstance(jobControlPlane);
    jobLifecycleMonitor.start();
    console.debug("[Pipeline] JobLifecycleMonitor started.");

    const storageManagerGcp = new GCPStorageManager(gcpProjectId, bucketName);
    const mediaGarbageCollector = new MediaGarbageCollector(storageManagerGcp, {
        gracePeriodDays: 30,
        intervalMs: 12 * 60 * 60 * 1_000, // 12 h
    });
    mediaGarbageCollector.start();
    console.debug("[Pipeline] MediaGarbageCollector started.");

    checkpointerManager.getCheckpointer();

    const projectRepository = new ProjectRepository();
    const sacGitService = getSacGitService();

    const workflowOperator = new WorkflowOperator(
        checkpointerManager,
        jobControlPlane,
        publishPipelineEventViaEventBus,
        projectRepository,
        sacGitService,
        lockManager,
        gcpProjectId,
        bucketName
    );

    // ── Optional debug graph export ─────────────────────────────────────────

    const isDebugMode =
        process.env.DEBUG === "true" || process.env.NODE_ENV === "development";

    if (isDebugMode) {
        try {
            const testWorkflowForGraph = new CinematicVideoWorkflow({
                gcpProjectId,
                projectId: "debug-graph-export",
                bucketName,
                jobControlPlane,
                lockManager,
                controller: new AbortController(),
            });

            const compiledGraphForDebug = testWorkflowForGraph.graph.compile();
            const graphDataForDebug = await compiledGraphForDebug.getGraphAsync();
            const mermaidTextForDebug = graphDataForDebug.drawMermaid();

            const textOutputPath = path.resolve(
                "./website/content/docs/graph_structure.mmd"
            );
            await fs.writeFile(textOutputPath, mermaidTextForDebug).catch((errWriteGraph) =>
                console.error("[Pipeline][Debug] Failed to write .mmd:", errWriteGraph)
            );
            console.debug(
                `[Pipeline][Debug] Graph definition saved: file://${textOutputPath}`
            );

            try {
                const pngBlobForDebug = await graphDataForDebug.drawMermaidPng();
                const pngBufferForDebug = Buffer.from(
                    await pngBlobForDebug.arrayBuffer()
                );
                const pngOutputPath = path.resolve(
                    "./website/contents/docs/graph_diagram.png"
                );
                await fs.writeFile(pngOutputPath, pngBufferForDebug);
                console.debug(
                    `[Pipeline][Debug] Graph PNG saved: file://${pngOutputPath}`
                );
            } catch (errPng) {
                console.warn(
                    "[Pipeline][Debug] PNG generation failed (canvas/playwright may be needed)."
                );
            }
        } catch (errDebugInit) {
            console.warn(
                "[Pipeline][Debug] Could not export graph structure:",
                errDebugInit
            );
        }
    }

    // ── Command subscription ─────────────────────────────────────────────────
    //
    // STOP_PIPELINE: the cancellation-fanout pattern (PIPELINE_CANCELLATIONS
    // topic) is a PubSub-only concern. In monolith/InMemory mode we call
    // workflowOperator.stopPipeline() directly. PubSubEventBus handles its
    // own ephemeral cancellation subscriptions internally.

    const handleCommandFromEventBus = async (
        commandRaw: PipelineCommand
    ): Promise<void> => {
        const { projectId } = commandRaw;

        try {
            await logContextStore.run(
                {
                    ...logContext,
                    projectId,
                    commandId: commandRaw.commandId,
                    shouldPublish: false,
                },
                async () => {
                    console.log(
                        { command: commandRaw },
                        "[Pipeline] Received command."
                    );

                    switch (commandRaw.type) {
                        // ── Workflow lifecycle ─────────────────────────────────
                        case "START_PIPELINE":
                            try {
                                await workflowOperator.startPipeline(
                                    commandRaw,
                                    commandRaw.payload
                                );
                            } catch (errStartPipeline) {
                                console.error(
                                    { command: commandRaw, error: errStartPipeline },
                                    "[Pipeline] Error starting pipeline."
                                );
                            }
                            break;

                        case "RESUME_PIPELINE":
                            try {
                                await workflowOperator.resumePipeline(
                                    commandRaw,
                                    commandRaw.payload
                                );
                            } catch (errResumePipeline) {
                                console.error(
                                    { command: commandRaw, error: errResumePipeline },
                                    "[Pipeline] handleResumePipelineCommand failed."
                                );
                                await workflowOperator.publishEvent({
                                    commandId: generateId(),
                                    type: "WORKFLOW_FAILED",
                                    projectId,
                                    worldId: commandRaw.worldId,
                                    teamId: commandRaw.teamId,
                                    userId: commandRaw.userId,
                                    payload: { error: errResumePipeline as string },
                                    timestamp: new Date().toISOString(),
                                });
                            }
                            break;

                        case "REQUEST_FULL_STATE":
                            try {
                                await workflowOperator.getProjectState(commandRaw);
                            } catch (errFullState) {
                                console.error(
                                    { command: commandRaw, error: errFullState },
                                    "[Pipeline] Error handling REQUEST_FULL_STATE."
                                );
                            }
                            break;

                        case "STOP_PIPELINE":
                            try {
                                console.log(
                                    { projectId },
                                    "[Pipeline] Broadcasting stop command."
                                );
                                // Direct invocation works for both InMemory and PubSub
                                // (PubSub mode also fans out via eventBus.publishCommand
                                // to other instances if needed upstream).
                                await workflowOperator.stopPipeline(projectId);
                            } catch (errStop) {
                                console.error(
                                    { command: commandRaw, error: errStop },
                                    "[Pipeline] Error stopping pipeline."
                                );
                            }
                            break;

                        case "RESOLVE_INTERVENTION":
                            try {
                                await workflowOperator.resolveIntervention(
                                    commandRaw,
                                    commandRaw.payload
                                );
                            } catch (errResolve) {
                                console.error(
                                    { command: commandRaw, error: errResolve },
                                    "[Pipeline] Error resolving intervention."
                                );
                            }
                            break;

                        // ── On-demand generation commands ──────────────────────
                        case "GENERATE_COMPOSITES":
                            try {
                                await PipelineCommandHandler.handleGenerateCompositeImage(
                                    commandRaw,
                                    jobControlPlane
                                );
                            } catch (errComposites) {
                                console.error(
                                    { command: commandRaw, error: errComposites },
                                    `[Pipeline] Error dispatching GENERATE_COMPOSITES for ${projectId}.`
                                );
                            }
                            break;

                        case "GENERATE_CHARACTERS":
                            try {
                                await PipelineCommandHandler.handleGenerateCharacterImages(
                                    commandRaw,
                                    jobControlPlane
                                );
                            } catch (errCharacters) {
                                console.error(
                                    { command: commandRaw, error: errCharacters },
                                    `[Pipeline] Error dispatching GENERATE_CHARACTERS for ${projectId}.`
                                );
                            }
                            break;

                        case "GENERATE_LOCATIONS":
                            try {
                                await PipelineCommandHandler.handleGenerateLocationImages(
                                    commandRaw,
                                    jobControlPlane
                                );
                            } catch (errLocations) {
                                console.error(
                                    { command: commandRaw, error: errLocations },
                                    `[Pipeline] Error dispatching GENERATE_LOCATIONS for ${projectId}.`
                                );
                            }
                            break;

                        case "CREATE_SCENE_WITH_ENTITIES":
                            try {
                                await PipelineCommandHandler.handleCreateSceneWithEntities(
                                    commandRaw,
                                    jobControlPlane
                                );
                            } catch (errSceneCreate) {
                                console.error(
                                    { command: commandRaw, error: errSceneCreate },
                                    `[Pipeline] Error dispatching CREATE_SCENE_WITH_ENTITIES for ${projectId}.`
                                );
                            }
                            break;

                        case "GENERATE_SCENE_FRAMES":
                            try {
                                await PipelineCommandHandler.handleGenerateSceneFrames(
                                    commandRaw,
                                    jobControlPlane
                                );
                            } catch (errFrames) {
                                console.error(
                                    { command: commandRaw, error: errFrames },
                                    `[Pipeline] Error dispatching GENERATE_SCENE_FRAMES for ${projectId}.`
                                );
                            }
                            break;

                        case "GENERATE_SCENE_VIDEO":
                            try {
                                await PipelineCommandHandler.handleRegenerateScene(
                                    commandRaw,
                                    jobControlPlane
                                );
                            } catch (errSceneVideo) {
                                console.error(
                                    { command: commandRaw, error: errSceneVideo },
                                    `[Pipeline] Error dispatching GENERATE_SCENE_VIDEO for ${projectId}.`
                                );
                            }
                            break;

                        default:
                            console.warn(
                                { commandRaw },
                                "[Pipeline] Unhandled command type."
                            );
                    }
                }
            );
        } catch (error) {
            // throw top level errors, as they're considered fatal.
            console.error(`[Pipeline Command] Error processing command for project ${commandRaw.projectId}:`, error);
            throw error;
        }
    };

    // ── Job-event subscription ───────────────────────────────────────────────
    //
    // The pipeline listens for JOB_COMPLETED / JOB_FAILED to drive workflow
    // resumption and RAI/Safety intervention events.

    const handleJobEventFromEventBus = async (
        jobEventRaw: JobEvent
    ): Promise<void> => {
        if (!("type" in jobEventRaw) || !jobEventRaw.type.startsWith("JOB_")) {
            return;
        }

        await logContextStore.run(
            {
                ...logContext,
                jobId: jobEventRaw.metadata.jobId,
                shouldPublish: false,
            },
            async () => {
                console.debug(
                    { event: jobEventRaw },
                    "[Pipeline] Received job event."
                );

                const { jobId } = jobEventRaw.metadata;

                // ── JOB_COMPLETED ──────────────────────────────────────────
                if (jobEventRaw.type === "JOB_COMPLETED") {
                    try {
                        const jobRecord = await jobControlPlane.getJob(jobId);
                        if (!jobRecord || jobRecord.state !== "COMPLETED") {
                            console.warn(
                                `[Pipeline] Job ${jobId} not found or not yet COMPLETED – ignoring.`
                            );
                            return;
                        }

                        const isWorkflowResuming = !!jobRecord.workflowId;

                        if (isWorkflowResuming) {
                            console.log(
                                { jobId, jobType: jobRecord.type, projectId: jobRecord.projectId },
                                "[Pipeline] Workflow job completed – resuming pipeline."
                            );
                            await workflowOperator.resumePipeline(jobRecord);
                        } else {
                            // On-demand job (canvas-triggered, outside a workflow run).
                            // Worker already emitted FULL_STATE; emit WORKFLOW_COMPLETED
                            // so the client can re-enable its UI.
                            console.log(
                                { jobId, projectId: jobRecord.projectId },
                                "[Pipeline] On-demand job completed – emitting WORKFLOW_COMPLETED."
                            );
                            publishPipelineEventViaEventBus({
                                type: "WORKFLOW_COMPLETED",
                                projectId: jobRecord.projectId,
                                worldId: jobRecord.worldId,
                                teamId: jobRecord.teamId,
                                userId: jobRecord.userId,
                                timestamp: new Date().toISOString(),
                            });
                        }
                    } catch (errJobCompleted) {
                        console.error(
                            "[Pipeline] Error handling JOB_COMPLETED:",
                            errJobCompleted
                        );
                    }
                    return;
                }

                // ── JOB_FAILED ─────────────────────────────────────────────
                if (jobEventRaw.type === "JOB_FAILED") {
                    try {
                        const jobRecord = await jobControlPlane.getJob(jobId);
                        if (
                            !jobRecord ||
                            (jobRecord.state !== "FAILED" && jobRecord.state !== "FATAL")
                        ) {
                            console.warn(
                                `[Pipeline] Job ${jobId} not found or not in a failed state – ignoring.`
                            );
                            return;
                        }

                        // ── Silent Killer: RAI / Safety permanent errors ────
                        // These must NEVER be retried indefinitely; mark FATAL
                        // and surface an intervention event immediately.
                        const isPermanentRaiError =
                            jobRecord.state === "FATAL" &&
                            jobRecord.recoveryContext?.reason === "PERMANENT_ERROR";

                        if (isPermanentRaiError) {
                            console.warn(
                                { job: jobRecord },
                                "[Pipeline] RAI/Safety permanent error detected – emitting intervention."
                            );
                            await jobControlPlane.updateJobSafe(
                                jobId,
                                jobRecord.attempts.currentAttempt,
                                {
                                    state: "FATAL",
                                    error: jobRecord.error,
                                    attempts: {
                                        ...jobRecord.attempts,
                                        currentAttempt:
                                            jobRecord.attempts.currentAttempt + 1,
                                    },
                                    updatedAt: new Date(),
                                }
                            );

                            publishPipelineEventViaEventBus({
                                type: "LLM_INTERVENTION_NEEDED",
                                projectId: jobRecord.projectId,
                                worldId: jobRecord.worldId,
                                teamId: jobRecord.teamId,
                                userId: jobRecord.userId,
                                payload: {
                                    type: "lm_intervention",
                                    error:
                                        jobRecord.error ||
                                        "Generation failed due to safety guidelines violation.",
                                    functionName: jobRecord.type,
                                    nodeName: jobRecord.type,
                                    attemptCount: jobRecord.attempts.currentAttempt,
                                    jobType: jobRecord.type,
                                    jobId,
                                    params: jobRecord.result?.prompt,
                                },
                                timestamp: new Date().toISOString(),
                            });
                            return;
                        }

                        // ── Normal retry / exhausted-retry path ────────────
                        const {
                            attempts: { currentAttempt, maxRetries },
                        } = jobRecord;
                        const nextAttemptCount = currentAttempt + 1;
                        const isMaxRetriesExhausted = nextAttemptCount > maxRetries;

                        await jobControlPlane.updateJobSafe(
                            jobId,
                            currentAttempt,
                            {
                                state: isMaxRetriesExhausted ? "FATAL" : "FAILED",
                                error: jobRecord.error,
                                attempts: {
                                    ...jobRecord.attempts,
                                    currentAttempt: nextAttemptCount,
                                },
                                updatedAt: new Date(),
                            }
                        );

                        console.warn(
                            `[Pipeline] Job ${jobId}: ${isMaxRetriesExhausted ? "max retries exhausted → FATAL" : "marked for retry"}.`
                        );

                        if (isMaxRetriesExhausted) {
                            publishPipelineEventViaEventBus({
                                type: "WORKFLOW_FAILED",
                                projectId: jobRecord.projectId,
                                worldId: jobRecord.worldId,
                                teamId: jobRecord.teamId,
                                userId: jobRecord.userId,
                                payload: {
                                    error:
                                        jobRecord.error ||
                                        `Job ${jobId} (${jobRecord.type}) permanently failed.`,
                                },
                                timestamp: new Date().toISOString(),
                            });
                        }
                    } catch (errJobFailed) {
                        console.error(
                            "[Pipeline] Error handling JOB_FAILED:",
                            errJobFailed
                        );
                    }
                }
            }
        );
    };

    await eventBus.subscribeToCommands(
        SUBSCRIPTION_NAMES.PIPELINE_COMMANDS_SUBSCRIPTION,
        handleCommandFromEventBus
    );
    console.log(
        `[Pipeline ${pipelineInstanceId}] Subscribed to commands on ${SUBSCRIPTION_NAMES.PIPELINE_COMMANDS_SUBSCRIPTION}.`
    );

    await eventBus.subscribeToJobEvents(
        SUBSCRIPTION_NAMES.PIPELINE_JOB_EVENTS_SUBSCRIPTION,
        handleJobEventFromEventBus,
        {
            filter: 'attributes.type = "JOB_COMPLETED" OR attributes.type = "JOB_FAILED"'
        }
    );
    console.log(
        `[Pipeline ${pipelineInstanceId}] Subscribed to job events on ${SUBSCRIPTION_NAMES.PIPELINE_JOB_EVENTS_SUBSCRIPTION}.`
    );


    const stop = async (): Promise<void> => {
        console.log("[Pipeline] Initiating graceful shutdown...");
        jobLifecycleMonitor.stop();
        mediaGarbageCollector.stop();
        await lockManager.close();
        console.log("[Pipeline] Graceful shutdown complete.");
    };

    console.log(
        { pipelineInstanceId },
        "[Pipeline] Pipeline domain ready."
    );

    return { stop };
}

// ─── Distributed mode entry-point ─────────────────────────────────────────────

async function main(): Promise<void> {
    const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (!gcpProjectId) throw new Error("[Pipeline:main] GOOGLE_CLOUD_PROJECT is not set.");

    const postgresUrl = process.env.POSTGRES_URL;
    if (!postgresUrl) throw new Error("[Pipeline:main] POSTGRES_URL is not set.");

    // Lazy import keeps the Monolith bundle free of @google-cloud/pubsub
    const { PubSubEventBus } = await import(
        "../shared/messaging/pubsub-event-bus.js"
    );
    const eventBusInstance: IEventBus = new PubSubEventBus(gcpProjectId);

    initLogger();
    initializeDatabase(getPool());

    const poolManagerInstance = new PoolManager();
    const workerIdForDistributed = generateId();
    const lockManagerInstance = new DistributedLockManager(
        poolManagerInstance,
        workerIdForDistributed
    );

    const pipelineHandle = await initializePipeline({
        eventBus: eventBusInstance,
        poolManager: poolManagerInstance,
        lockManager: lockManagerInstance,
    });

    const handleShutdown = async (code = 0): Promise<void> => {
        console.log("[Pipeline:main] SIGINT/SIGTERM received – shutting down...");
        await pipelineHandle.stop();
        await eventBusInstance.close();
        await poolManagerInstance.close();
        console.log("[Pipeline:main] Shutdown complete.");
        process.exit(code);
    };

    process.on("SIGINT", handleShutdown);
    process.on("SIGTERM", handleShutdown);

    if ((import.meta as any).hot) {
        (import.meta as any).hot.dispose(handleShutdown);
    }
}

// Run directly only when this file is the process entry-point
const isEntryPoint =
    process.argv[1] &&
    (await import("url")).fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
    main().catch((fatalError) => {
        console.error("[Pipeline:main] FATAL:", fatalError);
        process.exit(1);
    });
}