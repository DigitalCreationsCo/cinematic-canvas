import { ApiError as GenAIApiError } from "@google/genai";
import { InterruptValue } from "../types/workflow.types.js";

export class RAIError extends Error {
    readonly prompt: string;

    constructor(message: string, prompt: string) {
        super(message);
        this.name = 'RAIError';
        this.prompt = prompt;
        Object.setPrototypeOf(this, RAIError.prototype);
    }
}

export class WorkflowFatalError extends Error {
    readonly context: Record<string, unknown>;

    constructor(message: string, context: Record<string, unknown>) {
        super(message);
        this.name = "WorkflowFatalError";
        this.context = context;
        Object.setPrototypeOf(this, WorkflowFatalError.prototype);
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

export function extractInterruptValue(error: unknown): InterruptValue | false {
    if (!error) return false;

    // Handle direct string input (could be a JSON string)
    if (typeof error === 'string') {
        try {
            const parsed = JSON.parse(error);
            if (parsed && typeof parsed === 'object') {
                if ('value' in parsed) return parsed.value as InterruptValue;
                if ('type' in parsed) return parsed as InterruptValue;
            }
        } catch (e) {
            return false;
        }
    }

    // Handle object input
    if (typeof error === 'object') {
        // Handle LangChain NodeInterrupt style (object with value property)
        if ('value' in error && error.value && typeof error.value === 'object') {
            if ('type' in (error.value as any)) return error.value as InterruptValue;
        }

    // Handle error objects with message property (containing JSON)
        if ('message' in error && typeof error.message === 'string') {
            try {
                const parsed: ({ value: InterruptValue; }[]) | InterruptValue = JSON.parse(error.message);
                if (Array.isArray(parsed) && parsed.length) {
                    return parsed.at(-1)!.value;
                } else if (parsed && typeof parsed === 'object') {
                    if ('value' in (parsed as any)) return (parsed as any).value as InterruptValue;
                    if ('type' in (parsed as any)) return parsed as InterruptValue;
                }
            } catch (e) {
                // message is just a string
            }
        }

        // Handle objects that ARE the interrupt value
        if ('type' in error && typeof (error as any).type === 'string') {
            const type = (error as any).type;
            if ([ 'lm_retry_exhausted', 'lm_intervention', 'waiting_for_job', 'waiting_for_batch' ].includes(type)) {
                return error as InterruptValue;
            }
        }
    }
    return false;
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

