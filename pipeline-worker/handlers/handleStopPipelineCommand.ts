import { PipelineCommand, PipelineEvent } from "../../shared/pubsub-types";
import { GraphState } from "../../shared/pipeline-types";
import { CinematicVideoWorkflow } from "../../pipeline/graph";
import { CheckpointerManager } from "../../pipeline/checkpointer-manager";
import { RunnableConfig } from "@langchain/core/runnables";
import { checkAndPublishInterruptFromSnapshot, checkAndPublishInterruptFromStream } from "../helpers/interrupts";

export async function handleStopPipelineCommand(
    command: Extract<PipelineCommand, { type: "STOP_PIPELINE"; }>,
    publishPipelineEvent: (event: PipelineEvent) => Promise<void>,
    checkpointerManager: CheckpointerManager,
) {
    const { projectId } = command;
    console.log(`Stopping pipeline for projectId: ${projectId}`);

    // For now, stopping means saving the current state (if any) and effectively ending the process's management of it.
    // We'll rely on the streaming loop to gracefully complete/checkpoint the last known state.

    const runnableConfig: RunnableConfig = {
        configurable: { thread_id: projectId },
    };

    const currentCheckpoint = await checkpointerManager.loadCheckpoint(runnableConfig);
    if (currentCheckpoint) {
        await checkpointerManager.saveCheckpoint(runnableConfig, currentCheckpoint);
        console.log(`Pipeline for ${projectId} stopped and state checkpointed.`);
    } else {
        console.warn(`No active pipeline or checkpoint found to stop for projectId: ${projectId}`);
    }
}