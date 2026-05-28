import { InterruptValue, WorkflowState } from "../../shared/types/workflow.types.js";
import { PipelineEvent } from "../../shared/types/pipeline.types.js";
import { extractErrorDetails, extractErrorMessage, extractInterruptValue } from "../../shared/utils/errors.js";
import { interrupt, NodeInterrupt, GraphInterrupt, StateSnapshot } from "@langchain/langgraph";

export type PipelineEventPublisher = (event: PipelineEvent) => Promise<void>;

const nonTerminalInterrupts = [ 'waiting_for_job', 'waiting_for_batch' ];
const terminalInterrupts = [ 'user_approval_before_video_gen', 'user_approval_after_storyboard_gen', 'lm_intervention' ];

/** Inspect state for interrupt objects, returns any terminal interrupt value or false */
export function scanForTerminalInterrupt(
    packet: { projectId: string, worldId?: string, teamId: string, userId: string },
    state: WorkflowState,
    commandName: string,
    publishEvent: PipelineEventPublisher
): InterruptValue | false {

    const { projectId, worldId, teamId, userId } = packet;

    if (state.__interrupt__?.[ 0 ]?.value) {
        const interruptValue = extractInterruptValue(state.__interrupt__[0]);
        if (!interruptValue) {
            console.debug({ projectId, interruptValue }, `No interrupt value detected. Continuing`);
            return false;
        }

        console.log(` Interrupt detected in state from snapshot:`, {
            type: interruptValue.type,
            nodeName: interruptValue.nodeName,
            functionName: interruptValue.functionName,
            attemptCount: interruptValue.attempts
        });

        const suspensionType = interruptValue?.type;

        if (terminalInterrupts.includes(suspensionType)) {
            console.log({ commandName, projectId, suspensionType }, `Terminal interrupt identified. `);
            if (!state.__interrupt_resolved__) {
                console.log({ interruptValue }, ` Interrupt detected. Emitting interrupt event`);
                return interruptValue;
            }
            return interruptValue;

        } else {
            console.log({ commandName, projectId, suspensionType }, `Asynchronous node pause detected. Preserving active workflow state.`);
        }
    }
    return false;
}

/** Inspect tasks to determine suspension root cause, returns any terminal interrupt value or false */
export function scanStateSnapshotForTerminalInterrupt(
    packet: { projectId: string, worldId?: string, teamId: string, userId: string; },
    stateSnapshot: StateSnapshot,
    commandName: string,
    publishEvent: PipelineEventPublisher
): InterruptValue | false {

    const { projectId, worldId, teamId, userId } = packet;

    // Graph is suspended. Inspect tasks to determine suspension root cause.
    const pendingTasks = stateSnapshot.tasks || [];
    if (pendingTasks.length > 0) {
        const primarySuspendedTask = pendingTasks[ 0 ];
        const activeTaskInterrupts = primarySuspendedTask.interrupts || [];

        if (activeTaskInterrupts.length > 0) {
            const interruptValue = activeTaskInterrupts[ 0 ].value as InterruptValue;
            const suspensionType = interruptValue?.type;

            console.log(` Interrupt detected in state from snapshot:`, {
                type: interruptValue.type,
                nodeName: interruptValue.nodeName,
                functionName: interruptValue.functionName,
                attemptCount: interruptValue.attempts
            });

            if (terminalInterrupts.includes(suspensionType)) {
                console.log({ commandName, projectId, suspensionType }, `Terminal interrupt identified. `);
                return interruptValue;
            } else {
                console.log({ commandName, projectId, suspensionType }, `Asynchronous node pause detected. Preserving active workflow state.`);
            }
        }
    }
    return false;
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
