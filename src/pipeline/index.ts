import { PubSub, Topic } from "@google-cloud/pubsub";
import { PipelineCommand, PipelineEvent } from "../shared/types/pipeline.types.js";
import {
    JOB_EVENTS_TOPIC_NAME,
    PIPELINE_EVENTS_TOPIC_NAME,
    PIPELINE_COMMANDS_TOPIC_NAME,
    PIPELINE_CANCELLATIONS_TOPIC_NAME,
    PIPELINE_JOB_EVENTS_SUBSCRIPTION,
    PIPELINE_COMMANDS_SUBSCRIPTION,
    WORKER_JOB_EVENTS_SUBSCRIPTION
} from "../shared/constants.js";
import { JobEvent } from "../shared/types/job.types.js";
import { ApiError as StorageApiError } from "@google-cloud/storage";
import { CheckpointerManager } from "./checkpointer-manager.js";
import { handleStartPipelineCommand } from './handlers/handleStartPipelineCommand.js';
import { handleRequestFullStateCommand } from './handlers/handleRequestFullStateCommand.js';
import { handleResumePipelineCommand } from './handlers/handleResumePipelineCommand.js';
import { handleRegenerateSceneCommand } from './handlers/handleRegenerateSceneCommand.js';
import { handleRegenerateFrameCommand } from './handlers/handleRegenerateFrameCommand.js';
import { handleUpdateSceneAssetCommand } from './handlers/handleUpdateSceneAssetCommand.js';
import { handleResolveInterventionCommand } from './handlers/handleResolveInterventionCommand.js';
import { handleStopPipelineCommand } from './handlers/handleStopPipelineCommand.js';
import { initLogger, logContextStore, LogContext } from "../shared/logger/index.js";
import { WorkflowOperator } from "./workflow-service.js";
import { DistributedLockManager } from "../shared/services/lock-manager.js";
import { v7 as uuidv7 } from 'uuid';
import { PoolManager } from "../shared/services/pool-manager.js";
import { JobControlPlane } from "../shared/services/job-control-plane.js";
import { ProjectRepository } from "../shared/services/project-repository.js";
import { handleJobCompletion } from "./handlers/handleJobCompletion.js";
import { JobLifecycleMonitor } from "./job-lifecycle-monitor.js";
import { CinematicVideoWorkflow } from "./graph.js";
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ensureSubscription, ensureTopic } from "../shared/utils/pubsub-utils.js";
import { getPool, initializeDatabase } from "../shared/db/index.js";


if (process.env.NODE_ENV !== "production") {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    console.log('🔍 RESOLUTION CHECK:', {
        dbPath: require.resolve('../shared/db/index.js'),
        env: process.env.NODE_ENV
    });
}

const gcpProjectId = process.env.GCP_PROJECT_ID;
if (!gcpProjectId) throw Error("A GCP projectId was not provided");

const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) throw Error("Postgres URL is required for CheckpointerManager initialization");

const bucketName = process.env.GCP_BUCKET_NAME!;
if (!bucketName) throw new Error("GCP_BUCKET_NAME environment variable not set.");



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
        attributes: { type: event.type }
    });
}
export async function publishPipelineEvent(event: PipelineEvent) {
    const dataBuffer = Buffer.from(JSON.stringify(event));
    await videoEventsTopicPublisher.publishMessage({
        data: dataBuffer,
        attributes: { type: event.type }
    });
}

const logContext: LogContext = {
    w_id: workerId,
    correlationId: uuidv7(),
    shouldPublishLog: false,
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

            checkpointerManager.getCheckpointer();
            const projectRepository = new ProjectRepository();
            const workflowOperator = new WorkflowOperator(checkpointerManager, jobControlPlane, publishPipelineEvent, projectRepository, lockManager, gcpProjectId!, bucketName);

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
                const textPath = path.resolve('./website/contents/docs/graph_structure.mmd');
                await fs.writeFile(textPath, mermaidText);
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
                    await logContextStore.run({ ...logContext, jobId: event.jobId, shouldPublishLog: false, subscription: workerEventsSubscription.name }, async () => {

                        console.debug({ event }, `Received job event.`);

                        const { jobId } = event;
                        if (event.type === 'JOB_COMPLETED') {
                            await handleJobCompletion(jobId, workflowOperator, jobControlPlane);
                        }

                        if (event.type === 'JOB_FAILED') {
                            try {
                                const job = await jobControlPlane.getJob(jobId);
                                if (!job || job.state !== "FAILED") {
                                    console.warn(`[Pipeline.jobFailed] Job ${jobId} not found or not completed`);
                                    return;
                                }
                                try {

                                    const { maxRetries } = job;
                                    const nextAttempt = job.attempt + 1; ``;
                                    const isPermanentlyFailed = nextAttempt > maxRetries;

                                    await jobControlPlane.updateJobSafe(jobId, job.attempt, {
                                        state: isPermanentlyFailed ? "FATAL" : "FAILED",
                                        error: job.error,
                                        attempt: nextAttempt,
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

                        await logContextStore.run({ ...logContext, projectId: payload.projectId, shouldPublishLog: true }, async () => {
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
                    attributes: { type: "CANCEL" }
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
                        shouldPublishLog: true
                    }, async () => {

                        console.log(`[Pipeline Command] Received command: ${command.type} for projectId: ${command.projectId} (Msg ID: ${message.id}, Attempt: ${message.deliveryAttempt})`);
                        switch (command.type) {
                            case "START_PIPELINE":
                                await handleStartPipelineCommand(command, workflowOperator);
                                break;
                            case "REQUEST_FULL_STATE":
                                await handleRequestFullStateCommand(command, workflowOperator);
                                break;
                            case "RESUME_PIPELINE":
                                await handleResumePipelineCommand(command, workflowOperator);
                                break;
                            case "REGENERATE_SCENE":
                                await handleRegenerateSceneCommand(command, workflowOperator);
                                break;
                            case "REGENERATE_FRAME":
                                await handleRegenerateFrameCommand(command, workflowOperator);
                                break;
                            case "UPDATE_SCENE_ASSET":
                                await handleUpdateSceneAssetCommand(command, workflowOperator);
                                break;
                            case "RESOLVE_INTERVENTION":
                                await handleResolveInterventionCommand(command, workflowOperator);
                                break;
                            case "STOP_PIPELINE":
                                await handleStopPipelineCommand(command, publishCancellation);
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
        } catch (error) {
            console.error({ error }, `FATAL: PubSub initialization failed.`);
            process.exit(1);
        }
    });
}

main().catch(console.error);
