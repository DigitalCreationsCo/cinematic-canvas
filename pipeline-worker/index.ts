import * as dotenv from "dotenv";
dotenv.config();

import { PubSub } from "@google-cloud/pubsub";
import { PipelineCommand, PipelineEvent } from "../shared/pubsub-types";
import { GraphState, InitialGraphState, Storyboard } from "../shared/pipeline-types";
import { CinematicVideoWorkflow } from "../pipeline/graph";
import { GCPStorageManager } from "../pipeline/storage-manager";
import { Storage } from "@google-cloud/storage";
import { CheckpointerManager } from "../pipeline/checkpointer-manager";
import { RunnableConfig } from "@langchain/core/runnables";
import { AsyncLocalStorage } from "async_hooks";
import { START } from "@langchain/langgraph";

const projectIdStore = new AsyncLocalStorage<string>();

const gcpProjectId = process.env.GCP_PROJECT_ID;
if (!gcpProjectId) throw Error("A projectId was not provided");

const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) throw Error("Postgres URL is required for CheckpointerManager initialization");

const pubsub = new PubSub({
    projectId: gcpProjectId,
    apiEndpoint: process.env.PUBSUB_EMULATOR_HOST,
});

const checkpointerManager = new CheckpointerManager(postgresUrl);
await checkpointerManager.init();

const storage = new Storage({ projectId: gcpProjectId });

const VIDEO_COMMANDS_TOPIC_NAME = "video-commands";
const VIDEO_EVENTS_TOPIC_NAME = "video-events";
const PIPELINE_WORKER_SUBSCRIPTION_NAME = "pipeline-worker-subscription";

const videoEventsTopic = pubsub.topic(VIDEO_EVENTS_TOPIC_NAME);

async function publishPipelineEvent(event: PipelineEvent) {
    const dataBuffer = Buffer.from(JSON.stringify(event));
    await videoEventsTopic.publishMessage({ data: dataBuffer });
}

// Only intercept console methods when projectId context exists AND filter out LLM response JSON 
function shouldPublishLog(message: any): boolean {
    // Don't publish if message looks like LLM JSON response
    if (typeof message === 'string') {
        const trimmed = message.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                JSON.parse(trimmed);
                return false; // It's valid JSON, likely an LLM response
            } catch {
                // Not valid JSON, safe to publish
            }
        }
    }
    return true;
}

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = (message?: any, ...optionalParams: any[]) => {
    originalConsoleLog(message, ...optionalParams);

    const projectId = projectIdStore.getStore();
    if (projectId && shouldPublishLog(message)) {
        const formattedMessage = [ message, ...optionalParams ]
            .map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg))
            .join(' ');

        publishPipelineEvent({
            type: "LOG",
            projectId,
            payload: { level: "info", message: formattedMessage },
            timestamp: new Date().toISOString(),
        }).catch(err => originalConsoleError("Failed to publish log event:", err));
    }
};

console.warn = (message?: any, ...optionalParams: any[]) => {
    originalConsoleLog(message, ...optionalParams);

    const projectId = projectIdStore.getStore();
    if (projectId && shouldPublishLog(message)) {
        const formattedMessage = [ message, ...optionalParams ]
            .map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg))
            .join(' ');

        publishPipelineEvent({
            type: "LOG",
            projectId,
            payload: { level: "warning", message: formattedMessage },
            timestamp: new Date().toISOString(),
        }).catch(err => originalConsoleError("Failed to publish log event:", err));
    }
};

console.error = (message?: any, ...optionalParams: any[]) => {
    originalConsoleLog(message, ...optionalParams);

    const projectId = projectIdStore.getStore();
    if (projectId && shouldPublishLog(message)) {
        const formattedMessage = [ message, ...optionalParams ]
            .map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg))
            .join(' ');

        publishPipelineEvent({
            type: "LOG",
            projectId,
            payload: { level: "error", message: formattedMessage },
            timestamp: new Date().toISOString(),
        }).catch(err => originalConsoleError("Failed to publish log event:", err));
    }
};

