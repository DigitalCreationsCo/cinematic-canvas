
import { LogContext, logContextStore } from "../logger/index.js";

/**
 * Wraps a database operation with a try-catch block to prevent process crashes.
 * Logs the error and returns a fallback value (defaulting to null).
 * 
 * @param fn - The async database operation to execute.
 * @param context - A description of the operation for logging purposes.
 * @param fallback - The value to return in case of an error. Defaults to null.
 * @returns The result of the operation or the fallback value.
 */
export async function safeDbCall<T>(
    fn: () => Promise<T>,
    context: string,
    fallback: T | null = null
): Promise<T | null> {
    try {
        return await fn();
    } catch (error: any) {
        const logData: any = {
            error: error.message,
            stack: error.stack,
            context,
        };

        // Try to add current log context if available
        const currentContext = logContextStore.getStore();
        if (currentContext) {
            logData.traceId = currentContext.correlationId;
            logData.jobId = currentContext.jobId;
            logData.projectId = currentContext.projectId;
        }

        console.error(logData, `[safeDbCall] DB Error in ${context}`);

        // Return fallback instead of throwing
        return fallback;
    }
}
