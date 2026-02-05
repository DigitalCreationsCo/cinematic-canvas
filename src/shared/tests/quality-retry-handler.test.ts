import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QualityRetryHandler, QualityRetryConfig, GenerationCallbacks } from '../utils/quality-retry-handler.js';
import { GraphInterrupt } from "@langchain/langgraph";
import { RetryLogger } from '../utils/retry-logger.js';

// 1. Mock Dependencies
vi.mock('@langchain/langgraph', () => {
    return {
        GraphInterrupt: class GraphInterrupt extends Error {
            constructor() {
                super("GraphInterrupt");
                this.name = "GraphInterrupt";
            }
        }
    };
});

vi.mock('./retry-logger', () => ({
    RetryLogger: {
        logAttemptStart: vi.fn(),
        logEvaluationDetails: vi.fn(),
        logFinalResult: vi.fn(),
        logPromptCorrections: vi.fn(),
        logFallbackRetry: vi.fn(),
    }
}));

// 2. Constants & Helpers
const MOCK_CONFIG: QualityRetryConfig = {
    qualityConfig: {
        minorIssueThreshold: 0.8,
        acceptThreshold: 0.9,
        majorIssueThreshold: 0.7,
        failThreshold: 0.6,
        maxRetries: 3,
        safetyRetries: 1,
        enabled: true
    },
    context: {
        assetKey: 'scene_end_frame',
        sceneId: 'scene_1',
        attempt: 1,
        sceneIndex: 1,
        maxAttempts: 3,
        projectId: 'test_project'
    }
};

