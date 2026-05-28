// src/pipeline/helpers/stream-helper.ts
import { InterruptValue, WorkflowState } from "../../shared/types/workflow.types.js";
import { RunnableConfig } from "@langchain/core/runnables";
import { scanForTerminalInterrupt, scanStateSnapshotForTerminalInterrupt } from "./interrupts.js";
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

            const interruptValue = scanForTerminalInterrupt(packet, workflowState, commandName, publishEvent);

            if (interruptValue) {
                await publishEvent({
                    type: "LLM_INTERVENTION_NEEDED",
                    projectId,
                    worldId,
                    teamId,
                    userId,
                    payload: {
                        type: interruptValue.type,
                        error: interruptValue.error,
                        params: interruptValue.params,
                        functionName: interruptValue.functionName,
                        nodeName: interruptValue.nodeName,
                        attemptCount: interruptValue.attempts
                    },
                    timestamp: new Date().toISOString()
                });
            }
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

        const interruptValue = scanStateSnapshotForTerminalInterrupt(packet, stateSnapshot, commandName, publishEvent);

        if (interruptValue) {
            await publishEvent({
                type: "LLM_INTERVENTION_NEEDED",
                projectId,
                worldId,
                teamId,
                userId,
                payload: {
                    type: interruptValue.type,
                    error: interruptValue.error,
                    params: interruptValue.params,
                    functionName: interruptValue.functionName,
                    nodeName: interruptValue.nodeName,
                    attemptCount: interruptValue.attempts
                },
                timestamp: new Date().toISOString()
            });
        }
    }
}
