import * as dotenv from "dotenv";
dotenv.config();
import { PubSub } from "@google-cloud/pubsub";
import { PipelineCommand, PipelineEvent } from "../shared/types/pipeline.types.js";
import {
    JOB_EVENTS_TOPIC_NAME,
    PIPELINE_EVENTS_TOPIC_NAME,
    PIPELINE_COMMANDS_TOPIC_NAME,
    PIPELINE_CANCELLATIONS_TOPIC_NAME,
    PIPELINE_JOB_EVENTS_SUBSCRIPTION,
    PIPELINE_COMMANDS_SUBSCRIPTION,
    WORKER_JOB_EVENTS_SUBSCRIPTION
} from "../shared/config.js";
import { JobEvent } from "../shared/types/job.types.js";
import { ApiError as StorageApiError } from "@google-cloud/storage";
import { CheckpointerManager } from "./checkpointer-manager.js";
import { initLogger, logContextStore, LogContext } from "../shared/logger/index.js";
import { WorkflowOperator } from "./workflow-service.js";
import { DistributedLockManager } from "../shared/services/lock-manager.js";
import { v7 as uuidv7 } from 'uuid';
import { PoolManager } from "../shared/services/pool-manager.js";
import { JobControlPlane } from "../shared/services/job-control-plane.js";
import { ProjectRepository } from "../shared/services/project-repository.js";
import { JobLifecycleMonitor } from "../shared/services/job-lifecycle-monitor.js";
import { CinematicVideoWorkflow } from "./graph.js";
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ensureSubscription, ensureTopic } from "../shared/utils/pubsub-utils.js";
import { getPool, initializeDatabase } from "../shared/db/index.js";
import { PipelineCommandHandler } from "./command-handler.js";
import { getSacGitService } from "../shared/services/sac/SacGitServiceStub.js";
import { GCPStorageManager } from "../shared/services/storage-manager.js";
import { MediaGarbageCollector } from "../shared/services/media-garbage-collector.js";

if (process.env.NODE_ENV !== "production") {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    console.log('🔍 RESOLUTION CHECK:', {
        dbPath: require.resolve('../shared/db/index.js'),
        env: process.env.NODE_ENV
    });
}

const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT;
if (!gcpProjectId) throw Error("A GCP projectId was not provided");

const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) throw Error("Postgres URL is required for CheckpointerManager initialization");

const bucketName = process.env.GOOGLE_CLOUD_BUCKET!;
if (!bucketName) throw new Error("GOOGLE_CLOUD_BUCKET environment variable not set.");



initializeDatabase(getPool());

const workerId = uuidv7();

const checkpointerManager = new CheckpointerManager(postgresUrl);
await checkpointerManager.init();

const poolManager = new PoolManager();

const lockManager = new DistributedLockManager(poolManager, workerId);
await lockManager.init();


const pubsub = new PubSub({
    projectId: gcpProjectId,
    ...(process.env.PUBSUB_EMULATOR_HOST ? { apiEndpoint: process.env.PUBSUB_EMULATOR_HOST } : {}),
});

const PIPELINE_CANCELLATIONS_SUBSCRIPTION_NAME = `worker-${workerId}-cancellations`;

const jobEventsTopicPublisher = pubsub.topic(JOB_EVENTS_TOPIC_NAME);
const videoEventsTopicPublisher = pubsub.topic(PIPELINE_EVENTS_TOPIC_NAME);

export async function publishJobEvent(event: JobEvent) {
    const dataBuffer = Buffer.from(JSON.stringify(event));
    await jobEventsTopicPublisher.publishMessage({
        data: dataBuffer,
        attributes: { type: event.type, projectId: event.projectId }
    });
}
export async function publishPipelineEvent(event: PipelineEvent) {
    const dataBuffer = Buffer.from(JSON.stringify(event));
    await videoEventsTopicPublisher.publishMessage({
        data: dataBuffer,
        attributes: { type: event.type, projectId: event.projectId }
    });
}

const logContext: LogContext = {
    w_id: workerId,
    correlationId: uuidv7(),
    shouldPublish: false,
};

const isDev = process.env.NODE_ENV !== 'production';

