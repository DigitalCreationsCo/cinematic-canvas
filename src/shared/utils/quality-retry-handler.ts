import { QualityEvaluationResult, QualityConfig, Scene, AssetKey } from "../types/index.js";
import { RetryLogger, RetryContext } from "./retry-logger.js";
import { GlobalCooldown } from "./execute-with-retry.js";
import { RAIError } from "./errors.js";

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

export enum RetryableErrorType {
  QUALITY = "QUALITY",        // Quality below threshold (needs prompt correction)
  SAFETY = "SAFETY",          // Content safety violation (needs prompt sanitization)
  RATE_LIMIT = "RATE_LIMIT",  // API rate limit (needs backoff)
  TRANSIENT = "TRANSIENT",    // Network/timeout errors (needs backoff)
  NON_RETRYABLE = "NON_RETRYABLE"
}

export interface RetryableError {
  type: RetryableErrorType;
  originalError: any;
  message: string;
  shouldRetry: boolean;
}

export type ErrorClassifier = (error: any) => RetryableError;

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface QualityRetryConfig {
  qualityConfig: QualityConfig;
  context: RetryContext;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface GenerationResult<T> {
  output: T;
  evaluation: QualityEvaluationResult;
  score: number;
}

export interface QualityRetryResult<T> {
  output: T;
  metadata: {
    model: string;
    evaluation: QualityEvaluationResult;
    attempts: number;
    acceptedAttempt: number;
    warning?: string;
  };
}

// ============================================================================
// CALLBACKS
// ============================================================================

/**
   * This should be a simple, non-retrying call to the generation API.
   * All retry logic is handled by QualityRetryHandler.
   * 
   * Example:
   * ```typescript
   * generate: async (prompt, attempt) => {
   *   // Direct API call - NO retry wrapper
   *   return await imageModel.generateImages({ prompt, config });
   * }
   * ```
   */
export type GenerateCallbackProps<T> = [
  prompt: string,
  attempt: number,
];
/**
   * Evaluate the quality of generated output.
   */
export type EvaluateCallbackProps<T> = [
  output: T, attempt: number
];
/**
   * Apply corrections to prompt based on quality evaluation.
   * Only called for quality issues, not for safety/rate-limit errors.
   */
export type ApplyCorrectionsCallbackProps<T> = [
  prompt: string,
  evaluation: QualityEvaluationResult,
  attempt: number,
];
/**
   * Calculate numeric score from evaluation result.
   */
export type CalculateScoreProps = [evaluation: QualityEvaluationResult];

export interface GenerationCallbacks<T> {
  generate: (prompt: string, attempt: number) => Promise<T>;
  evaluate: (output: T, attempt: number) => Promise<QualityEvaluationResult>;
  applyCorrections: (prompt: string, evaluation: QualityEvaluationResult, attempt: number) => Promise<string>;
  calculateScore: (evaluation: QualityEvaluationResult) => number;

  /**
     * Custom error classifier (optional - uses default if not provided).
     */
  classifyError?: ErrorClassifier;

  /**
     * Sanitize prompt for safety violations.
     * Called when safety error is detected before retry.
     */
  sanitizePrompt?: (prompt: string, errorMessage: string) => Promise<string>;

  /**
   * Hook called when a retry is triggered.
   * Use this to increment attempt counters, record failures, etc.
   */
  onRetry?: (error: RetryableError, attempt: number, delayMs: number) => Promise<void>;
}

export interface BatchItemResult<TOutput> {
  id: string;
  output?: TOutput;
  error?: any;
}

export interface BatchGenerationCallbacks<TInput extends { id: string }, TOutput> {
  generate: (items: TInput[], attempt: number) => Promise<BatchItemResult<TOutput>[]>;
  evaluate: (output: TOutput, input: TInput, attempt: number) => Promise<QualityEvaluationResult>;
  applyCorrections: (input: TInput, evaluation: QualityEvaluationResult, attempt: number) => Promise<TInput>;
  calculateScore: (evaluation: QualityEvaluationResult) => number;
  classifyError?: ErrorClassifier;
  sanitizePrompt?: (input: TInput, errorMessage: string) => Promise<TInput>;
  onRetry?: (error: RetryableError, input: TInput, attempt: number, delayMs: number) => Promise<void>;
}

/**
 * Unified retry handler for quality-controlled generation with:
 * - Global cooldown between invocations
 * - Exponential backoff on retries
 * - Comprehensive logging via RetryLogger
 * - Proper error classification
 */
export class QualityRetryHandler {
  // Default error classifier - can be overridden per service
  static defaultErrorClassifier(error: any): RetryableError {
    // Check for RAI/safety errors first (highest priority)
    if (error instanceof RAIError) {
      return {
        type: RetryableErrorType.SAFETY,
        originalError: error,
        message: error.message,
        shouldRetry: true
      };
    }

    // Check for safety errors by message content (Google GenAI specific)
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("safety") ||
        msg.includes("content filter") ||
        msg.includes("blocked") ||
        msg.includes("rai") ||
        msg.includes("responsible ai")) {
        return {
          type: RetryableErrorType.SAFETY,
          originalError: error,
          message: error.message,
          shouldRetry: true
        };
      }
    }

    // Check for rate limit
    if (error?.status === 429 || error?.code === 429) {
      return {
        type: RetryableErrorType.RATE_LIMIT,
        originalError: error,
        message: error.message || "Rate limit exceeded",
        shouldRetry: true
      };
    }

    // Check for transient network errors
    if (error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT" || error?.code === "ECONNREFUSED") {
      return {
        type: RetryableErrorType.TRANSIENT,
        originalError: error,
        message: error.message || "Network error",
        shouldRetry: true
      };
    }

    // Check for timeout/api errors by message content
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("timeout") || msg.includes("broken pipe") || msg.includes("econn")) {
        return {
          type: RetryableErrorType.TRANSIENT,
          originalError: error,
          message: error.message,
          shouldRetry: true
        };
      }
    }

    // Non-retryable by default
    return {
      type: RetryableErrorType.NON_RETRYABLE,
      originalError: error,
      message: error instanceof Error ? error.message : String(error),
      shouldRetry: false
    };
  }

  static async executeWithRetry<T>(
    prompt: string,
    config: QualityRetryConfig,
    callbacks: GenerationCallbacks<T>
  ): Promise<QualityRetryResult<T>> {
    const { generate, evaluate, applyCorrections, calculateScore, classifyError, sanitizePrompt, onRetry } = callbacks;

    const errorClassifier = classifyError || this.defaultErrorClassifier;
    const { qualityConfig, context } = config;
    const acceptanceThreshold = qualityConfig.minorIssueThreshold;

    // Validate config
    if (qualityConfig.maxRetries < 1) {
      throw new Error(`Invalid maxRetries: ${qualityConfig.maxRetries}. Must be at least 1.`);
    }

    let bestOutput: T | null = null;
    let bestEvaluation: QualityEvaluationResult | null = null;
    let bestScore = 0;
    let bestAttempt = 0;

    // Current state
    let currentPrompt = prompt;
    const maxAttempts = qualityConfig.maxRetries;
    const startAttempt = context.attempt;

    // Track retry delay with backoff
    let currentDelay = 3000; // Base delay in ms
    const backoffFactor = 2;

    RetryLogger.logAttemptStart(context, prompt.length);

    // ==========================================================================
    // MAIN RETRY LOOP - Handles ALL error types in one place
    // ==========================================================================

    for (let attemptOffset = 0; attemptOffset < maxAttempts; attemptOffset++) {
      const currentAttempt = startAttempt + attemptOffset;
      const isFirstAttempt = attemptOffset === 0;

      let output: T | null = null;
      let evaluation: QualityEvaluationResult | null = null;
      let score = 0;

      try {
        // ======================================================================
        // STEP 1: APPLY COOLDOWN/BACKOFF
        // ======================================================================

        if (isFirstAttempt) {
          // First attempt: respect global cooldown only
          await GlobalCooldown.wait();
        } else {
          // Retry attempts: apply exponential backoff
          console.log(`⏱️  Backoff delay: waiting ${currentDelay}ms before attempt ${currentAttempt}...`);
          await new Promise(resolve => setTimeout(resolve, currentDelay));
        }

        // ======================================================================
        // STEP 2: GENERATE
        // ======================================================================
        output = await generate(currentPrompt, currentAttempt);

        // Mark cooldown timestamp on success
        GlobalCooldown.markCallComplete();

        // ======================================================================
        // STEP 3: EVALUATE QUALITY
        // ======================================================================
        evaluation = await evaluate(output, currentAttempt);
        score = calculateScore(evaluation);

        if (evaluation) {
          RetryLogger.logEvaluationDetails(context, evaluation, score);
        }

        // ======================================================================
        // STEP 4: TRACK BEST RESULT
        // ======================================================================
        if (score > bestScore) {
          bestScore = score;
          bestOutput = output;
          bestEvaluation = evaluation;
          bestAttempt = currentAttempt;
        }

        // ======================================================================
        // STEP 5: CHECK ACCEPTANCE
        // ======================================================================
        const accepted = score >= acceptanceThreshold;

        // If quality is acceptable, we're done!
        if (accepted) {
          RetryLogger.logFinalResult(context, bestScore, acceptanceThreshold, attemptOffset + 1, evaluation);

          return {
            output,
            metadata: {
              model: evaluation.model,
              acceptedAttempt: currentAttempt,
              evaluation,
              attempts: attemptOffset + 1,
            }
          };
        }

        // ======================================================================
        // STEP 6: APPLY QUALITY CORRECTIONS FOR NEXT ATTEMPT
        // ======================================================================

        if (attemptOffset < maxAttempts - 1) {
          const originalLength = currentPrompt.length;
          currentPrompt = await applyCorrections(currentPrompt, evaluation, currentAttempt);
          const correctedLength = currentPrompt.length;

          // Log corrections
          if (evaluation.promptCorrections && evaluation.promptCorrections.length > 0) {
            RetryLogger.logPromptCorrections(context, evaluation.promptCorrections, originalLength, correctedLength);
          } else {
            RetryLogger.logFallbackRetry(context, "No corrections available, retrying with original");
          }

          // Apply backoff for next iteration
          currentDelay *= backoffFactor;

          // Trigger DB Increment for Quality Failure
          const qualityError: RetryableError = {
            type: RetryableErrorType.NON_RETRYABLE,
            originalError: new Error(`Quality below threshold: ${(score * 100).toFixed(1)}%`),
            message: `Quality below threshold: ${(score * 100).toFixed(1)}%`,
            shouldRetry: false
          };
          if (onRetry) await onRetry(qualityError, currentAttempt, currentDelay);
        }

      } catch (error) {
        // ======================================================================
        // ERROR HANDLING - Classify and handle appropriately
        // ======================================================================
        const retryableError = errorClassifier(error);

        console.error(`❌ Error in QualityRetryHandler (Attempt ${currentAttempt}):`, {
          type: retryableError.type,
          message: retryableError.message,
          shouldRetry: retryableError.shouldRetry
        });

        // Non-retryable errors: throw immediately
        if (!retryableError.shouldRetry) {
          throw retryableError.originalError;
        }

        // Check if we have retries remaining BEFORE any side effects
        const hasRetriesRemaining = attemptOffset + 1 < maxAttempts;
        if (!hasRetriesRemaining) {
          console.error(`Max retries exceeded for ${retryableError.type} error`);
          throw new Error(`Failed to generate acceptable ${context.assetKey} after ${maxAttempts} attempts: ${retryableError.message}`);
        }

        // ======================================================================
        // HANDLE RETRYABLE ERRORS
        // ======================================================================

        // Hook: Handle DB Increment for Error
        if (onRetry) await onRetry(retryableError, currentAttempt, currentDelay);

        // Handle safety errors: sanitize prompt before retry
        if (retryableError.type === RetryableErrorType.SAFETY) {
          RetryLogger.logSafetyRetry(context, attemptOffset + 1, maxAttempts, retryableError.message);

          if (sanitizePrompt) {
            console.log(`🧹 Sanitizing prompt for safety retry...`);
            const originalLength = currentPrompt.length;
            currentPrompt = await sanitizePrompt(currentPrompt, retryableError.message);
            const sanitizedLength = currentPrompt.length;
            RetryLogger.logPromptSanitized(originalLength, sanitizedLength);
          }
        }

        console.log(`⏱️  Retrying after ${retryableError.type} error. Waiting ${currentDelay}ms...`);

        // Apply backoff for next iteration
        // Apply backoff for next iteration
        // Backoff is applied at the start of the next loop iteration in the 'else' block
        // currentDelay *= backoffFactor;
        continue;
      }
    }

    // Return best effort if we have one
    if (bestOutput && bestScore > 0) {
      RetryLogger.logFinalResult(context, bestScore, acceptanceThreshold, maxAttempts, bestEvaluation!);

      const scorePercent = (bestScore * 100).toFixed(1);
      const thresholdPercent = (acceptanceThreshold * 100).toFixed(0);
      console.warn(`   ⚠️  Using best attempt: ${scorePercent}% (threshold: ${thresholdPercent}%)`);

      return {
        output: bestOutput,
        metadata: {
          model: bestEvaluation!.model,
          evaluation: bestEvaluation!,
          acceptedAttempt: bestAttempt,
          attempts: maxAttempts,
          warning: `Quality below threshold after ${maxAttempts} attempts`
        }
      };
    }

    throw new Error(`Failed to generate acceptable ${context.assetKey} after ${maxAttempts} attempts`);
  }

  static async executeBatch<TInput extends { id: string }, TOutput>(
    items: TInput[],
    config: QualityRetryConfig,
    callbacks: BatchGenerationCallbacks<TInput, TOutput>
  ): Promise<Map<string, QualityRetryResult<TOutput> | Error>> {
    const { generate, evaluate, applyCorrections, calculateScore, classifyError, sanitizePrompt, onRetry } = callbacks;
    const errorClassifier = classifyError || this.defaultErrorClassifier;
    const { qualityConfig, context } = config;
    const acceptanceThreshold = qualityConfig.minorIssueThreshold;
    const maxAttempts = qualityConfig.maxRetries;

    const results = new Map<string, QualityRetryResult<TOutput> | Error>();
    // Store best results for partial successes even if they fail quality
    const bestResults = new Map<string, { output: TOutput, evaluation: QualityEvaluationResult, score: number, attempt: number }>();

    let pendingItems = [...items];
    let currentDelay = 3000;
    const backoffFactor = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (pendingItems.length === 0) break;

      console.log(`\n🚀 Batch Attempt ${attempt}/${maxAttempts} - Processing ${pendingItems.length} items...`);

      if (attempt === 1) {
        await GlobalCooldown.wait();
      } else {
        console.log(`⏱️  Backoff delay: waiting ${currentDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, currentDelay));
      }

      // Keep track of items that need to be retried in the next iteration
      const nextPendingItems: TInput[] = [];

      try {
        // Generate batch - callbacks must handle the grouping/parallelism
        const batchResults = await generate(pendingItems, attempt);
        GlobalCooldown.markCallComplete();

        // Process each result
        for (const res of batchResults) {
          const item = pendingItems.find(i => i.id === res.id);
          if (!item) {
            console.warn(`Received result for unknown item ID: ${res.id}`);
            continue;
          }

          if (res.error) {
            // Handle Generation Error
            const retryableError = errorClassifier(res.error);
            console.error(`❌ Item ${res.id} failed: ${retryableError.message}`);

            if (retryableError.shouldRetry && attempt < maxAttempts) {
              if (retryableError.type === RetryableErrorType.SAFETY && sanitizePrompt) {
                const sanitized = await sanitizePrompt(item, retryableError.message);
                // Need to update the item with sanitized version
                // But applyCorrections/sanitizePrompt returns TInput
                // We push the *new* input to nextPending
                nextPendingItems.push(sanitized);
              } else {
                nextPendingItems.push(item);
              }

              if (onRetry) await onRetry(retryableError, item, attempt, currentDelay);
            } else {
              results.set(res.id, res.error); // Final error
            }
            continue;
          }

          if (!res.output) {
            console.error(`Item ${res.id} returned no output and no error.`);
            results.set(res.id, new Error("No output generated"));
            continue;
          }

          // Evaluate Quality
          try {
            const evaluation = await evaluate(res.output, item, attempt);
            const score = calculateScore(evaluation);

            // Track best result
            const existingBest = bestResults.get(res.id);
            if (!existingBest || score > existingBest.score) {
              bestResults.set(res.id, { output: res.output, evaluation, score, attempt });
            }

            if (score >= acceptanceThreshold) {
              // Success!
              results.set(res.id, {
                output: res.output,
                metadata: {
                  model: evaluation.model,
                  evaluation,
                  acceptedAttempt: attempt,
                  attempts: attempt,
                }
              });
            } else {
              // Quality Failure
              if (attempt < maxAttempts) {
                console.log(`⚠️  Item ${res.id} quality low (${(score * 100).toFixed(1)}%). Applying corrections...`);
                const correctedItem = await applyCorrections(item, evaluation, attempt);
                nextPendingItems.push(correctedItem);

                // Trigger retry hook for quality failure metrics
                const qualityError: RetryableError = {
                  type: RetryableErrorType.NON_RETRYABLE, // Technically retrying, but as a quality iteration
                  originalError: new Error(`Quality: ${(score * 100).toFixed(1)}%`),
                  message: `Quality below threshold`,
                  shouldRetry: true
                };
                if (onRetry) await onRetry(qualityError, item, attempt, currentDelay);

              } else {
                // Max attempts reached, use best result if available
                const best = bestResults.get(res.id);
                if (best) {
                  results.set(res.id, {
                    output: best.output,
                    metadata: {
                      model: best.evaluation.model,
                      evaluation: best.evaluation,
                      acceptedAttempt: best.attempt,
                      attempts: attempt,
                      warning: "Quality threshold not met"
                    }
                  });
                } else {
                  results.set(res.id, new Error(`Quality threshold not met after ${maxAttempts} attempts`));
                }
              }
            }
          } catch (evalError) {
            console.error(`Error evaluating item ${res.id}:`, evalError);
            results.set(res.id, evalError as Error);
          }
        }

        // Handle items that were passed to generate but returned no result
        const processedIds = new Set(batchResults.map(r => r.id));
        for (const item of pendingItems) {
          if (!processedIds.has(item.id)) {
            // Check if it's already finished in results (unlikely given pending logic)
            if (results.has(item.id)) continue;

            console.error(`Item ${item.id} was dropped by generate callback.`);
            // Retry dropped items if possible
            if (attempt < maxAttempts) {
              nextPendingItems.push(item);
            } else {
              results.set(item.id, new Error("Generation dropped item"));
            }
          }
        }

      } catch (batchError) {
        // Entire batch failed (e.g. API crash)
        console.error("Batch generation failed:", batchError);
        const classifier = errorClassifier(batchError);

        if (classifier.shouldRetry && attempt < maxAttempts) {
          // Retry all pending items
          nextPendingItems.push(...pendingItems);
          // We don't increase delay here because the loop will do it?
          // No, loop uses currentDelay. But we might want specific delay handling.
          // For simplicity, let the loop handle backoff.
        } else {
          // Fail all pending items
          for (const item of pendingItems) {
            results.set(item.id, batchError as Error);
          }
        }
      }

      pendingItems = nextPendingItems;
      if (pendingItems.length > 0) {
        currentDelay *= backoffFactor;
      }
    }

    return results;
  }
}