async function handleStartPipelineCommand(command: Extract<PipelineCommand, { type: "START_PIPELINE"; }>) {
    const { projectId, payload } = command;

    const bucketName = process.env.GCP_BUCKET_NAME;
    if (!bucketName) {
        throw new Error("GCP_BUCKET_NAME environment variable not set.");
    }

    // Use the projectId as the thread_id for LangGraph checkpointing
    const runnableConfig: RunnableConfig = {
        configurable: { thread_id: projectId },
    };

    const checkpointer = await checkpointerManager.getCheckpointer();
    if (!checkpointer) {
        throw new Error("Checkpointer not initialized");
    }

    let initialState: InitialGraphState;
    const existingCheckpoint = await checkpointerManager.loadCheckpoint(runnableConfig);

    if (existingCheckpoint) {
        console.log(`Resuming pipeline for projectId: ${projectId} from checkpoint.`);
        // LangGraph automatically resumes from the checkpoint if initial state is null or empty for stream
        // We still need to construct a workflow to get the compiled graph
        const workflow = new CinematicVideoWorkflow(process.env.GCP_PROJECT_ID!, projectId, bucketName);
        workflow.publishEvent = publishPipelineEvent;
        const compiledGraph = workflow.graph.compile({ checkpointer });
        const stream = await compiledGraph.stream(null, { ...runnableConfig, streamMode: [ "values" ] });

        for await (const step of stream) {
            try {
                console.debug('[handleStartPipelineCommand] stream step');

                const [ _, state ] = Object.values(step);
                await publishPipelineEvent({
                    type: "FULL_STATE",
                    projectId,
                    payload: { state: state as GraphState },
                    timestamp: new Date().toISOString(),
                });

            } catch (error) {
                console.error('error publishing pipeline event: ');
                console.error(JSON.stringify(error, null, 2));
            }
        }
    } else {
        console.log("Starting new pipeline for projectId:", projectId);
        console.log("Initial state for new pipeline:", JSON.stringify(payload, null, 2));

        const workflow = new CinematicVideoWorkflow(process.env.GCP_PROJECT_ID!, projectId, bucketName);
        let audioPublicUri = payload.audioUrl;
        if (payload.audioUrl && payload.audioUrl.startsWith("gs://")) {
            const sm = new GCPStorageManager(process.env.GCP_PROJECT_ID!, projectId, bucketName);
            audioPublicUri = sm.getPublicUrl(payload.audioUrl);
        }

        initialState = {
            initialPrompt: payload.audioUrl || "",
            creativePrompt: payload.creativePrompt,
            audioGcsUri: payload.audioUrl, // Assuming audioUrl is the GCS URI
            audioPublicUri: audioPublicUri,
            hasAudio: !!payload.audioUrl,
            currentSceneIndex: 0,
            errors: [],
            generationRules: [],
            refinedRules: [],
        };
        workflow.publishEvent = publishPipelineEvent;
        const compiledGraph = workflow.graph.compile({ checkpointer });
        console.log(`Compiled graph for new pipeline for projectId: ${projectId}. Starting stream.`);
        const stream = await compiledGraph.stream(initialState, { ...runnableConfig, streamMode: [ "values" ] });

        for await (const step of stream) {
            try {
                console.debug('[handleStartPipelineCommand] stream step');

                const [ _, state ] = Object.values(step);
                await publishPipelineEvent({
                    type: "FULL_STATE",
                    projectId,
                    payload: { state: state as GraphState },
                    timestamp: new Date().toISOString(),
                });
            } catch (error) {
                console.error('error publishing pipeline event for new pipeline: ');
                console.error(JSON.stringify(error, null, 2));
            }
        }
    }
}

async function handleRequestFullStateCommand(command: Extract<PipelineCommand, { type: "REQUEST_FULL_STATE"; }>) {
    const { projectId } = command;
    const runnableConfig: RunnableConfig = {
        configurable: { thread_id: projectId },
    };

    const existingCheckpoint = await checkpointerManager.loadCheckpoint(runnableConfig);
    if (existingCheckpoint && existingCheckpoint.channel_values) {
        await publishPipelineEvent({
            type: "FULL_STATE",
            projectId,
            payload: { state: existingCheckpoint.channel_values as GraphState },
            timestamp: new Date().toISOString(),
        });
    } else {
        console.warn(`No checkpoint found for projectId: ${projectId}`);
        console.warn(`Retrieveing recent state from storage`);

        const bucketName = process.env.GCP_BUCKET_NAME;
        if (!bucketName) {
            throw new Error("GCP_BUCKET_NAME environment variable not set.");
        }

        const storyboardPath = `${projectId}/scenes/storyboard.json`;
        const [ contents ] = await storage.bucket(bucketName).file(storyboardPath).download();
        if (contents.length) {
            const storyboard = JSON.parse(contents.toString());

            console.log("   Found existing storyboard. Resuming workflow.");

            const state: GraphState = {
                initialPrompt: "",
                creativePrompt: "",
                hasAudio: false,
                storyboard,
                storyboardState: storyboard,
                currentSceneIndex: 0,
                audioGcsUri: "",
                errors: [],
                generationRules: [],
                refinedRules: [],
            };

            await publishPipelineEvent({
                type: "FULL_STATE",
                projectId,
                payload: { state: state as GraphState },
                timestamp: new Date().toISOString(),
            });

        } else {
            console.warn(`No state found in storage. ProjectId: ${projectId}`);
        }
    }
}

