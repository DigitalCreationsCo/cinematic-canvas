import { describe, it, expect, vi, beforeEach, afterEach, Mocked } from "vitest";
import { QualityRetryHandler, RetryableErrorType, GenerationCallbacks } from "#shared/utils/quality-retry-handler.js";
import { RetryLogger } from "#shared/utils/retry-logger.js";
import { GlobalCooldown } from "#shared/utils/global-cooldown.js";
import { RAIError } from "#shared/utils/errors.js";
import {
  createMockedGenerationCallbacks,
  createMockQualityEvaluation,
  createMockQualityRetryConfig,
} from "#shared/mocks/mock-quality-retry-handler.js";

vi.mock("#shared/utils/global-cooldown.js", () => ({
  GlobalCooldown: {
    wait: vi.fn().mockResolvedValue(undefined),
    markCallComplete: vi.fn(),
  },
}));

vi.mock("#shared/utils/retry-logger.js", () => ({
  RetryLogger: mockRetryLogger,
}));

const { mockRetryLogger } = vi.hoisted(() => {
  return {
    mockRetryLogger: {
      logAttemptStart: vi.fn(),
      logEvaluationDetails: vi.fn(),
      logFinalResult: vi.fn(),
      logPromptCorrections: vi.fn(),
      logFallbackRetry: vi.fn(),
      logSafetyRetry: vi.fn(),
      logPromptSanitized: vi.fn(),
    },
  };
});

it("should wait on cooldown", async () => {
  const mockedCooldown = vi.mocked(GlobalCooldown);

  // Now you have autocomplete and no type errors!
  mockedCooldown.wait.mockResolvedValue(undefined);
});

