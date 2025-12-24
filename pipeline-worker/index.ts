import { PubSub } from "@google-cloud/pubsub";
import { PipelineCommand, PipelineEvent } from "../shared/pubsub-types";
import { ApiError } from "@google-cloud/storage";
import { CheckpointerManager } from "../pipeline/checkpointer-manager";
import { AsyncLocalStorage } from "async_hooks";
import { handleStartPipelineCommand } from './handlers/handleStartPipelineCommand';
import { handleRequestFullStateCommand } from './handlers/handleRequestFullStateCommand';
import { handleResumePipelineCommand } from './handlers/handleResumePipelineCommand';
import { handleRegenerateSceneCommand } from './handlers/handleRegenerateSceneCommand';
import { handleRegenerateFrameCommand } from './handlers/handleRegenerateFrameCommand';
import { handleResolveInterventionCommand } from './handlers/handleResolveInterventionCommand';
import { handleStopPipelineCommand } from './handlers/handleStopPipelineCommand';
import { formatLoggers } from "./helpers/format-loggers";

// const lockManager = new DistributedLockManager(postgresUrl);
// await lockManager.init();

const projectIdStore = new AsyncLocalStorage<string>();

const gcpProjectId = process.env.GCP_PROJECT_ID;
if (!gcpProjectId) throw Error("A GCP projectId was not provided");

const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) throw Error("Postgres URL is required for CheckpointerManager initialization");


const checkpointerManager = new CheckpointerManager(postgresUrl);
await checkpointerManager.init();


const VIDEO_COMMANDS_TOPIC_NAME = "video-commands";
const VIDEO_EVENTS_TOPIC_NAME = "video-events";
const PIPELINE_WORKER_SUBSCRIPTION_NAME = "pipeline-worker-subscription";

const pubsub = new PubSub({
    projectId: gcpProjectId,
    apiEndpoint: process.env.PUBSUB_EMULATOR_HOST,
});

const videoEventsTopic = pubsub.topic(VIDEO_EVENTS_TOPIC_NAME);

export async function publishPipelineEvent(event: PipelineEvent) {
    const dataBuffer = Buffer.from(JSON.stringify(event));
    await videoEventsTopic.publishMessage({ data: dataBuffer });
}

async function main() {
    console.log("Starting pipeline worker...");

    formatLoggers(projectIdStore, publishPipelineEvent);

    checkpointerManager.getCheckpointer();

    const [ videoCommandsTopic ] = await pubsub.topic(VIDEO_COMMANDS_TOPIC_NAME).get({ autoCreate: true });
    await pubsub.topic(VIDEO_EVENTS_TOPIC_NAME).get({ autoCreate: true });
    await videoCommandsTopic.subscription(PIPELINE_WORKER_SUBSCRIPTION_NAME).get({ autoCreate: true });

    const pipelineCommandsSubscription = pubsub.subscription(PIPELINE_WORKER_SUBSCRIPTION_NAME);
    console.log(`Listening for commands on ${PIPELINE_WORKER_SUBSCRIPTION_NAME}...`);

    pipelineCommandsSubscription.on("message", async (message) => {
        let command: PipelineCommand | undefined;

        try {
            command = JSON.parse(message.data.toString()) as PipelineCommand;
        } catch (error) {
            console.error("Error parsing command:", error);
            message.ack();
            return;
        }

        console.log(`[Worker] Received command: ${command.type} for projectId: ${command.projectId} (Msg ID: ${message.id}, Attempt: ${message.deliveryAttempt})`);

        // Acquire lock
        // const acquired = await lockManager.tryAcquire(command.projectId, workerId);
        // if (!acquired) {
        //     console.warn(`[Worker] Could not acquire lock for project ${command.projectId}. It may be processing on another worker.`);
        //     message.ack(); // Ack to remove from queue (or nack to retry later if you prefer)
        //     return;
        // }

        // const heartbeat = setInterval(() => {
        //     lockManager.refresh(command!.projectId, workerId).catch(err => console.error(`[Worker] Heartbeat failed for ${command!.projectId}:`, err));
        // }, 30000);

        // Acknowledge immediately to prevent Pub/Sub redelivery during long-running tasks
        // Note: In distributed setup, if we crash, the lock expires and pubsub (if nacked or not acked) would redeliver.
        // But here we ACK immediately. If we crash, the message is lost from PubSub.
        // For reliability, we should only ACK after completion, but PubSub has ack deadlines (max 10 mins).
        // Long running tasks usually require acking and using separate persistence (which we have in Postgres).

        message.ack();

        try {
            await projectIdStore.run(command.projectId, async () => {
                switch (command.type) {
                    case "START_PIPELINE":
                        await handleStartPipelineCommand(command, publishPipelineEvent, checkpointerManager);
                        break;
                    case "REQUEST_FULL_STATE":
                        await handleRequestFullStateCommand(command, publishPipelineEvent, checkpointerManager);
                        break;
                    case "RESUME_PIPELINE":
                        await handleResumePipelineCommand(command, publishPipelineEvent, checkpointerManager);
                        break;
                    case "REGENERATE_SCENE":
                        await handleRegenerateSceneCommand(command, publishPipelineEvent, checkpointerManager);
                        break;
                    case "REGENERATE_FRAME":
                        await handleRegenerateFrameCommand(command, publishPipelineEvent, checkpointerManager);
                        break;
                    case "RESOLVE_INTERVENTION":
                        await handleResolveInterventionCommand(command, publishPipelineEvent, checkpointerManager);
                        break;
                    case "STOP_PIPELINE":
                        await handleStopPipelineCommand(command, publishPipelineEvent, checkpointerManager);
                        break;
                }
            });
        } catch (error) {
            console.error(`[Worker] Error processing command for project ${command.projectId}:`, error);
            if (error instanceof ApiError) {
                pipelineCommandsSubscription.close();
                process.exit(1);
            }
        } finally {
            // clearInterval(heartbeat);
            // await lockManager.release(command.projectId, workerId);
        }
    });

    process.on("SIGINT", () => {
        console.log("Shutting down worker...");
        pipelineCommandsSubscription.close();
        process.exit(0);
    });

    if (import.meta.hot) {
        import.meta.hot.dispose(() => {
            console.log("Closing pipeline subscription for HMR...");
            pipelineCommandsSubscription.close();
        });
    }
}

main().catch(console.error);

