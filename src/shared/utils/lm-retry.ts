import { ApiError } from "@google/genai";

/**
 * Global cooldown manager to throttle LLM calls across all invocations.
 */
export class GlobalCooldown {
    private static lastCallTimestamp = 0;
    private static cooldownMs = 2000; // Configurable base throttle - increased to mitigate 429s

    static async wait(): Promise<void> {
        const now = Date.now();
        const elapsed = now - this.lastCallTimestamp;
        if (elapsed < this.cooldownMs) {
            const waitMs = this.cooldownMs - elapsed;
            console.log(`Global cooldown active: waiting ${waitMs}ms`);
            await new Promise(res => setTimeout(res, waitMs));
        }
    }

    static markCallComplete(): void {
        this.lastCallTimestamp = Date.now();
    }

    static setCooldownMs(ms: number): void {
        this.cooldownMs = ms;
    }

    static getCooldownMs(): number {
        return this.cooldownMs;
    }
}

/**
 * Configuration for retrying LLM calls.
 * @property {number} attempt - The current execution count (starts at 1).
 * @property {number} maxRetries - The maximum number of retries.
 * @property {number} initialDelay - The initial delay in milliseconds before first attempt if cooldown active.
 * @property {number} backoffFactor - The factor by which the retry delay increases.
 */
export type RetryConfig = {
    attempt: number;
    maxRetries: number;
    initialDelay?: number;
    backoffFactor?: number;
    projectId: string;
};

const defaultRetryConfig = { initialDelay: 10000, backoffFactor: 2 };

/**
 * Retries an LLM call with global cooldown enforcement and exponential backoff.
 *
 * First attempt respects global cooldown. Subsequent retries apply backoff to the delay.
 * Only 429 (rate limit) errors trigger retries; all other errors throw immediately.
 *
 * @param lmCall - The LLM call to retry.
 * @param params - The parameters for the LLM call.
 * @param config - The retry configuration.
 * @param onRetry - Optional callback to modify params before retry.
 * @returns The completion from the LLM call.
 */
export async function retryLlmCall<U, T>(
    lmCall: (params: T) => Promise<U>,
    initialParams: T,
    config: RetryConfig,
    onRetry?: (error: any, attempt: number, currentParams: T) => Promise<{ params: T; attempt: number }>
): Promise<U> {
    const retryConfig = { ...defaultRetryConfig, ...config };
    let attempt = retryConfig.attempt;
    let params = initialParams;
    let retryDelay = retryConfig.initialDelay;
    const maxRetries = retryConfig.maxRetries;
    const startOverall = Date.now();

    // Validate initial state
    if (attempt < 1) {
        throw new Error(`Invalid attempt number: ${attempt}. Must start at 1 or higher.`);
    }

    // No retries allowed case
    if (maxRetries < 1) {
        throw new Error(`Invalid maxRetries: ${maxRetries}. Must be at least 1 to allow initial attempt.`);
    }

    let lastError: any;

    while (attempt <= maxRetries) {
        // Apply global cooldown before each attempt (including first)
        if (attempt === retryConfig.attempt) {
            await GlobalCooldown.wait();
        } else {
            // Apply backoff-delayed wait for retries
            console.log(`Waiting ${retryDelay}ms before retry (attempt ${attempt})...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }

        try {
            console.log(
                { attempt, maxRetries, functionName: lmCall.name || "lmCall" },
                `Calling LLM (Attempt ${attempt})...`
            );
            console.debug({ params: JSON.stringify(params, null, 2) });

            const start = Date.now();
            const result = await lmCall(params);
            const duration = Date.now() - start;

            // Mark global cooldown timestamp on successful completion
            GlobalCooldown.markCallComplete();

            const successLog = {
                attempt,
                durationMs: duration,
                functionName: lmCall.name || "lmCall",
                projectId: retryConfig.projectId
            };

            if (attempt > 1) {
                console.log(successLog, `LLM call succeeded after ${attempt} attempts`);
            } else {
                console.log(successLog, `LLM call succeeded on first attempt`);
            }

            return result;
        } catch (error: any) {
            lastError = error;
            const duration = Date.now() - startOverall;

            console.warn(
                {
                    error: error instanceof Error ? error.message : String(error),
                    attempt,
                    maxRetries: retryConfig.maxRetries,
                    durationMs: duration,
                    functionName: lmCall.name || "lmCall",
                    projectId: retryConfig.projectId
                },
                `LLM call attempt ${attempt} failed`
            );

            // Only retry on rate limit errors (429)
            if (error instanceof ApiError && error.status === 429) {
                attempt++;
                const totalDuration = Date.now() - startOverall;

                if (attempt <= maxRetries) {
                    console.warn(
                        { error, attempt, maxRetries, projectId: retryConfig.projectId, durationMs: totalDuration },
                        `LLM call failed. Retrying...`
                    );
                    // Apply backoff for next retry
                    retryDelay *= retryConfig.backoffFactor;
                } else {
                    console.error(
                        {
                            error: error instanceof Error ? error.message : String(error),
                            totalAttempts: attempt - 1,
                            durationMs: totalDuration,
                            functionName: lmCall.name || "lmCall",
                            projectId: retryConfig.projectId
                        },
                        `LLM call failed after maximum retries`
                    );
                }
                continue;
            }

            // Non-retryable error: log and throw immediately
            console.error(
                {
                    error: error instanceof Error ? error.message : String(error),
                    attempt,
                    functionName: lmCall.name || "lmCall",
                    projectId: retryConfig.projectId,
                    durationMs: duration
                },
                `LLM call failed with non-retryable error`
            );
            throw error;
        }
    }

    throw lastError || new Error("LLM call failed unexpectedly without an error object");
}
