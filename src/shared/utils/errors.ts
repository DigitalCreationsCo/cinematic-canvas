import { ApiError as GenAIApiError } from "@google/genai";
import { NodeInterrupt } from "@langchain/langgraph";
import { LlmRetryInterruptValue } from "@shared/types/pipeline.types";

export class RAIError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RAIError';
    }
}

export function extractErrorMessage(error: unknown): string {
    // Handle Error instances
    if (error instanceof Error) {
        return error.message || error.toString();
    }

    // Handle error objects with message property
    if (error && typeof error === 'object') {
        if ('message' in error && typeof error.message === 'string') {
            return error.message;
        }

        // Handle Google API errors specifically
        if ('code' in error && 'details' in error) {
            const code = (error as any).code;
            const details = (error as any).details;
            const message = (error as any).message || '';
            return `API Error (Code ${code}): ${message}${details ? ` - ${details}` : ''}`;
        }

        // Handle Error instances
        if (error instanceof GenAIApiError) {
            return `API Error (Code ${error.status}): ${error.message} - ${error.cause}`;
        }

        // Try to stringify the object
        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }

    // Fallback to string conversion
    return String(error);
}

/**
 * Extract structured error details
 * @param error 
 * @returns 
 */
export function extractErrorDetails(error: unknown): Record<string, any> | undefined {
    if (!error || typeof error !== 'object') {
        return undefined;
    }

    const details: Record<string, any> = {};

    // Standard Error properties
    if (error instanceof Error) {
        details.name = error.name;
        details.message = error.message;
        if (error.stack) details.stack = error.stack;
    }

    // Google API error structure
    if ('code' in error) details.code = (error as any).code;
    if ('details' in error) details.details = (error as any).details;
    if ('metadata' in error) details.metadata = (error as any).metadata;
    if ('statusCode' in error) details.statusCode = (error as any).statusCode;
    if ('statusMessage' in error) details.statusMessage = (error as any).statusMessage;

    // Custom error properties (like RAIError)
    if ('type' in error) details.type = (error as any).type;
    if ('severity' in error) details.severity = (error as any).severity;

    return Object.keys(details).length > 0 ? details : undefined;
}

/**
 * Extract relevant parameters for retry
 * @param state 
 * @returns 
 */
export function extractRelevantParams(state: any): Record<string, any> {
    // Return only the parameters needed to retry the operation
    // Avoid including large data structures or sensitive information
    return {
        sceneId: state.currentSceneIndex,
        // Add other relevant parameters
    };
}

type InterruptErrorContext = {
    currentAttempt: number;
    maxRetries: number;
    functionName: string;
    params?: Record<string, any>;
    lastAttemptTimestamp: string;
};

/**
 * Intercepts errors and throws a NodeInterrupt for human-in-the-loop intervention.
 * 
 * IMPORTANT: If the error is already a NodeInterrupt (e.g. from upstream batch processing),
 * it re-throws to preserve the original interrupt context.
 */
export function interceptNodeInterruptAndThrow(
    error: any,
    nodeName: string,
    context?: Partial<InterruptErrorContext>
) {
    if (error instanceof NodeInterrupt) {
        console.debug("Caught Interrupt Value:", (error as any).value);
        throw error;
    }
    const errorMessage = extractErrorMessage(error);
    const errorDetails = extractErrorDetails(error);

    const mergedContext: InterruptErrorContext = {
        currentAttempt: context?.currentAttempt ?? error?.value?.currentAttempt ?? 1,
        maxRetries: context?.maxRetries ?? error?.value?.maxRetries ?? 3,
        functionName: context?.functionName ?? error?.value?.functionName ?? nodeName,
        params: context?.params ?? error?.value?.params ?? {},
        lastAttemptTimestamp: context?.lastAttemptTimestamp ?? new Date().toISOString(),
    };

    const interruptValue: LlmRetryInterruptValue = {
        type: mergedContext.currentAttempt >= mergedContext.maxRetries ? 'llm_retry_exhausted' : 'llm_intervention',
        error: errorMessage,
        errorDetails: errorDetails,
        params: mergedContext.params || {},
        functionName: mergedContext.functionName,
        nodeName: nodeName,
        attemptCount: mergedContext.currentAttempt,
        lastAttemptTimestamp: mergedContext.lastAttemptTimestamp,
        stackTrace: error instanceof Error ? error.stack : undefined
    };

    throw new NodeInterrupt(interruptValue);
}
