import { PipelineCommand, PipelineEvent } from "../../shared/pubsub-types";
import { GraphState, InitialGraphState, Storyboard, LlmRetryInterruptValue } from "../../shared/pipeline-types";
import { CinematicVideoWorkflow } from "../../pipeline/graph";
import { CheckpointerManager } from "../../pipeline/checkpointer-manager";
import { RunnableConfig } from "@langchain/core/runnables";
import { checkAndPublishInterruptFromSnapshot, checkAndPublishInterruptFromStream, mergeParamsIntoState } from "../helpers/interrupts";
import { GCPStorageManager } from "../../pipeline/storage-manager";

export async function handleStartPipelineCommand(
    command: Extract<PipelineCommand, { type: "START_PIPELINE"; }>,
    publishPipelineEvent: (event: PipelineEvent) => Promise<void>,
    checkpointerManager: CheckpointerManager,
) {
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
        console.log(`[handleStartPipelineCommand] Resuming pipeline for projectId: ${projectId} from checkpoint.`);
        // LangGraph automatically resumes from the checkpoint if initial state is null or empty for stream
        // We still need to construct a workflow to get the compiled graph
        const workflow = new CinematicVideoWorkflow(process.env.GCP_PROJECT_ID!, projectId, bucketName);
        workflow.publishEvent = publishPipelineEvent;
        const compiledGraph = workflow.graph.compile({ checkpointer });

        try {
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

                    await checkAndPublishInterruptFromStream(projectId, state as GraphState, publishPipelineEvent);

                } catch (error) {
                    console.error('error publishing pipeline event: ');
                    console.error(JSON.stringify(error, null, 2));
                }
            }
        } catch (err) {
            console.error('[handleStartPipelineCommand] Error during stream execution:', err);
        } finally {
            await checkAndPublishInterruptFromSnapshot(projectId, compiledGraph, runnableConfig, publishPipelineEvent);
        }
    } else {
        console.log(`No checkpoint found for projectId: ${projectId}`);
        console.log("[handleStartPipelineCommand] Starting new pipeline for projectId:", projectId);
        console.log("parameters for new pipeline:", JSON.stringify(payload, null, 2));

        const workflow = new CinematicVideoWorkflow(process.env.GCP_PROJECT_ID!, projectId, bucketName);

        const sm = new GCPStorageManager(process.env.GCP_PROJECT_ID!, projectId, bucketName);

        let audioPublicUri;
        if (payload.audioGcsUri) {
            audioPublicUri = sm.getPublicUrl(payload.audioGcsUri);
        }

        try {
            console.log("   Checking for existing storyboard...");
            const storyboardPath = `${projectId}/scenes/storyboard.json`;
            const storyboard = await sm.downloadJSON<Storyboard>(storyboardPath);

            console.log("   Found existing storyboard.");

            initialState = {
                localAudioPath: payload.audioGcsUri || "",
                creativePrompt: payload.creativePrompt,
                audioGcsUri: payload.audioGcsUri,
                audioPublicUri: audioPublicUri,
                hasAudio: !!payload.audioGcsUri,
                storyboard: storyboard,
                storyboardState: storyboard,
                currentSceneIndex: 0,
                errors: [],
                generationRules: [],
                refinedRules: [],
                attempts: {},
            };
        } catch (error) {
            console.error("Error loading from GCS: ", error);
            console.log("   No existing storyboard found or error loading it. Starting fresh workflow.");

            initialState = {
                localAudioPath: payload.audioGcsUri || "",
                creativePrompt: payload.creativePrompt,
                audioGcsUri: payload.audioGcsUri,
                audioPublicUri: audioPublicUri,
                hasAudio: !!payload.audioGcsUri,
                currentSceneIndex: 0,
                errors: [],
                generationRules: [],
                refinedRules: [],
                attempts: await sm.scanCurrentAttempts(),
            };
        }

        workflow.publishEvent = publishPipelineEvent;
        const compiledGraph = workflow.graph.compile({ checkpointer });
        console.log(`Compiled graph for new pipeline for projectId: ${projectId}. Starting stream.`);

        try {
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

                    await checkAndPublishInterruptFromStream(projectId, state as GraphState, publishPipelineEvent);

                } catch (error) {
                    console.error('error publishing pipeline event for new pipeline: ');
                    console.error(JSON.stringify(error, null, 2));
                }
            }
        } catch (err) {
            console.error('[handleStartPipelineCommand] Error during new pipeline stream execution:', err);
        } finally {
            await checkAndPublishInterruptFromSnapshot(projectId, compiledGraph, runnableConfig, publishPipelineEvent);
        }
    }
}