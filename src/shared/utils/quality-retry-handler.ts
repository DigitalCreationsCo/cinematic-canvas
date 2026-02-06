import { RecordMetricsCallback } from "../types/pipeline.types.js";
import { QualityEvaluationResult, QualityConfig, Scene } from "../types/index.js";
import { RetryLogger, RetryContext } from "./retry-logger.js";
import { GraphInterrupt } from "@langchain/langgraph";



export interface QualityRetryConfig {
  qualityConfig: QualityConfig;
  context: RetryContext;
}

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
    finalScore: number;
    acceptedAttempt: number;
    warning?: string;
  };
}

export type GenerateCallbackProps<T> = [  
  prompt: string,
  attempt: number,
];
export type EvaluateCallbackProps<T> = [
  output: T, attempt: number
];
export type ApplyCorrectionsCallbackProps<T> = [
  prompt: string,
  evaluation: QualityEvaluationResult,
  attempt: number,
];
export type CalculateScoreProps = [ evaluation: QualityEvaluationResult ];

export interface GenerationCallbacks<T> {
  generate: (...args: GenerateCallbackProps<T>) => Promise<T>;
  evaluate: (...args: EvaluateCallbackProps<T>) => Promise<QualityEvaluationResult>;
  applyCorrections: (...args: ApplyCorrectionsCallbackProps<T>) => Promise<string>;
  calculateScore: (...args: CalculateScoreProps) => number;
  onComplete?: RecordMetricsCallback;
}

export interface GenerationCallbacks<T> {
  generate: (prompt: string, attempt: number) => Promise<T>;
  evaluate: (output: T, attempt: number) => Promise<QualityEvaluationResult>;
  applyCorrections: (prompt: string, evaluation: QualityEvaluationResult, attempt: number) => Promise<string>;
  calculateScore: (evaluation: QualityEvaluationResult) => number;

  // Hook for saving assets and syncing DB state
  onAttemptComplete?: (result: { output: T | null; evaluation: QualityEvaluationResult | null; attempt: number; }) => Promise<void>;
  // Hook for triggering the DB increment
  onRetry?: (error: any, attempt: number) => Promise<void>;
}

/**
 * Unified retry handler for quality-controlled generation
 */
export class QualityRetryHandler {
  static async executeWithRetry<T>(
    prompt: string,
    config: QualityRetryConfig,
    callbacks: GenerationCallbacks<T>
  ): Promise<QualityRetryResult<T>> {
    const { generate, evaluate, applyCorrections, calculateScore, onAttemptComplete, onRetry, onComplete } = callbacks;

    const { qualityConfig, context } = config;
    const acceptanceThreshold = qualityConfig.minorIssueThreshold;

    let bestOutput: T | null = null;
    let bestEvaluation: QualityEvaluationResult | null = null;
    let bestScore = 0;
    let bestAttempt = 0;
    let currentPrompt = prompt;
    let totalAttempts = 0;


    for (let loopIndex = 1; loopIndex <= qualityConfig.maxRetries; loopIndex++) {
      totalAttempts++;
      // Fix: Ensure attempt increments correctly relative to the start attempt
      const currentAttempt = context.attempt + (loopIndex - 1);

      let output: T | null = null;
      let evaluation: QualityEvaluationResult | null = null;
      let score = 0;

      try {
        // 1. Generate
        output = await generate(currentPrompt, currentAttempt);

        // 2. Evaluate
        evaluation = await evaluate(output, currentAttempt);
        score = calculateScore(evaluation);

        // 3. Track Best
        if (score > bestScore) {
          bestScore = score;
          bestOutput = output;
          bestEvaluation = evaluation;
          bestAttempt = currentAttempt;
        }

        // 4. Hook: Save Assets (Success path)
        if (onAttemptComplete) {
          await onAttemptComplete({ output, evaluation, attempt: currentAttempt });
        }

        // 5. Success Check
        if (score >= config.qualityConfig.minorIssueThreshold) {
          return {
            output, metadata: {
              model: evaluation.model,
              acceptedAttempt: bestAttempt,
              evaluation,
              attempts: totalAttempts,
              finalScore: score
            }
          };
        }

        // 6. Retry Logic (Quality Failure)
        if (totalAttempts < qualityConfig.maxRetries) {
          currentPrompt = await applyCorrections(currentPrompt, evaluation, currentAttempt);

          // Trigger DB Increment for Quality Failure
          if (onRetry) await onRetry("Quality below threshold", currentAttempt);
        }

      } catch (error) {
        // CRITICAL: Allow Control Flow Interrupts to bubble up
        if (error instanceof GraphInterrupt) throw error;

        // LOGGING FIX: Ensure we see WHY it failed
        console.error(`Error in QualityRetryHandler (Attempt ${currentAttempt}):`, error);

        // Hook: Handle DB Increment for Error
        if (onRetry) await onRetry(error, currentAttempt);

        // Standard Backoff
        if (totalAttempts < qualityConfig.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

    if (bestOutput && bestScore > 0) {
      RetryLogger.logFinalResult(
        { ...context, attempt: bestAttempt },
        bestScore,
        acceptanceThreshold,
        totalAttempts,
        bestEvaluation!
      );

      const scorePercent = (bestScore * 100).toFixed(1);
      const thresholdPercent = (acceptanceThreshold * 100).toFixed(0);
      console.warn(`   ⚠️  Using best attempt: ${scorePercent}% (threshold: ${thresholdPercent}%)`);

      return {
        output: bestOutput,
        metadata: {
          model: bestEvaluation!.model,
          evaluation: bestEvaluation!,
          acceptedAttempt: bestAttempt,
          attempts: totalAttempts,
          finalScore: bestScore,
          warning: `Quality below threshold after ${totalAttempts} attempts`
        }
      };
    }

    throw new Error(`Failed to generate acceptable ${context.assetKey} after ${totalAttempts} attempts`);
  }
}
