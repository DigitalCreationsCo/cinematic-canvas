/**
 * Configuration for retrying LLM calls.
 * @property {number} maxRetries - The maximum number of retries.
 * @property {number} initialDelay - The initial delay in milliseconds.
 * @property {number} backoffFactor - The factor by which the delay increases.
 */
export type RetryConfig = {
    maxRetries?: number;
    initialDelay?: number;
    backoffFactor?: number;
};

const defaultRetryConfig: Required<RetryConfig> = { maxRetries: 3, initialDelay: 1000, backoffFactor: 2, };
/**
 * Retries an LLM call with exponential backoff.
 * @param llmCall - The LLM call to retry.
 * @param params - The parameters for the LLM call.
 * @param retryConfig - The retry configuration.
 * @param onRetry - Optional callback to modify params or handle error before retry.
 * @returns The completion from the LLM call.
 */
export async function retryLlmCall<T, U>(
    llmCall: (params: T) => Promise<U>,
    initialParams: T,
    retryConfig: RetryConfig = {},
    onRetry?: (error: any, attempt: number, currentParams: T) => Promise<T | void>
): Promise<U> {
    const config = { ...defaultRetryConfig, ...retryConfig };
    let retries = 0;
    let delay = config.initialDelay;
    let params = initialParams;

    while (retries < config.maxRetries) {
        try {
            console.log('Calling LLM with params: ');
            console.log(JSON.stringify(params, null, 2));
            return await llmCall(params);
        } catch (error) {
            retries++;
            if (retries >= config.maxRetries) {
                console.error('LLM call failed after multiple retries.', error);
                throw new Error('LLM call failed after multiple retries.');
            }
            
            if (onRetry) {
                const newParams = await onRetry(error, retries, params);
                if (newParams) {
                    params = newParams;
                }
            }

            console.log(`LLM call failed. Retrying in ${delay}ms...`, error);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= config.backoffFactor;
        }
    }

    throw new Error('LLM call failed after multiple retries.');
}