describe('QualityRetryHandler', () => {
    let callbacks: GenerationCallbacks<string>;

    beforeEach(() => {
        vi.useFakeTimers();

        // Default mocks
        callbacks = {
            generate: vi.fn(),
            evaluate: vi.fn(),
            applyCorrections: vi.fn(),
            calculateScore: vi.fn((evalResult) => evalResult.score),
            onAttemptComplete: vi.fn(),
            onRetry: vi.fn(),
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    // --- Scenario 1: Immediate Success ---
    it('should succeed on the first attempt if quality is acceptable', async () => {
        // Setup
        (callbacks.generate as any).mockResolvedValue("Perfect Image");
        (callbacks.evaluate as any).mockResolvedValue({ score: 0.9, grade: "A" });

        // Execute
        const result = await QualityRetryHandler.executeWithRetry("prompt", MOCK_CONFIG, callbacks);

        // Assertions
        expect(result.metadata.finalScore).toBe(0.9);
        expect(result.metadata.attempts).toBe(1);
        expect(result.output).toBe("Perfect Image");

        expect(callbacks.generate).toHaveBeenCalledTimes(1);
        expect(callbacks.onAttemptComplete).toHaveBeenCalledWith(expect.objectContaining({
            output: "Perfect Image",
            attempt: 1
        }));
        expect(callbacks.onRetry).not.toHaveBeenCalled();
        expect(RetryLogger.logFinalResult).toHaveBeenCalled();
    });

    // --- Scenario 2: Quality Retry Success ---
    it('should retry and succeed when quality improves', async () => {
        // Attempt 1: Fail (0.5)
        // Attempt 2: Success (0.85)
        (callbacks.generate as any)
            .mockResolvedValueOnce("Bad Image")
            .mockResolvedValueOnce("Good Image");

        (callbacks.evaluate as any)
            .mockResolvedValueOnce({ score: 0.5, promptCorrections: [ { correctedPromptSection: "fix" } ] })
            .mockResolvedValueOnce({ score: 0.85 });

        (callbacks.applyCorrections as any).mockResolvedValue("Fixed Prompt");

        const result = await QualityRetryHandler.executeWithRetry("prompt", MOCK_CONFIG, callbacks);

        expect(result.metadata.attempts).toBe(2);
        expect(result.metadata.finalScore).toBe(0.85);
        expect(result.output).toBe("Good Image");

        // Verify Flow
        expect(callbacks.onRetry).toHaveBeenCalledWith("Quality below threshold", 1);
        expect(callbacks.applyCorrections).toHaveBeenCalledWith("prompt", expect.anything(), 1);
        expect(callbacks.generate).toHaveBeenNthCalledWith(2, "Fixed Prompt", 1); // Note: Loop index logic vs Context logic
    });

    // --- Scenario 3: Max Retries Exhausted (Return Best) ---
    it('should return the best attempt after exhausting maxRetries', async () => {
        // 3 attempts, all fail. 
        // Scores: 0.4, 0.6 (Best), 0.2

        (callbacks.generate as any)
            .mockResolvedValueOnce("Img1")
            .mockResolvedValueOnce("Img2") // Best
            .mockResolvedValueOnce("Img3");

        (callbacks.evaluate as any)
            .mockResolvedValueOnce({ score: 0.4 })
            .mockResolvedValueOnce({ score: 0.6 })
            .mockResolvedValueOnce({ score: 0.2 });

        (callbacks.applyCorrections as any).mockResolvedValue("New Prompt");

        const result = await QualityRetryHandler.executeWithRetry("prompt", MOCK_CONFIG, callbacks);

        // Assertions
        expect(result.metadata.attempts).toBe(3);
        expect(result.metadata.finalScore).toBe(0.6); // Best Score
        expect(result.output).toBe("Img2");  // Best Image
        expect(result.metadata.warning).toContain("Quality below threshold");

        expect(callbacks.onRetry).toHaveBeenCalledTimes(2); // Retries after 1 and 2

        // Verify timers were advanced
        expect(vi.getTimerCount()).toBe(0); // Timers cleared
    });

    // --- Scenario 4: Critical Error (GraphInterrupt) ---
    it('should immediately re-throw GraphInterrupt without retrying', async () => {
        (callbacks.generate as any).mockImplementation(() => {
            throw new GraphInterrupt();
        });

        await expect(
            QualityRetryHandler.executeWithRetry("prompt", MOCK_CONFIG, callbacks)
        ).rejects.toThrow("GraphInterrupt");

        expect(callbacks.onRetry).not.toHaveBeenCalled(); // Should not treat interrupt as a retry
        expect(callbacks.generate).toHaveBeenCalledTimes(1);
    });

    // --- Scenario 5: Infrastructure Error (Retryable) ---
    it('should retry on generic errors using the onRetry hook', async () => {
        // Attempt 1: Error
        // Attempt 2: Success
        const error = new Error("API Timeout");
        (callbacks.generate as any)
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce("Recovered Image");

        (callbacks.evaluate as any).mockResolvedValue({ score: 0.9 });

        const promise = QualityRetryHandler.executeWithRetry("prompt", MOCK_CONFIG, callbacks);

        // Fast-forward backoff delay
        await vi.runAllTimersAsync();

        const result = await promise;

        expect(result.metadata.attempts).toBe(2);
        expect(result.output).toBe("Recovered Image");

        expect(callbacks.onRetry).toHaveBeenCalledWith(error, 1);
    });

    // --- Scenario 6: Prompt Correction Fallback ---
    it('should fallback retry if no prompt corrections are provided', async () => {
        // Attempt 1: Fail, no corrections provided in eval
        // Attempt 2: Success
        (callbacks.generate as any).mockResolvedValue("Bad Image");
        (callbacks.evaluate as any).mockResolvedValueOnce({
            score: 0.5,
            promptCorrections: [] // Empty
        }).mockResolvedValueOnce({ score: 0.9 });

        (callbacks.applyCorrections as any).mockResolvedValue("Should Not Be Called");

        const promise = QualityRetryHandler.executeWithRetry("prompt", MOCK_CONFIG, callbacks);
        await vi.runAllTimersAsync();
        await promise;

        expect(RetryLogger.logFallbackRetry).toHaveBeenCalled();
        expect(callbacks.applyCorrections).not.toHaveBeenCalled();
        expect(callbacks.onRetry).toHaveBeenCalled();
    });

    // --- Scenario 7: Catastrophic Failure ---
    it('should throw Error if retries exhausted and no valid output generated', async () => {
        // Generator throws error every time
        (callbacks.generate as any).mockRejectedValue(new Error("Broken Pipe"));

        const promise = QualityRetryHandler.executeWithRetry("prompt", MOCK_CONFIG, callbacks);

        // Advance timers for all retries
        await vi.advanceTimersByTimeAsync(10000); // Enough for 3 retries

        await expect(promise).rejects.toThrow(/Failed to generate acceptable test_asset/);

        expect(callbacks.onRetry).toHaveBeenCalledTimes(3);
    });

    // --- Scenario 8: onAttemptComplete Call ---
    it('should call onAttemptComplete even if score is low', async () => {
        // Attempt 1: Low score
        // Attempt 2: High score
        (callbacks.generate as any).mockResolvedValue("Img");
        (callbacks.evaluate as any)
            .mockResolvedValueOnce({ score: 0.1 })
            .mockResolvedValueOnce({ score: 0.9 });
        (callbacks.applyCorrections as any).mockResolvedValue("p");

        const promise = QualityRetryHandler.executeWithRetry("p", MOCK_CONFIG, callbacks);
        await vi.runAllTimersAsync();
        await promise;

        // Should be called twice (once for bad attempt, once for good)
        expect(callbacks.onAttemptComplete).toHaveBeenCalledTimes(2);
    });
});