async function handleResumePipelineCommand(command: Extract<PipelineCommand, { type: "RESUME_PIPELINE"; }>) {
    const { projectId } = command;
    console.log(`Resuming pipeline for projectId: ${projectId}`);

    const bucketName = process.env.GCP_BUCKET_NAME;
    if (!bucketName) {
        throw new Error("GCP_BUCKET_NAME environment variable not set.");
    }

    const runnableConfig: RunnableConfig = {
        configurable: { thread_id: projectId },
    };

    const checkpointer = await checkpointerManager.getCheckpointer();
    if (!checkpointer) {
        throw new Error("Checkpointer not initialized");
    }

    const existingCheckpoint = await checkpointerManager.loadCheckpoint(runnableConfig);
    if (!existingCheckpoint) {
        console.warn(`No checkpoint found to resume for projectId: ${projectId}`);
        // Optionally send a FAILURE event back to client
        await publishPipelineEvent({
            type: "WORKFLOW_FAILED",
            projectId,
            payload: { error: "No existing pipeline found to resume." },
            timestamp: new Date().toISOString(),
        });
        return;
    }

    const workflow = new CinematicVideoWorkflow(process.env.GCP_PROJECT_ID!, projectId, bucketName);
    workflow.publishEvent = publishPipelineEvent;
    const compiledGraph = workflow.graph.compile({ checkpointer });

    console.log(`Pipeline for projectId: ${projectId} resuming.`);
    const stream = await compiledGraph.stream(null, { ...runnableConfig, streamMode: [ "values" ] });

    for await (const step of stream) {
        console.debug('[handleResumePipelineCommand] stream step');
        const [ _, state ] = Object.values(step);

        await publishPipelineEvent({
            type: "FULL_STATE",
            projectId,
            payload: { state: state as GraphState },
            timestamp: new Date().toISOString(),
        });
    }
}

async function handleRegenerateSceneCommand(command: Extract<PipelineCommand, { type: "REGENERATE_SCENE"; }>) {
    const { projectId, payload } = command;
    console.log(`Regenerating scene ${payload.sceneId} for projectId: ${projectId}`);

    const bucketName = process.env.GCP_BUCKET_NAME;
    if (!bucketName) {
        throw new Error("GCP_BUCKET_NAME environment variable not set.");
    }

    const runnableConfig: RunnableConfig = {
        configurable: { thread_id: projectId },
    };

    const checkpointer = await checkpointerManager.getCheckpointer();
    if (!checkpointer) {
        throw new Error("Checkpointer not initialized");
    }

    const existingCheckpoint = await checkpointerManager.loadCheckpoint(runnableConfig);
    if (!existingCheckpoint) {
        console.warn(`No checkpoint found to regenerate scene for projectId: ${projectId}`);
        return;
    }

    await publishPipelineEvent({
        type: "SCENE_STARTED",
        projectId,
        payload: {
            sceneId: payload.sceneId,
            sceneIndex: -1, // Unknown during regeneration
            totalScenes: -1
        },
        timestamp: new Date().toISOString(),
    });

    let currentState = existingCheckpoint.channel_values as GraphState;
    const sceneId = payload.sceneId;

    const sceneIndexToRetry = currentState.storyboardState?.scenes.findIndex(s => s.id === sceneId);

    if (sceneIndexToRetry !== undefined && sceneIndexToRetry !== -1) {
        // Prepare overrides
        const promptOverrides = currentState.scenePromptOverrides || {};
        if (payload.promptModification) {
            promptOverrides[ sceneId ] = payload.promptModification;
        }

        currentState = {
            ...currentState,
            currentSceneIndex: sceneIndexToRetry,
            forceRegenerateSceneId: payload.forceRegenerate ? sceneId : undefined,
            scenePromptOverrides: promptOverrides,
            // We do NOT clear generatedVideo here, because process_scene logic handles skipping based on existence
            // UNLESS forceRegenerateSceneId matches.
            // If we want to support "soft" regeneration (only if missing), we wouldn't set forceRegenerateSceneId.
            // But REGENERATE_SCENE implies intention to re-do it.
        };

        const workflow = new CinematicVideoWorkflow(process.env.GCP_PROJECT_ID!, projectId, bucketName);
        workflow.publishEvent = publishPipelineEvent;

        workflow.graph.addEdge(START, "process_scene" as any);
        
        const compiledGraph = workflow.graph.compile({ checkpointer });

        // Update checkpoint with new state configuration
        await checkpointer.put(runnableConfig, { ...existingCheckpoint, channel_values: currentState }, {} as any, {});

        console.log(`Pipeline for projectId: ${projectId} restarting from scene ${sceneId} with forceRegenerate=${payload.forceRegenerate}`);
        const stream = await compiledGraph.stream(null, { ...runnableConfig, streamMode: [ "values" ] });

        for await (const step of stream) {
            try {
                console.debug(`[RegenerateScene] Processing step for scene ${payload.sceneId}`);

                const [ _, state ] = Object.values(step);
                await publishPipelineEvent({
                    type: "FULL_STATE",
                    projectId,
                    payload: { state: state as GraphState },
                    timestamp: new Date().toISOString(),
                });
            } catch (error) {
                console.error('Error publishing during regeneration:', error);
            }
        }

        await publishPipelineEvent({
            type: "SCENE_COMPLETED",
            projectId,
            payload: {
                sceneId: payload.sceneId,
                sceneIndex: sceneIndexToRetry,
                videoUrl: "" // Will be in FULL_STATE
            },
            timestamp: new Date().toISOString(),
        });
    } else {
        console.warn(`Scene ${sceneId} not found in pipeline for projectId: ${projectId}`);
        await publishPipelineEvent({
            type: "WORKFLOW_FAILED",
            projectId,
            payload: { error: `Scene ${sceneId} not found.` },
            timestamp: new Date().toISOString(),
        });
    }
}

