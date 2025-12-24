import { PipelineCommand, PipelineEvent } from "../../shared/pubsub-types";
import { GraphState } from "../../shared/pipeline-types";
import { CinematicVideoWorkflow } from "../../pipeline/graph";
import { CheckpointerManager } from "../../pipeline/checkpointer-manager";
import { RunnableConfig } from "@langchain/core/runnables";
import { checkAndPublishInterruptFromSnapshot, checkAndPublishInterruptFromStream } from "../helpers/interrupts";
import { Command } from "@langchain/langgraph";

export async function handleRegenerateSceneCommand(
    command: Extract<PipelineCommand, { type: "REGENERATE_SCENE"; }>,
    publishPipelineEvent: (event: PipelineEvent) => Promise<void>,
    checkpointerManager: CheckpointerManager,
) {
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
            sceneIndex: -1,
            totalScenes: -1
        },
        timestamp: new Date().toISOString(),
    });

    let currentState = existingCheckpoint.channel_values as GraphState;
    const sceneId = payload.sceneId;

    const sceneIndexToRetry = currentState.storyboardState?.scenes.findIndex(s => s.id === sceneId);

    if (sceneIndexToRetry !== undefined && sceneIndexToRetry !== -1) {
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
        runnableConfig.configurable = { ...runnableConfig.configurable, ...currentState };

        const workflow = new CinematicVideoWorkflow(process.env.GCP_PROJECT_ID!, projectId, bucketName);
        workflow.publishEvent = publishPipelineEvent;

        await checkpointer.put(runnableConfig, existingCheckpoint, {} as any, {});
        const compiledGraph = workflow.graph.compile({ checkpointer });

        console.log(`Pipeline for projectId: ${projectId} restarting from scene ${sceneId} with forceRegenerate=${payload.forceRegenerate}`);

        try {
            const stream = await compiledGraph.stream(
                new Command({
                    goto: "process_scene" as any,
                    update: currentState
                }),
                { ...runnableConfig, streamMode: [ "values" ] }
            );

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

                    await checkAndPublishInterruptFromStream(projectId, state as GraphState, publishPipelineEvent);

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
        } catch (err) {
            console.error('[handleRegenerateSceneCommand] Error during stream execution:', err);
        } finally {
            await checkAndPublishInterruptFromSnapshot(projectId, compiledGraph, runnableConfig, publishPipelineEvent);
        }
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