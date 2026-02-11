// src/pipeline/helpers/stream-helper.ts
import { WorkflowState } from "../../shared/types/index.js";
import { RunnableConfig } from "@langchain/core/runnables";
import { checkAndPublishInterruptFromSnapshot, checkAndPublishInterruptFromStream } from "./interrupts.js";
import { PipelineEvent } from "../../shared/types/pipeline.types.js";
import { Command, CompiledStateGraph } from "@langchain/langgraph";
import { extractInterruptValue } from "../../shared/utils/errors.js";



export async function streamWithInterruptHandling(
    projectId: string,
    compiledGraph: CompiledStateGraph<WorkflowState, Partial<WorkflowState>, string>,
    input: Partial<WorkflowState> | Command<unknown, Partial<WorkflowState>> | null,
    config: RunnableConfig,
    commandName: string,
    publishEvent: (event: PipelineEvent) => Promise<void>
): Promise<void> {

    console.log({ commandName, projectId, config }, `Starting stream.`);
    let isWaitingInterrupt = false;
    let workflowCompletedEmitted = false; // Track if WORKFLOW_COMPLETED was already emitted

    const emitWorkflowCompleted = async () => {
        if (!workflowCompletedEmitted) {
            workflowCompletedEmitted = true;
            await publishEvent({
                type: "WORKFLOW_COMPLETED",
                projectId,
                timestamp: new Date().toISOString()
            });
        }
    };

    try {
        const stream = await compiledGraph.stream(
            input,
            {
                ...config,
                streamMode: [ "values" ],
                recursionLimit: 100,
            }
        );
        console.debug({ commandName, projectId }, `Stream initialized. Awaiting chunks...`);

        for await (const update of stream) {
            try {
                console.debug({ commandName, projectId, update }, `Processing stream update`);
                const [ updateType, state ] = update;
                const workflowState = state as WorkflowState;

                // Track if we are in a waiting state
                const interrupt = workflowState.__interrupt__?.[ 0 ]?.value;
                if (interrupt) {
                    const interruptValue = extractInterruptValue(interrupt.error);
                    isWaitingInterrupt = interruptValue && (interruptValue.type === 'waiting_for_job' || interruptValue.type === 'waiting_for_batch');
                } else {
                    isWaitingInterrupt = false;
                }

                await checkAndPublishInterruptFromStream(projectId, workflowState, publishEvent);

            } catch (error: any) {
                if (error.name === 'AbortError' || config.signal?.aborted) {
                    console.error({ commandName, projectId }, `Stream aborted by controller.`);
                }
                else {
                    console.error({ commandName, projectId }, `Stream error.`);
                    throw error;
                }
            }
        }

        // Only emit WORKFLOW_COMPLETED if the loop finished naturally and we're NOT in a waiting interrupt
        if (!isWaitingInterrupt) {
            await emitWorkflowCompleted();
        }

        console.log({ commandName, projectId }, `Stream completed. isWaitingInterrupt: ${isWaitingInterrupt}`);

    } catch (error: any) {
        console.error({ error, commandName, projectId }, `Error during stream execution.`);

        // Check if this was a non-waiting interrupt that was already handled by checkAndPublishInterruptFromStream
        // or if we can harvest one from the current state.
        const currentState = await compiledGraph.getState(config);
        const isHandledInterrupt = await checkAndPublishInterruptFromSnapshot(projectId, compiledGraph, config, publishEvent);

        if (isHandledInterrupt) {
            console.log({ commandName, projectId }, `Stream interrupted by intervention. Emitting WORKFLOW_COMPLETED.`);
            await emitWorkflowCompleted();
            return;
        }

        if (error.name === 'AbortError' || config.signal?.aborted) {
            return;
        }

        throw error;
    }
}
