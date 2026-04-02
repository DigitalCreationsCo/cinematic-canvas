import { InterruptValue, WorkflowState } from "../../shared/types/index.js";
import { PipelineEvent } from "../../shared/types/pipeline.types.js";
import { extractErrorDetails, extractErrorMessage, extractInterruptValue } from "../../shared/utils/errors.js";
import { interrupt, NodeInterrupt, GraphInterrupt } from "@langchain/langgraph";

export type PipelineEventPublisher = (event: PipelineEvent) => Promise<void>;

export async function scanForInterrupt(
    projectId: string,
    state: WorkflowState,
    publishEvent: PipelineEventPublisher
): Promise<void> {

    if (state.__interrupt__?.[0]?.value) {

        const interruptValue = extractInterruptValue(state.__interrupt__[0]);
        if (!interruptValue) {
            console.debug({ projectId, interruptValue }, `No interrupt value detected. Continuing`);
            return;
        }

        if ((interruptValue.type === 'waiting_for_job' || interruptValue.type === 'waiting_for_batch')) {
            console.log({ interruptValue }, `System waiting for job`);
            return;
        }

        console.log(` Interrupt detected in state from snapshot:`, {
            type: interruptValue.type,
            nodeName: interruptValue.nodeName,
            functionName: interruptValue.functionName,
            attemptCount: interruptValue.attempts
        });

        if (!state.__interrupt_resolved__) {
            console.log({ interruptValue }, ` Interrupt detected. Emitting interrupt event`);
            await publishEvent({
                type: "LLM_INTERVENTION_NEEDED",
                projectId,
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

            // REMOVED: throw Error(interruptValue.error);
            // Let LangGraph manage the suspension natively so the snapshot evaluator can read the tasks array.
        }
    }
}

/**
 * Intercepts errors and throws a NodeInterrupt for human-in-the-loop intervention.
 * 
 * IMPORTANT: If the error is already a NodeInterrupt (e.g. from upstream batch processing),
 * it re-throws to preserve the original interrupt context.
 */
export function interceptNodeErrorAndDoInterrupt(
    error: any,
    nodeName: string,
    projectId: string,
    context: Partial<InterruptValue> = {}
) {

    // const errorContext = JSON.parse(JSON.stringify(error?.message as string))?.[ 0 ]?.value || error?.message;

    if (error instanceof GraphInterrupt || error instanceof NodeInterrupt) {
        console.debug("Caught Interrupt Value:", (error as any).value);
        throw error;
    }

    const errorMessage = extractErrorMessage(error);
    const errorDetails = extractErrorDetails(error);
    const defaults: Omit<InterruptValue, "projectId"> = {
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
        throw new NodeInterrupt(interruptValue);

    }
    throw error;
}
