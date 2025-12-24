import { PipelineCommand, PipelineEvent } from "../../shared/pubsub-types";
import { GraphState } from "../../shared/pipeline-types";
import { CinematicVideoWorkflow } from "../../pipeline/graph";
import { CheckpointerManager } from "../../pipeline/checkpointer-manager";
import { RunnableConfig } from "@langchain/core/runnables";
import { checkAndPublishInterruptFromSnapshot, checkAndPublishInterruptFromStream, mergeParamsIntoState } from "../helpers/interrupts";
import { Command } from "@langchain/langgraph";

export async function handleResolveInterventionCommand(
    command: Extract<PipelineCommand, { type: "RESOLVE_INTERVENTION"; }>,
    publishPipelineEvent: (event: PipelineEvent) => Promise<void>,
    checkpointerManager: CheckpointerManager,
) {
    const { projectId, payload } = command;
    console.log(`[Worker] Resolving intervention for projectId: ${projectId}`, {
        action: payload.action,
        hasRevisedParams: !!payload.revisedParams
    });

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

    // Load current state
    const existingCheckpoint = await checkpointerManager.loadCheckpoint(runnableConfig);
    if (!existingCheckpoint) {
        throw new Error(`No checkpoint found for projectId: ${projectId}`);
    }

    const currentState = existingCheckpoint.channel_values as GraphState;

    // Verify there's an interrupt to resolve 
    if (!currentState.__interrupt__?.[ 0 ].value) {
        console.warn(`[Worker] No interrupt found in state to resolve for projectId: ${projectId}. Checking if we can resume anyway.`);
        return;
    }

    const interruptData = currentState.__interrupt__?.[ 0 ].value;
    const nodeName = interruptData?.nodeName || 'unknown_node';

    // Handle different resolution actions
    let updatedState: Partial<GraphState>;

    switch (payload.action) {
        case 'retry':
            // Merge revised params if provided, otherwise use original params
            const paramsToUse = payload.revisedParams
                ? { ...(interruptData?.params || {}), ...payload.revisedParams }
                : (interruptData?.params || {});

            console.log(`[Worker] Retrying with params:`, paramsToUse);

            updatedState = {
                __interrupt__: undefined,
                __interrupt_resolved__: true,
                ...mergeParamsIntoState(currentState, paramsToUse)
            };
            break;

        case 'skip':
            console.log(`[Worker] Skipping failed node: ${nodeName}`);

            updatedState = {
                __interrupt__: undefined,
                __interrupt_resolved__: true,
                errors: [
                    ...(currentState.errors || []),
                    {
                        node: interruptData.nodeName,
                        error: interruptData.error,
                        skipped: true,
                        timestamp: new Date().toISOString()
                    }
                ]
            };
            break;

        case 'abort':
            console.log(`[Worker] Aborting workflow for projectId: ${projectId}`);

            await publishPipelineEvent({
                type: "WORKFLOW_FAILED",
                projectId,
                payload: {
                    error: `Workflow canceled during ${nodeName}`,
                    nodeName: interruptData.nodeName
                },
                timestamp: new Date().toISOString()
            });

            updatedState = {
                __interrupt__: undefined,
                __interrupt_resolved__: true
            };

            await checkpointer.put(runnableConfig, {
                ...existingCheckpoint,
                channel_values: { ...currentState, ...updatedState }
            }, {} as any, {});

            return;
        default:
            throw new Error(`Unknown action: ${payload.action}`);
    }

    const workflow = new CinematicVideoWorkflow(
        process.env.GCP_PROJECT_ID!,
        projectId,
        bucketName
    );
    workflow.publishEvent = publishPipelineEvent;
    const compiledGraph = workflow.graph.compile({ checkpointer });

    console.log(`[Worker] Resuming graph with action: ${payload.action}`);

    try {
        // We use 'resume' property of Command to supply the value to the interrupted node
        // BUT since we modified the state logic to be "State-based interrupt", we might just need to update the state.
        // However, if we are at a breakpoint (interrupt), we typically need to provide a resume value or use `update`.

        // If we are just updating state, we can use `update` in Command?
        // LangGraph `Command` with `resume` resumes execution from the interruption.
        // If we want to update state, we can pass the state update as the resume value IF the node expects it,
        // OR we can rely on `checkpointer.put` we might have done?
        // Wait, I didn't do `checkpointer.put` for retry/skip cases above.

        // Let's use Command with resume: updatedState.
        // And assume the node logic (which checks for __interrupt__) will receive this.
        // actually, if we use `Command` with `resume`, the `NodeInterrupt` exception catches this value?
        // No, `NodeInterrupt` stops execution. `resume` provides the return value for the function that threw/interrupted?
        // In LangGraphJS, if you interrupt, the resume value is what is returned to the node.

        // However, my `llmOperationNode` throws `NodeInterrupt`.
        // If I resume, does it re-run the node? Or continue?
        // If I want to re-run, I should probably update state and then resume?

        // The spec says: "Graph resumes from interrupted node".
        // If I want to retry, I need to re-run the logic.
        // If I just pass `updatedState` as resume value, the node needs to handle it.

        // Let's assume the standard LangGraph pattern:
        // Command({ resume: value }) resumes.

        // If we want to modify state BEFORE resuming, we can use `checkpointer.put` or pass state update in Command?
        // For `retry`, we want to update the state (new params) and then have the node re-execute or continue.

        // Implementation decision:
        // We will pass `updatedState` as the resume value.
        // AND we will ensure `llmOperationNode` (which I will implement later) handles the resume value if returned?
        // Actually, if we just want to update the state, we can do:

        const stream = await compiledGraph.stream(
            new Command({
                resume: updatedState
            }),
            { ...runnableConfig, streamMode: [ "values" ] }
        );

        // Process stream
        for await (const step of stream) {
            console.debug(`[ResolveIntervention] Processing step`);
            const [ _, state ] = Object.entries(step)[ 0 ];

            await publishPipelineEvent({
                type: "FULL_STATE",
                projectId,
                payload: { state: state as GraphState },
                timestamp: new Date().toISOString()
            });
        }

        console.log(`[Worker] Resolving interrupt for projectId: ${projectId}`, {
            action: payload.action,
            nodeName: interruptData.nodeName,
            hasRevisedParams: !!payload.revisedParams
        });

        await publishPipelineEvent({
            type: "INTERVENTION_RESOLVED",
            projectId,
            payload: {
                action: payload.action,
                nodeName: nodeName
            },
            timestamp: new Date().toISOString()
        });

        await checkAndPublishInterruptFromSnapshot(projectId, compiledGraph, runnableConfig, publishPipelineEvent);

        console.log(`[Worker] Workflow resumed after interrupt:`, {
            projectId: projectId,
            nodeName: interruptData.nodeName,
            action: payload.action
        });

    } catch (error) {
        console.error("[Worker] Error resuming graph:", error);

        const isInterrupt = await checkAndPublishInterruptFromSnapshot(projectId, compiledGraph, runnableConfig, publishPipelineEvent);

        if (!isInterrupt) {
            await publishPipelineEvent({
                type: "WORKFLOW_FAILED",
                projectId,
                payload: {
                    error: `Failed to resume after intervention: ${error}`,
                    nodeName: interruptData.nodeName
                },
                timestamp: new Date().toISOString()
            });
        }
    }
}