import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Dispatcher } from '../dispatcher.js';
import { WorkflowFatalError } from '../../shared/utils/errors.js';
import * as langgraph from "@langchain/langgraph";

// Mock LangGraph interrupt to prevent execution halting
vi.mock("@langchain/langgraph", async () => {
    const actual = await vi.importActual("@langchain/langgraph");
    return { ...actual, interrupt: vi.fn() };
});

describe('Dispatcher: Successor Recovery Logic', () => {
    let cp: any;
    let dispatcher: Dispatcher;
    const PROJECT_ID = 'proj_123';

    const mockFatalJob: any = {
        id: 'job_old',
        projectId: PROJECT_ID,
        type: 'GENERATE_SCENE_FRAMES',
        uniqueKey: 'scene_1',
        state: 'FAILED', // Initial state to trigger handleRetriableFailure
        attempts: {
            currentAttempt: 3, // Exhausted (maxRetries for this type is 3)
            totalAttempts: 3,
            maxRetries: 3,
            failureHistory: [ { error: 'GPU Timeout' } ]
        },
        error: 'GPU Timeout'
    };

    beforeEach(() => {
        cp = {
            getLatestJob: vi.fn(),
            getJob: vi.fn(),
            createJob: vi.fn(),
            updateJobState: vi.fn(),
            requeueJob: vi.fn(),
            createIncrementAttemptHook: vi.fn()
        };
        dispatcher = new Dispatcher(cp, PROJECT_ID, 10);
    });

    it('should escalate to FATAL and create a successor when retries are exhausted', async () => {
        // 1. Setup DB sequence
        cp.getLatestJob.mockResolvedValueOnce(mockFatalJob); // ensureJob call
        cp.getJob.mockResolvedValue({ ...mockFatalJob, state: 'FATAL' }); // After updateJobState

        // 2. Setup Hook
        const advancedJob = {
            ...mockFatalJob,
            attempts: { ...mockFatalJob.attempts, totalAttempts: 4 }
        };
        const mockHook = vi.fn().mockResolvedValue(advancedJob);
        cp.createIncrementAttemptHook.mockReturnValue(mockHook);

        // 3. Mock Successor Creation
        cp.createJob.mockResolvedValue({ id: 'job_new', state: 'PENDING', attempts: advancedJob.attempts });

        // Execute (Expect an interrupt which is the "Success" state for Dispatcher)
        try {
            await dispatcher.ensureJob('scene_1', 'GENERATE_SCENE_FRAMES', 'scene_start_frame', {  } as any);
        } catch (e) {
            // We expect an interrupt call, which might throw in some environments
        }

        // VERIFICATIONS
        // A. Verify escalation to FATAL
        expect(cp.updateJobState).toHaveBeenCalledWith(mockFatalJob.id, 'FATAL', expect.anything());

        // B. Verify Hook usage: extracted from class context correctly
        expect(cp.createIncrementAttemptHook).toHaveBeenCalled();
        expect(mockHook).toHaveBeenCalledWith('GPU Timeout', 'SUCCESSOR_RECOVERY');

        // C. Verify Successor inheritance
        expect(cp.createJob).toHaveBeenCalledWith(expect.objectContaining({
            uniqueKey: 'scene_1',
            state: 'PENDING',
            attempts: expect.objectContaining({
                totalAttempts: 4, // Monotonic increment preserved
                currentAttempt: 1  // Reset for the new record
            })
        }));

        // D. Verify LangGraph was signaled to wait
        expect(langgraph.interrupt).toHaveBeenCalledWith(expect.objectContaining({
            type: 'waiting_for_job',
            errorDetails: expect.objectContaining({ jobId: 'job_new' })
        }));
    });

    it('should throw WorkflowFatalError if totalAttempts exceeds maxTotalAttempts', async () => {
        const exhaustedJob = {
            ...mockFatalJob,
            attempts: { ...mockFatalJob.attempts, totalAttempts: 12 }
        };
        cp.getLatestJob.mockResolvedValue(exhaustedJob);
        cp.getJob.mockResolvedValue(exhaustedJob);

        const mockHook = vi.fn().mockResolvedValue({
            ...exhaustedJob,
            attempts: { ...exhaustedJob.attempts, totalAttempts: 13 }
        });
        cp.createIncrementAttemptHook.mockReturnValue(mockHook);

        await expect(
            dispatcher.ensureJob('scene_1', 'GENERATE_SCENE_FRAMES', 'scene_end_frame', {} as any)
        ).rejects.toThrow(WorkflowFatalError);

        expect(cp.createJob).not.toHaveBeenCalled();
    });
});