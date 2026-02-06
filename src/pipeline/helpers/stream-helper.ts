// src/pipeline/helpers/stream-helper.ts
import { WorkflowState } from "../../shared/types/index.js";
import { RunnableConfig } from "@langchain/core/runnables";
import { checkAndPublishInterruptFromSnapshot, checkAndPublishInterruptFromStream } from "./interrupts.js";
import { PipelineEvent } from "../../shared/types/pipeline.types.js";
import { Command, CompiledStateGraph } from "@langchain/langgraph";



export async function streamWithInterruptHandling(
    projectId: string,
    compiledGraph: CompiledStateGraph<WorkflowState, Partial<WorkflowState>, string>,
    input: Partial<WorkflowState> | Command<unknown, Partial<WorkflowState>> | null,
    config: RunnableConfig,
    commandName: string,
    publishEvent: (event: PipelineEvent) => Promise<void>
): Promise<void> {

    console.log({ commandName, projectId, config }, `Starting stream.`);

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
                console.debug({ commandName, projectId, update }, `Processing stream upate`);
                const [ updateType, state ] = update;
                const isInterrupt = await checkAndPublishInterruptFromStream(projectId, state as WorkflowState, publishEvent);

                // if (!isInterrupt) {
                //     // Publish state update
                //     await publishEvent({
                //         type: "FULL_STATE",
                //         projectId,
                //         payload: { state: state as WorkflowState },
                //         timestamp: new Date().toISOString()
                //     });
                // }

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
        await publishEvent({
            type: "WORKFLOW_COMPLETED",
            projectId,
            timestamp: new Date().toISOString()
        });

        console.log({ commandName, projectId }, `Stream completed.`);

    } catch (error) {
        console.error({ error, commandName, projectId }, `Error during stream execution.`);

        const isNotFatalError = await checkAndPublishInterruptFromStream(projectId, (await compiledGraph.getState(config)).values as WorkflowState, publishEvent)
            || await checkAndPublishInterruptFromSnapshot(projectId, compiledGraph, config, publishEvent);
        if (!isNotFatalError) {
            throw error;
        }
    }
}
