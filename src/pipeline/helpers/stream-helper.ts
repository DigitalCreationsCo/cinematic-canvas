// src/pipeline/helpers/stream-helper.ts
import { WorkflowState } from "../../shared/types/index.js";
import { RunnableConfig } from "@langchain/core/runnables";
import { scanForInterrupt } from "./interrupts.js";
import { PipelineEvent } from "../../shared/types/pipeline.types.js";
import { Command, CompiledStateGraph } from "@langchain/langgraph";
import { extractInterruptValue } from "../../shared/utils/errors.js";
import { IterableReadableStream } from "@langchain/core/utils/stream";


export async function handleStream(
    projectId: string,
    stream: IterableReadableStream<any>,
    commandName: string,
    publishEvent: (event: PipelineEvent) => Promise<void>
): Promise<void> {

    const emitWorkflowCompleted = async () => {
        await publishEvent({
            type: "WORKFLOW_COMPLETED",
            projectId,
            timestamp: new Date().toISOString()
        });
    };

    console.log({ commandName, projectId }, `Streaming`);
    // try {
        for await (const update of stream) {
            try {
                const [ updateType, state ] = update;
                const workflowState = state as WorkflowState;

                await scanForInterrupt(projectId, workflowState, publishEvent);

            } catch (error: any) {
                if (error.name === 'AbortError') {
                    console.error({ commandName, projectId, error }, `Stream aborted by controller`);
                }
                else {
                    console.error({ commandName, projectId, error }, `Stream error`);
                    throw error;
                }
            }
        }

        console.log({ commandName, projectId }, `Stream completed`);
        await emitWorkflowCompleted();

    // } catch (error: any) {
    //     console.error({ error, commandName, projectId }, `Error during stream execution.`);

    //     const isInterruptException = await checkAndPublishInterruptFromSnapshot(projectId, compiledGraph, config, publishEvent);

    //     if (isInterruptException) {
    //         console.log({ commandName, projectId }, `Stream interrupted by intervention. Emitting WORKFLOW_COMPLETED.`);
    //         await emitWorkflowCompleted();
    //         return;
    //     }

    //     if (error.name === 'AbortError' || config.signal?.aborted) {
    //         return;
    //     }

    //     throw error;
    // }
}
