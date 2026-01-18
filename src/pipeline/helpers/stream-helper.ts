// src/pipeline/helpers/stream-helper.ts
import { WorkflowState } from "../../shared/types/workflow.types";
import { RunnableConfig } from "@langchain/core/runnables";
import { checkAndPublishInterruptFromSnapshot, checkAndPublishInterruptFromStream } from "./interrupts";
import { PipelineEvent } from "../../shared/types/pipeline.types";
import { Command, CompiledStateGraph } from "@langchain/langgraph";



export async function streamWithInterruptHandling(
    projectId: string,
    compiledGraph: CompiledStateGraph<WorkflowState, Partial<WorkflowState>, string>,
    initialState: Partial<WorkflowState> | Command<unknown, Partial<WorkflowState>> | null,
    runnableConfig: RunnableConfig,
    commandName: string,
    publishEvent: (event: PipelineEvent) => Promise<void>
): Promise<void> {

    console.log(`[${commandName}] Starting stream for projectId: ${projectId}`);
    try {
        const stream = await compiledGraph.stream(
            initialState,
            {
                ...runnableConfig,
                streamMode: [ "values" ],
                recursionLimit: 100,
            }
        );

        for await (const update of stream) {
            try {
                console.debug(`[${commandName}] Processing stream step`);
                const [ updateType, state ] = update;
                const isInterrupt = await checkAndPublishInterruptFromStream(projectId, state as any, publishEvent);

                // if (!isInterrupt) {
                //     // Publish state update
                //     await publishEvent({
                //         type: "FULL_STATE",
                //         projectId,
                //         payload: { state: state as WorkflowState },
                //         timestamp: new Date().toISOString()
                //     });
                // }

            } catch (error) {
                console.error(`[${commandName}] Error publishing state:`, error);
                // Don't throw - continue processing stream
            }
        }

        console.log(`[${commandName}] Stream completed`);

    } catch (error) {
        console.error(`[${commandName}] Error during stream execution:`, error);

        const isNotFatalError = await checkAndPublishInterruptFromSnapshot(projectId, compiledGraph, runnableConfig, publishEvent)
            || await checkAndPublishInterruptFromSnapshot(projectId, compiledGraph, runnableConfig, publishEvent);
        if (!isNotFatalError) {
            await publishEvent({
                
                type: "WORKFLOW_FAILED",
                projectId,
                payload: {
                    error: `Workflow failed: ${error instanceof Error ? error.message : String(error)}`
                },
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }
}