async function main() {

    initLogger(videoEventsTopicPublisher.publishMessage.bind(videoEventsTopicPublisher));
    console.log(`Starting pipeline service ${workerId}...`);

    await logContextStore.run(logContext, async () => {
        try {

            const jobControlPlane = new JobControlPlane(poolManager, publishJobEvent);
            const jobLifecycleMonitor = JobLifecycleMonitor.getInstance(jobControlPlane);
            jobLifecycleMonitor.start();

            const storageManager = new GCPStorageManager(gcpProjectId!, bucketName);
            const mediaGC = new MediaGarbageCollector(storageManager, {
                gracePeriodDays: 30,
                intervalMs: 12 * 60 * 60 * 1000
            });
            mediaGC.start();

            checkpointerManager.getCheckpointer();
            const projectRepository = new ProjectRepository();
            const sacService = getSacGitService();
            const workflowOperator = new WorkflowOperator(checkpointerManager, jobControlPlane, publishPipelineEvent, projectRepository, sacService, lockManager, gcpProjectId!, bucketName);

            if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {

                const testWorkflow = new CinematicVideoWorkflow({
                    gcpProjectId: gcpProjectId!,
                    projectId: "test",
                    bucketName: bucketName,
                    jobControlPlane: jobControlPlane,
                    lockManager: lockManager,
                    controller: new AbortController(),
                });

                const compiled = testWorkflow.graph.compile();
                const graphData = await compiled.getGraphAsync();

                const mermaidText = graphData.drawMermaid();
                const textPath = path.resolve('./website/content/docs/graph_structure.mmd');
                await fs.writeFile(textPath, mermaidText).catch((e) => console.error(e));
                console.debug(`[Debug]: Graph definition saved: file://${textPath}`);

                try {
                    const pngBlob = await graphData.drawMermaidPng();
                    const pngBuffer = Buffer.from(await pngBlob.arrayBuffer());
                    const pngPath = path.resolve('./website/contents/docs/graph_diagram.png');
                    await fs.writeFile(pngPath, pngBuffer);
                    console.debug(`[Debug]: Graph image saved: file://${pngPath}`);
                } catch (e) {
                    console.warn("[Debug]: Failed to generate PNG. (Ensure 'canvas' or 'playwright' is available if required by your environment).");
                }
            }

            const jobEventsTopic = await ensureTopic(pubsub, JOB_EVENTS_TOPIC_NAME);
            const videoCommandsTopic = await ensureTopic(pubsub, PIPELINE_COMMANDS_TOPIC_NAME);
            const videoCancellationsTopic = await ensureTopic(pubsub, PIPELINE_CANCELLATIONS_TOPIC_NAME);
            await ensureTopic(pubsub, PIPELINE_EVENTS_TOPIC_NAME);

            await ensureSubscription(jobEventsTopic, PIPELINE_JOB_EVENTS_SUBSCRIPTION, {
                filter: 'attributes.type = "JOB_COMPLETED" OR attributes.type = "JOB_FAILED"'
            });
            await ensureSubscription(jobEventsTopic, WORKER_JOB_EVENTS_SUBSCRIPTION, {
                filter: 'attributes.type = "JOB_DISPATCHED"'
            });
            await ensureSubscription(videoCommandsTopic, PIPELINE_COMMANDS_SUBSCRIPTION);
            console.log(`[Pipeline ${workerId} Listening for pipeline commands on ${PIPELINE_COMMANDS_SUBSCRIPTION}`);

            await ensureSubscription(videoCancellationsTopic, PIPELINE_CANCELLATIONS_SUBSCRIPTION_NAME, {
                ackDeadlineSeconds: 30,
                expirationPolicy: { ttl: { seconds: 12 * 60 * 60 } }
            });

            const workerEventsSubscription = pubsub.subscription(PIPELINE_JOB_EVENTS_SUBSCRIPTION);
            console.log(`[Pipeline ${workerId}] Listening for job events on ${PIPELINE_JOB_EVENTS_SUBSCRIPTION}`);

            const cancellationSubscription = pubsub.subscription(PIPELINE_CANCELLATIONS_SUBSCRIPTION_NAME);
            console.log(`[Pipeline ${workerId}] Listening for cancellations on ${PIPELINE_CANCELLATIONS_SUBSCRIPTION_NAME}`);

            const pipelineCommandsSubscription = pubsub.subscription(PIPELINE_COMMANDS_SUBSCRIPTION);
            console.log(`Listening for commands on ${PIPELINE_COMMANDS_SUBSCRIPTION}...`);


            workerEventsSubscription.on("message", async (message) => {

                console.debug({ message: message.data.toString(), subscription: workerEventsSubscription.name });
                let event: JobEvent | undefined;
                try {
                    event = JSON.parse(message.data.toString());
                } catch (error) {
                    await message.ackWithResponse();
                    console.error({ error, message: message.data.toString(), subscription: workerEventsSubscription.name }, `Error parsing message. Acknowledged.`);
                    return;
                }

                if (event && 'type' in event && event.type.startsWith('JOB_')) {
                    await logContextStore.run({ ...logContext, jobId: event.jobId, shouldPublish: false, subscription: workerEventsSubscription.name }, async () => {

                        console.debug({ event }, `Received job event.`);

                        const { jobId } = event;
                        if (event.type === 'JOB_COMPLETED') {
                            try {
                                console.log({ event }, `Handling job completion`);
                                const job = await jobControlPlane.getJob(jobId);
                                if (!job || job.state !== "COMPLETED") {
                                    console.warn(`[Pipeline.handleJobCompletion] Job ${jobId} not found or not completed`);
                                    return;
                                }

                                const isWorkflowJob = !!job.workflowId;

                                if (isWorkflowJob) {
                                    console.log(`[Pipeline] Job ${jobId} (${job.type}) completed. Resuming pipeline for ${job.projectId}.`);
                                    await workflowOperator.resumePipeline(job.projectId);
                                } else {
                                    publishPipelineEvent({
                                        type: "WORKFLOW_COMPLETED",
                                        projectId: job.projectId,
                                        timestamp: new Date().toISOString()
                                    });
                                }
                            } catch (err) {
                                console.error("[Pipeline] Error handling job completion:", err);
                            }
                        }

                        if (event.type === 'JOB_FAILED') {
                            try {
                                const job = await jobControlPlane.getJob(jobId);
                                // Accept both FAILED (retriable) and FATAL (intervention required) states
                                if (!job || (job.state !== "FAILED" && job.state !== "FATAL")) {
                                    console.warn(`[Pipeline.jobFailed] Job ${jobId} not found or not in failed state`);
                                    return;
                                }

                                // Check if this is a FATAL job with PERMANENT_ERROR (RAI/Safety errors)
                                const isPermanentError = job.state === "FATAL" &&
                                    job.recoveryContext?.reason === "PERMANENT_ERROR";

                                if (isPermanentError) {
                                    // Emit intervention event for RAI/Safety errors
                                    console.warn({ job }, `[Pipeline] RAI/Safety error detected - emitting intervention event`);
                                    await jobControlPlane.updateJobSafe(jobId, job.attempts.currentAttempt, {
                                        state: "FATAL",
                                        error: job.error,
                                        attempts: { ...job.attempts, currentAttempt: job.attempts.currentAttempt + 1 },
                                        updatedAt: new Date()
                                    });

                                    publishPipelineEvent({
                                        type: "LLM_INTERVENTION_NEEDED",
                                        projectId: job.projectId,
                                        payload: {
                                            type: "lm_intervention",
                                            error: job.error || "Generation failed due to safety guidelines violation",
                                            functionName: job.type,
                                            nodeName: job.type,  // Use job type as node name
                                            attemptCount: job.attempts.currentAttempt,
                                            jobType: job.type,
                                            params: job.result?.prompt
                                        },
                                        timestamp: new Date().toISOString(),
                                    });
                                    return;
                                }

                                try {
                                    const { attempts: { currentAttempt, maxRetries } } = job;
                                    const nextAttempt = currentAttempt + 1;
                                    const isPermanentlyFailed = nextAttempt > maxRetries;

                                    await jobControlPlane.updateJobSafe(jobId, currentAttempt, {
                                        state: isPermanentlyFailed ? "FATAL" : "FAILED",
                                        error: job.error,
                                        attempts: { ...job.attempts, currentAttempt: nextAttempt },
                                        updatedAt: new Date()
                                    });

                                    console.warn(`[Job ${jobId}] ${isPermanentlyFailed ? 'Max retries reached' : 'Marked for retry'}`);
                                    if (isPermanentlyFailed) {
                                        publishPipelineEvent({
                                            type: "WORKFLOW_FAILED",
                                            projectId: job.projectId,
                                            payload: { error: job.error || `Job ${jobId} (${job.type}) failed` },
                                            timestamp: new Date().toISOString(),
                                        });
                                    }
                                    return;
                                } catch (error) {
                                    console.error("[Pipeline] Error handling job failure:", { error });
                                }
                            } catch (error) {
                                console.error("[Pipeline] Error retrieving job:", { error });
                            }
                        }
                    });
                }
                await message.ackWithResponse();
            });

            cancellationSubscription.on("message", async (message) => {

                console.log(`[Pipeline ${workerId}] Received cancellation message: ${message.data.toString()}`);
                try {
                    const payload = JSON.parse(message.data.toString());
                    if (payload.projectId) {

                        await logContextStore.run({ ...logContext, projectId: payload.projectId, shouldPublish: true }, async () => {
                            await workflowOperator.stopPipeline(payload.projectId);
                        });
                    }
                } catch (err) {
                    console.error("Error processing cancellation message:", err);
                }
                await message.ackWithResponse();
            });

            const publishCancellation = async (projectId: string) => {

                const dataBuffer = Buffer.from(JSON.stringify({ projectId }));
                await videoCancellationsTopic.publishMessage({
                    data: dataBuffer,
                    attributes: { type: "CANCEL", projectId }
                });
            };

            pipelineCommandsSubscription.on("message", async (message) => {

                let command: PipelineCommand | undefined;
                try {
                    command = JSON.parse(message.data.toString()) as PipelineCommand;
                } catch (error) {
                    console.error("[Pipeline Command]: Error parsing command:", error);
                    await message.ackWithResponse();
                    return;
                }
                await message.ackWithResponse();

                try {
                    await logContextStore.run({
                        ...logContext,
                        projectId: command.projectId,
                        commandId: command.commandId,
                        shouldPublish: true
                    }, async () => {

                        const { projectId } = command;

                        console.log({ command, messageId: message.id, deliveryAttempt: message.deliveryAttempt }, `Received command`);
                        switch (command.type) {
                            case "START_PIPELINE":
                                try {
                                    await workflowOperator.startPipeline(projectId!, command.payload);
                                } catch (error) {
                                    console.error({ command, error }, `Error starting pipeline`);
                                }
                                break;
                            case "REQUEST_FULL_STATE":
                                try {
                                    workflowOperator.getProjectState(projectId);
                                } catch (error) {
                                    console.error({ command, error }, "Error handling REQUEST_FULL_STATE:");
                                }
                                break;
                            case "RESUME_PIPELINE":
                                try {
                                    const { payload: { resumeValue } } = command;
                                    await workflowOperator.resumePipeline(projectId, { resumeValue });
                                } catch (error) {
                                    console.error({ command, error }, 'handleResumePipelineCommand failed');
                                    await workflowOperator.publishEvent({
                                        commandId: uuidv7(),
                                        type: "WORKFLOW_FAILED",
                                        projectId: projectId,
                                        payload: { error: error as string },
                                        timestamp: new Date().toISOString()
                                    });
                                }
                                break;
                            case "GENERATE_SCENE_FRAMES":
                                try {
                                    await PipelineCommandHandler.handleGenerateSceneFrames(command, jobControlPlane);
                                } catch (error) {
                                    console.error({ error, command }, `Error regenerating frame for ${projectId}:`, error);
                                }
                                break;
                            case "REGENERATE_SCENE":
                                try {
                                    await PipelineCommandHandler.handleRegenerateScene(command, jobControlPlane);
                                } catch (error) {
                                    console.error({ error, command }, `Error regenerating scene`);
                                }
                                break;
                            case "RESOLVE_INTERVENTION":
                                try {
                                    await workflowOperator.resolveIntervention(projectId, command.payload);
                                } catch (error) {
                                    console.error({ error, command }, "Error resolving intervention:");
                                }
                                break;
                            case "STOP_PIPELINE":
                                try {
                                    console.log(`[handleStopPipelineCommand] Broadcasting stop for projectId: ${projectId}`);
                                    await publishCancellation(projectId);
                                } catch (error) {
                                    console.error({ error, command }, "Error broadcasting stop pipeline:");
                                }
                                break;
                        }
                    });
                } catch (error) {
                    console.error(`[Pipeline Command] Error processing command for project ${command.projectId}:`, error);
                    if (error instanceof StorageApiError) {
                        pipelineCommandsSubscription.close();
                        process.exit(1);
                    }
                }
            });

            const handleShutdown = async () => {
                console.log("Shutting down pipeline service...");
                try {
                    console.log("Closing subscriptions ");
                    await Promise.all([
                        workerEventsSubscription.close(),
                        pipelineCommandsSubscription.close(),
                        // ONLY delete the temporary, instance-specific subscription
                        cancellationSubscription.delete().catch(() => { })
                    ]);
                    console.log("Closed subscriptions");

                    jobLifecycleMonitor.stop();
                    mediaGC.stop();

                    await lockManager.close();
                    await poolManager.close();

                    console.log("Closed lock manager and pool manager");
                    console.log("Shut down successful.");
                } catch (e) {
                    console.error("Failed to close subscription (it might have been closed already or connection failed)", e);
                }
                process.exit(0);
            };

            process.on("SIGINT", handleShutdown);
            process.on("SIGTERM", handleShutdown);

            if ((import.meta as any).hot) {
                (import.meta as any).hot.dispose(handleShutdown);
            }

            console.log({ workerId }, `Pipeline service ready`);

        } catch (error) {
            console.error({ error }, `FATAL: PubSub initialization failed.`);
            process.exit(1);
        }
    });
}

main().catch(console.error);
