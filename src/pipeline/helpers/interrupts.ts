import { RunnableConfig } from "@langchain/core/runnables";
import { LlmRetryInterruptValue, WorkflowState } from "../../shared/types/index.js";
import { PipelineEvent } from "../../shared/types/pipeline.types.js";
import { extractErrorDetails, extractErrorMessage, extractInterruptValue } from "../../shared/utils/errors.js";
import { NodeInterrupt } from "@langchain/langgraph";

export type PipelineEventPublisher = (event: PipelineEvent) => Promise<void>;

export async function checkAndPublishInterruptFromSnapshot(
    projectId: string,
    compiledGraph: any,
    runnableConfig: RunnableConfig,
    publishEvent: PipelineEventPublisher
): Promise<boolean> {
    try {
        console.log(` Checking for interrupts from state snapshot. ProjectId: ${projectId}`);

        // Get current state snapshot
        const stateSnapshot = await compiledGraph.getState(runnableConfig);

        // Method 1: Check state values for interrupt data
        if (stateSnapshot.values?.__interrupt__?.[ 0 ]?.value) {
            const interruptValue = (stateSnapshot.values as WorkflowState)?.__interrupt__?.[ 0 ]?.value!;

            // Ignore system interrupts (waiting for jobs)
            if (interruptValue.type !== 'lm_intervention' && interruptValue.type !== 'lm_retry_exhausted') {
                console.log(` System interrupt detected (${interruptValue.error || 'unknown'}). Not publishing intervention event.`);
                return false;
            }

            console.log(` Interrupt detected in state from snapshot:`, {
                type: interruptValue.type,
                nodeName: interruptValue.nodeName,
                functionName: interruptValue.functionName,
                attemptCount: interruptValue.attempt
            });

            // Only publish if not already resolved
            if (!stateSnapshot.values.__interrupt_resolved__) {
                await publishEvent({
                    type: "LLM_INTERVENTION_NEEDED",
                    projectId,
                    payload: {
                        error: interruptValue.error,
                        params: interruptValue.params,
                        functionName: interruptValue.functionName,
                        nodeName: interruptValue.nodeName,
                        attemptCount: interruptValue.attempt
                    },
                    timestamp: new Date().toISOString()
                });

                return true;
            }
        }

        // Method 2: Check if graph is paused (state.next is populated)
        if (stateSnapshot.next && stateSnapshot.next.length > 0) {
            console.log(` Graph paused at nodes: ${stateSnapshot.next.join(', ')}`);

            // If paused but no interrupt data, this might be a different type of pause
            // Log for debugging but don't publish intervention event
            if (stateSnapshot.values?.__interrupt__?.[ 0 ].value) {
                console.warn(` Graph paused but no interrupt data found`);
            }
        }

        // Method 3: Fallback - check tasks array (for interrupt_before/after)
        if (stateSnapshot.tasks && stateSnapshot.tasks.length > 0) {
            for (const task of stateSnapshot.tasks) {
                if (task.interrupts && task.interrupts.length > 0) {
                    const interrupt = task.interrupts[ 0 ];
                    const interruptValue = interrupt.value as LlmRetryInterruptValue;

                    if (interruptValue && (interruptValue.type === 'lm_intervention' ||
                        interruptValue.type === 'lm_retry_exhausted')) {

                        console.log(` Interrupt found in task:`, task.name);

                        await publishEvent({
                            type: "LLM_INTERVENTION_NEEDED",
                            projectId,
                            payload: {
                                error: interruptValue.error,
                                params: interruptValue.params,
                                functionName: interruptValue.functionName,
                                nodeName: interruptValue.nodeName || task.name,
                                attemptCount: interruptValue.attempts
                            },
                            timestamp: new Date().toISOString()
                        });

                        return true;
                    }
                }
            }
        }

    } catch (error) {
        console.error(" Error checking for interrupts:", error);
    }

    return false;
}

export async function checkAndPublishInterruptFromStream(
    projectId: string,
    streamValues: WorkflowState,
    publishEvent: PipelineEventPublisher
): Promise<boolean> {
    try {
        console.log({ projectId, streamValues }, ` Checking interrupt values`);

        if (streamValues.__interrupt__?.[ 0 ]?.value) {
            const interruptValue = extractInterruptValue(streamValues.__interrupt__[ 0 ]?.value?.error);
            if (!interruptValue) {
                console.debug({ projectId, interruptValue }, `No interrupt value detected. Continuing`);
                return false;
            }

            if ((interruptValue.type === 'waiting_for_job' || interruptValue.type === 'waiting_for_batch')) {
                console.log({ interruptValue }, `System waiting for job`);
                return false;
            }

            if (!streamValues.__interrupt_resolved__) {
                console.log({ interruptValue }, ` Interrupt detected in state from stream`);
                await publishEvent({
                    type: "LLM_INTERVENTION_NEEDED",
                    projectId,
                    payload: {
                        error: interruptValue.error,
                        params: interruptValue.params,
                        functionName: interruptValue.functionName,
                        nodeName: interruptValue.nodeName,
                        attemptCount: interruptValue.attempts
                    },
                    timestamp: new Date().toISOString()
                });

                throw new Error(interruptValue.error);
            }
        }
    } catch (error) {
        console.error(" Error checking for interrupts:", error);
    }

    return false;
}

/**
 * Intercepts errors and throws a NodeInterrupt for human-in-the-loop intervention.
 * 
 * IMPORTANT: If the error is already a NodeInterrupt (e.g. from upstream batch processing),
 * it re-throws to preserve the original interrupt context.
 */
export function interceptNodeInterruptAndThrow(
    error: any,
    nodeName: string,
    projectId: string,
    context: Partial<LlmRetryInterruptValue> = {}
) {

    if (error instanceof NodeInterrupt) {
        console.debug("Caught Interrupt Value:", (error as any).value);
        throw error;
    }

    const errorMessage = extractErrorMessage(error);
    const errorDetails = extractErrorDetails(error);
    const defaults: Omit<LlmRetryInterruptValue, "projectId"> = {
        error: errorMessage,
        errorDetails: errorDetails,
        attempts: context?.attempts ?? 1,
        maxRetries: context?.maxRetries ?? 3,
        functionName: nodeName,
        lastAttemptTimestamp: new Date().toISOString(),
        type: 'lm_intervention',
        nodeName: nodeName,
        stackTrace: error instanceof Error ? error.stack : undefined,
    };

    let interruptValue = extractInterruptValue(error);
    if (!interruptValue) {
        interruptValue = {
            error: errorMessage,
            type: "lm_intervention", // can be defined as a different type
            functionName: nodeName,
            nodeName,
            projectId: projectId,
            attempts: defaults.attempts,
            maxRetries: defaults.maxRetries,
            lastAttemptTimestamp: defaults.lastAttemptTimestamp,
        };
    } else {
        interruptValue = {
            ...defaults,
            ...interruptValue,
            ...context,
            projectId: projectId
        };
    }

    throw new NodeInterrupt(interruptValue);
}