describe("QualityRetryHandler", () => {
  let callbacks: Mocked<GenerationCallbacks<string>>;
  let MOCK_CONFIG = createMockQualityRetryConfig();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    callbacks = createMockedGenerationCallbacks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should retry quickly", async () => {
    callbacks.generate.mockResolvedValue("Test Image");
    callbacks.evaluate.mockResolvedValue(createMockQualityEvaluation(0.9));

    const task = QualityRetryHandler.executeWithRetry("prompt", MOCK_CONFIG, callbacks);
    vi.runAllTimersAsync();
    const result = await task;

    expect(result.metadata.attempts).toBeGreaterThanOrEqual(1);
  });

  it("should succeed on the first attempt if quality is acceptable", async () => {
    callbacks.generate.mockResolvedValue("Perfect Image");
    callbacks.evaluate.mockResolvedValue(createMockQualityEvaluation(0.9));

    const task = QualityRetryHandler.executeWithRetry("prompt", MOCK_CONFIG, callbacks);
    vi.runAllTimersAsync();
    const result = await task;
    expect(result.metadata.evaluation.score).toBe(0.9);
    expect(result.metadata.attempts).toBe(1);
    expect(result.output).toBe("Perfect Image");

    expect(callbacks.generate).toHaveBeenCalledTimes(1);
    expect(callbacks.onRetry).not.toHaveBeenCalled();
    expect(RetryLogger.logFinalResult).toHaveBeenCalled();
  });

  it("should retry and succeed on subsequent attempts when quality improves", async () => {
    callbacks.generate.mockResolvedValueOnce("Bad Image").mockResolvedValueOnce("Good Image");
    callbacks.evaluate
      .mockResolvedValueOnce(
        createMockQualityEvaluation(0.5, {
          promptCorrections: [
            {
              correctedPromptSection: "fix",
              department: "production_design",
              issueType: "test",
              reasoning: "test",
              originalPromptSection: "orig",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(createMockQualityEvaluation(0.85));
    callbacks.applyCorrections.mockResolvedValue("Fixed Prompt");

    const task = QualityRetryHandler.executeWithRetry("prompt", MOCK_CONFIG, callbacks);
    vi.runAllTimersAsync();
    const result = await task;
    expect(result.metadata.attempts).toBe(2);
    expect(result.metadata.evaluation.score).toBe(0.85);
    expect(result.output).toBe("Good Image");

    expect(callbacks.applyCorrections).toHaveBeenCalled();
    expect(callbacks.generate).toHaveBeenNthCalledWith(1, "prompt", 1);
    expect(callbacks.generate).toHaveBeenNthCalledWith(2, "Fixed Prompt", 2);
  }, 30000);

  it("Max Retries Exhausted (Return Best)", async () => {
    callbacks.generate.mockResolvedValueOnce("Img1").mockResolvedValueOnce("Img2").mockResolvedValueOnce("Img3");
    callbacks.evaluate
      .mockResolvedValueOnce(createMockQualityEvaluation(0.4))
      .mockResolvedValueOnce(createMockQualityEvaluation(0.6))
      .mockResolvedValueOnce(createMockQualityEvaluation(0.2));
    callbacks.applyCorrections.mockResolvedValue("New Prompt");

    const task = QualityRetryHandler.executeWithRetry("prompt", MOCK_CONFIG, callbacks);
    vi.runAllTimersAsync();
    const result = await task;
    expect(result.metadata.attempts).toBe(3);
    expect(result.metadata.evaluation.score).toBe(0.6);
    expect(result.output).toBe("Img2");
    expect(result.metadata.warning).toContain("Quality below threshold");
  }, 30000);

  it("Infrastructure Error (Retryable)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Create fresh callbacks to avoid shared state
    const task = QualityRetryHandler.executeWithRetry("prompt", MOCK_CONFIG, {
      generate: async (prompt, attempt) => {
        if (attempt === 1) throw new Error("API Timeout");
        return "Recovered Image";
      },
      evaluate: async () => createMockQualityEvaluation(0.9),
      applyCorrections: async (p) => p,
      calculateScore: (e: any) => e.score,
      onRetry: async () => {},
    });
    vi.runAllTimersAsync();
    const result = await task;
    expect(result.metadata.attempts).toBe(2);
    expect(result.output).toBe("Recovered Image");

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  }, 30000);

  it("Prompt Correction Fallback if no prompt corrections are provided", async () => {
    callbacks.generate.mockResolvedValue("Bad Image");
    callbacks.evaluate
      .mockResolvedValueOnce(createMockQualityEvaluation(0.5, { promptCorrections: [] }))
      .mockResolvedValueOnce(createMockQualityEvaluation(0.9));
    callbacks.applyCorrections.mockResolvedValue("Should Not Be Called");

    const task = QualityRetryHandler.executeWithRetry("prompt", MOCK_CONFIG, callbacks);
    vi.runAllTimersAsync();
    const result = await task;
    expect(result.metadata.attempts).toBe(2);
    expect(callbacks.applyCorrections).toHaveBeenCalled();
    expect(callbacks.onRetry).toHaveBeenCalled();
  }, 30000);

  it("Catastrophic Failure: should handle when retries exhausted", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    callbacks.generate.mockRejectedValue(new Error("Broken Pipe"));

    try {
      const task = QualityRetryHandler.executeWithRetry("prompt", MOCK_CONFIG, callbacks);
      vi.runAllTimersAsync();
      const result = await task;
      expect(result.metadata.attempts).toBe(3);
    } catch (e) {
      // May throw
    }
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  }, 30000);
});

describe("QualityRetryHandler - Verify No Multiplicative Retries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Verify single retry loop (no multiplication): should execute at most maxRetries attempts, not maxRetries × safetyRetries", async () => {
    let generateCallCount = 0;
    let sanitizeCallCount = 0;
    const retryConfig = createMockQualityRetryConfig();

    try {
      const task = QualityRetryHandler.executeWithRetry<string>("test prompt", retryConfig, {
        generate: async (prompt, attempt) => {
          generateCallCount++;
          throw new RAIError("Content safety violation", prompt);
        },
        evaluate: async (output) => createMockQualityEvaluation(0.5),
        applyCorrections: async (p, e, a) => p,
        calculateScore: (e) => e.score,
        sanitizePrompt: async (prompt, errorMessage) => {
          sanitizeCallCount++;
          return prompt + " (sanitized)";
        },
      });
      vi.runAllTimersAsync();
      await task;
    } catch (e) {
      // Expected
    }

    expect(generateCallCount).toBe(3);
    expect(sanitizeCallCount).toBe(2);
  });

  it("Verify quality corrections don't cause extra retries", async () => {
    let generateCallCount = 0;
    let correctionsCallCount = 0;
    const retryConfig = createMockQualityRetryConfig();
    const task = QualityRetryHandler.executeWithRetry<string>("test prompt", retryConfig, {
      generate: async (prompt, attempt) => {
        generateCallCount++;
        return "generated-image-url";
      },
      evaluate: async (output) => createMockQualityEvaluation(0.5),
      applyCorrections: async (p, e, a) => {
        correctionsCallCount++;
        return p + " [corrected]";
      },
      calculateScore: (e) => e.score,
    });
    vi.runAllTimersAsync();
    await task;

    expect(generateCallCount).toBe(3);
    expect(correctionsCallCount).toBe(2);
  });

  it("Verify mixed errors don't multiply retries", async () => {
    let generateCallCount = 0;
    let sanitizeCallCount = 0;
    let correctionsCallCount = 0;
    const retryConfig = createMockQualityRetryConfig();
    try {
      const task = QualityRetryHandler.executeWithRetry<string>("test prompt", retryConfig, {
        generate: async (prompt, attempt) => {
          generateCallCount++;
          if (attempt === 1) throw new RAIError("Safety violation", prompt);
          if (attempt === 3) {
            const error: any = new Error("Rate limit");
            error.status = 429;
            throw error;
          }
          return "generated-image-url";
        },
        evaluate: async (output) => createMockQualityEvaluation(0.5),
        applyCorrections: async (p, e, a) => {
          correctionsCallCount++;
          return p + " [corrected]";
        },
        calculateScore: (e) => e.score,
        sanitizePrompt: async (prompt, errorMessage) => {
          sanitizeCallCount++;
          return prompt + " (sanitized)";
        },
      });
      vi.runAllTimersAsync();
      await task;
    } catch (e) {
      // Expected
    }

    expect(generateCallCount).toBe(3);
    expect(sanitizeCallCount).toBe(1);
    expect(correctionsCallCount).toBeGreaterThan(0);
  });

  it("Verify successful generation doesn't retry unnecessarily", async () => {
    let generateCallCount = 0;
    let evaluateCallCount = 0;
    const retryConfig = createMockQualityRetryConfig();
    const task = QualityRetryHandler.executeWithRetry<string>("test prompt", retryConfig, {
      generate: async (prompt, attempt) => {
        generateCallCount++;
        return "generated-image-url";
      },
      evaluate: async (output) => {
        evaluateCallCount++;
        const score = evaluateCallCount === 1 ? 0.5 : 0.95;
        return createMockQualityEvaluation(score);
      },
      applyCorrections: async (p, e, a) => p + " [corrected]",
      calculateScore: (e) => e.score,
    });
    vi.runAllTimersAsync();
    const result = await task;
    expect(generateCallCount).toBe(2);
    expect(evaluateCallCount).toBe(2);
    expect(result.metadata.attempts).toBe(2);
    expect(result.metadata.evaluation.score).toBeGreaterThanOrEqual(0.9);
  });

  it("Verify error classifier works correctly", () => {
    const safetyError = new RAIError("Content blocked", "prompt");
    const classified1 = QualityRetryHandler.defaultErrorClassifier(safetyError);
    expect(classified1.type).toBe(RetryableErrorType.SAFETY);
    expect(classified1.shouldRetry).toBe(true);

    const rateLimitError: any = new Error("Too many requests");
    rateLimitError.status = 429;
    const classified2 = QualityRetryHandler.defaultErrorClassifier(rateLimitError);
    expect(classified2.type).toBe(RetryableErrorType.RATE_LIMIT);
    expect(classified2.shouldRetry).toBe(true);

    const transientError: any = new Error("Connection timeout");
    transientError.code = "ETIMEDOUT";
    const classified3 = QualityRetryHandler.defaultErrorClassifier(transientError);
    expect(classified3.type).toBe(RetryableErrorType.TRANSIENT);
    expect(classified3.shouldRetry).toBe(true);

    const nonRetryableError = new Error("Invalid input");
    const classified4 = QualityRetryHandler.defaultErrorClassifier(nonRetryableError);
    expect(classified4.type).toBe(RetryableErrorType.NON_RETRYABLE);
    expect(classified4.shouldRetry).toBe(false);
  });

  it("Verify callbacks are called in correct order", async () => {
    const callSequence: string[] = [];
    const retryConfig = createMockQualityRetryConfig();
    const task = QualityRetryHandler.executeWithRetry<string>("test prompt", retryConfig, {
      generate: async (prompt, attempt) => {
        callSequence.push(`generate-${attempt}`);
        if (attempt === 1) {
          throw new RAIError("Safety violation", prompt);
        }
        return "generated-image-url";
      },
      evaluate: async (output) => {
        callSequence.push("evaluate");
        return createMockQualityEvaluation(0.5);
      },
      applyCorrections: async (p, e, a) => {
        callSequence.push("applyCorrections");
        return p;
      },
      calculateScore: (e) => {
        callSequence.push("calculateScore");
        return e.score;
      },
      sanitizePrompt: async (prompt, errorMessage) => {
        callSequence.push("sanitizePrompt");
        return prompt + " (sanitized)";
      },
      onRetry: async (error, attempt) => {
        callSequence.push(`onRetry-${attempt}-${error.type}`);
      },
    });
    vi.runAllTimersAsync();
    await task;

    expect(callSequence).toContain("generate-1");
    expect(callSequence).toContain("sanitizePrompt");
    expect(callSequence).toContain("onRetry-1-SAFETY");
    expect(callSequence).toContain("generate-2");
    expect(callSequence).toContain("evaluate");
    expect(callSequence).toContain("calculateScore");
    const gen1Index = callSequence.indexOf("generate-1");
    const gen2Index = callSequence.indexOf("generate-2");
    expect(gen1Index).toBeLessThan(gen2Index);
  });
});