async function handleStopPipelineCommand(command: Extract<PipelineCommand, { type: "STOP_PIPELINE"; }>) {
    const { projectId } = command;
    console.log(`Stopping pipeline for projectId: ${projectId}`);

    // For now, stopping means saving the current state (if any) and effectively ending the process's management of it.
    // LangGraph's stream will naturally end, and its state will be saved as a checkpoint.
    // If a more forceful termination is needed, it would involve more complex process management.

    // We'll rely on the streaming loop to gracefully complete/checkpoint the last known state.
    // A future enhancement could involve explicit termination signals to the LangGraph process if it's external.
    // For now, we'll just acknowledge the command and let the worker eventually stop processing this stream.
    const runnableConfig: RunnableConfig = {
        configurable: { thread_id: projectId },
    };
    // Optionally, load and save to ensure latest state is persisted on explicit stop
    const currentCheckpoint = await checkpointerManager.loadCheckpoint(runnableConfig);
    if (currentCheckpoint) {
        await checkpointerManager.saveCheckpoint(runnableConfig, currentCheckpoint);
        console.log(`Pipeline for ${projectId} stopped and state checkpointed.`);
    } else {
        console.warn(`No active pipeline or checkpoint found to stop for projectId: ${projectId}`);
    }
}


async function main() {
    console.log("Starting pipeline worker...");

    checkpointerManager.getCheckpointer();

    const [ videoCommandsTopic ] = await pubsub.topic(VIDEO_COMMANDS_TOPIC_NAME).get({ autoCreate: true });
    await pubsub.topic(VIDEO_EVENTS_TOPIC_NAME).get({ autoCreate: true });
    await videoCommandsTopic.subscription(PIPELINE_WORKER_SUBSCRIPTION_NAME).get({ autoCreate: true });

    const pipelineCommandsSubscription = pubsub.subscription(PIPELINE_WORKER_SUBSCRIPTION_NAME);
    console.log(`Listening for commands on ${PIPELINE_WORKER_SUBSCRIPTION_NAME}...`);

    pipelineCommandsSubscription.on("message", async (message) => {
        try {
            const command = JSON.parse(message.data.toString()) as PipelineCommand;
            console.log(`Worker received command: ${command.type} for projectId: ${command.projectId}. Full command:`, JSON.stringify(command, null, 2));

            await projectIdStore.run(command.projectId, async () => {
                switch (command.type) {
                    case "START_PIPELINE":
                        await handleStartPipelineCommand(command);
                        break;
                    case "REQUEST_FULL_STATE":
                        await handleRequestFullStateCommand(command);
                        break;
                    case "RESUME_PIPELINE":
                        await handleResumePipelineCommand(command);
                        break;
                    case "REGENERATE_SCENE":
                        await handleRegenerateSceneCommand(command);
                        break;
                    case "STOP_PIPELINE":
                        await handleStopPipelineCommand(command);
                        break;
                }
            });
            message.ack();
        } catch (error) {
            console.error("Error processing message:", error);
            message.nack();
        }
    });

    process.on("SIGINT", () => {
        console.log("Shutting down worker...");
        pipelineCommandsSubscription.close();
        process.exit(0);
    });
}

main().catch(console.error);
