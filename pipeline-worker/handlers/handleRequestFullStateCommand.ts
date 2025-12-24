import { PipelineCommand, PipelineEvent } from "../../shared/pubsub-types";
import { GraphState, InitialGraphState, Storyboard, LlmRetryInterruptValue } from "../../shared/pipeline-types";
import { CinematicVideoWorkflow } from "../../pipeline/graph";
import { CheckpointerManager } from "../../pipeline/checkpointer-manager";
import { RunnableConfig } from "@langchain/core/runnables";
import { checkAndPublishInterruptFromSnapshot, checkAndPublishInterruptFromStream, mergeParamsIntoState } from "../helpers/interrupts";
import { GCPStorageManager } from "../../pipeline/storage-manager";

export async function handleRequestFullStateCommand(
    command: Extract<PipelineCommand, { type: "REQUEST_FULL_STATE"; }>,
    publishPipelineEvent: (event: PipelineEvent) => Promise<void>,
    checkpointerManager: CheckpointerManager,
) {
    const { projectId } = command;
    const runnableConfig: RunnableConfig = {
        configurable: { thread_id: projectId },
    };

    try {
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

            const storage = new GCPStorageManager(process.env.GCP_PROJECT_ID!, projectId, bucketName);

            let state: GraphState;
            try {
                console.log("   Checking for existing storyboard...");

                const storyboardPath = `${projectId}/scenes/storyboard.json`;
                const storyboard = await storage.downloadJSON<Storyboard>(storyboardPath);

                console.log("   Found existing storyboard. Resuming workflow.");

                state = {
                    localAudioPath: "",
                    creativePrompt: storyboard.metadata.creativePrompt || "",
                    hasAudio: false,
                    storyboard,
                    storyboardState: storyboard,
                    currentSceneIndex: 0,
                    audioGcsUri: "",
                    errors: [],
                    generationRules: [],
                    refinedRules: [],
                    attempts: {},
                };

                await publishPipelineEvent({
                    type: "FULL_STATE",
                    projectId,
                    payload: { state: state as GraphState },
                    timestamp: new Date().toISOString(),
                });

            } catch (error) {
                console.warn(`No state found in storage. ProjectId: ${projectId}`);
            }
        }

        if (existingCheckpoint) {
            const bucketName = process.env.GCP_BUCKET_NAME || 'default-bucket';
            const workflow = new CinematicVideoWorkflow(process.env.GCP_PROJECT_ID!, projectId, bucketName);
            const checkpointer = await checkpointerManager.getCheckpointer();
            if (checkpointer) {
                const compiledGraph = workflow.graph.compile({ checkpointer });
                await checkAndPublishInterruptFromSnapshot(projectId, compiledGraph, runnableConfig, publishPipelineEvent);
            }
        }

    } catch (error) {
        console.error("Error handling REQUEST_FULL_STATE:", error);
    }
}