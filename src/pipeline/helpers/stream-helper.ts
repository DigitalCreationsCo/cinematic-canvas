// src/pipeline/helpers/stream-helper.ts
import { WorkflowState } from "../../shared/types/workflow.types.js";
import { RunnableConfig } from "@langchain/core/runnables";
import { scanForInterrupt } from "./interrupts.js";
import { PipelineEvent } from "../../shared/types/pipeline.types.js";
import { Command, CompiledStateGraph } from "@langchain/langgraph";
import { extractInterruptValue } from "../../shared/utils/errors.js";
import { IterableReadableStream } from "@langchain/core/utils/stream";


export async function handleStream(
    packet: { projectId: string, worldId?: string, teamId: string, userId: string },
    commandName: string,
    stream: IterableReadableStream<any>,
    publishEvent: (event: PipelineEvent) => Promise<void>,
    compiledGraph: CompiledStateGraph<WorkflowState, Partial<WorkflowState>, string>,
    config: RunnableConfig
): Promise<void> {

    const { projectId, worldId, teamId, userId } = packet;

    console.log({ commandName, projectId }, `Streaming`);
    try {
        for await (const update of stream) {

            const [updateType, state] = update;
            const workflowState = state as WorkflowState;

            await scanForInterrupt(packet, workflowState, publishEvent);
        }
    } catch (error: any) {

        if (error.name === 'AbortError') {
            console.error({ commandName, projectId, error }, `Stream aborted via controller.`);
        } else {
            console.error({ commandName, projectId, error }, `Unhandled stream exception.`);
            throw error;
        }

        // const isInterruptException = await checkAndPublishInterruptFromSnapshot(projectId, compiledGraph, config, publishEvent);

        // if (isInterruptException) {
        //     console.log({ commandName, projectId }, `Stream interrupted by intervention. Emitting WORKFLOW_COMPLETED.`);
        //     await emitWorkflowCompleted();
        //     return;
        // }

    } finally {
        // Evaluate true state deterministically upon stream closure
        const stateSnapshot = await compiledGraph.getState(config);
        const pendingNodes = stateSnapshot.next || [];
        const isGraphFullyExhausted = pendingNodes.length === 0;

        if (isGraphFullyExhausted) {
            console.log({ commandName, projectId }, `Execution complete. No pending nodes.`);
            await publishEvent({
                type: "WORKFLOW_COMPLETED",
                projectId,
                worldId,
                teamId,
                userId,
                timestamp: new Date().toISOString()
            });
            return;
        }

        // Graph is suspended. Inspect tasks to determine suspension root cause.
        const pendingTasks = stateSnapshot.tasks || [];
        if (pendingTasks.length > 0) {
            const primarySuspendedTask = pendingTasks[0];
            const activeTaskInterrupts = primarySuspendedTask.interrupts || [];

            if (activeTaskInterrupts.length > 0) {
                const interruptPayload = activeTaskInterrupts[0].value as any;
                const suspensionType = interruptPayload?.type;

                const nonTerminalInterrupts = ['waiting_for_job', 'waiting_for_batch'];
                const terminalInterrupts = ['user_approval_before_video_gen', 'user_approval_after_storyboard_gen', 'lm_intervention'];

                if (terminalInterrupts.includes(suspensionType)) {
                    console.log({ commandName, projectId, suspensionType }, `Terminal interrupt identified. Emitting completion.`);
                    await publishEvent({
                        type: "WORKFLOW_COMPLETED",
                        projectId,
                        worldId,
                        teamId,
                        userId,
                        timestamp: new Date().toISOString()
                    });
                } else if (nonTerminalInterrupts.includes(suspensionType)) {
                    console.log({ commandName, projectId, suspensionType }, `Asynchronous node pause detected. Preserving active workflow state.`);
                } else {
                    console.warn({ commandName, projectId, suspensionType }, `Unrecognized interrupt type. Suppressing completion emission.`);
                }
            }
        }
    }
}
