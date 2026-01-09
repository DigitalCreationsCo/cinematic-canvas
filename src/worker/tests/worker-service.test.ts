import { WorkerService } from '../worker-service';
import { JobControlPlane } from '../../pipeline/services/job-control-plane';
import { GCPStorageManager } from '../../workflow/storage-manager';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../pipeline/services/job-control-plane');
vi.mock('../workflow/storage-manager');
vi.mock('../workflow/agents/audio-processing-agent');
vi.mock('../workflow/agents/compositional-agent');
vi.mock('../workflow/agents/quality-check-agent');
vi.mock('../workflow/agents/semantic-expert-agent');
vi.mock('../workflow/agents/frame-composition-agent');
vi.mock('../workflow/agents/scene-generator');
vi.mock('../workflow/agents/continuity-manager');

describe('WorkerService', () => {
    let workerService: WorkerService;
    let mockJobControlPlane: any;
    let mockPublishJobEvent: any;
    const workerId = 'test-worker-id';
    const bucketName = 'test-bucket';

    beforeEach(() => {
        mockPublishJobEvent = vi.fn();
        mockJobControlPlane = {
            claimJob: vi.fn(),
            getJob: vi.fn(),
            updateJobState: vi.fn(),
        };

        // Setup mock implementations for agents if needed, 
        // but simple class mocks provided by vi.mock should suffice for verification of calls.

        workerService = new WorkerService(
            workerId,
            bucketName,
            mockJobControlPlane,
            mockPublishJobEvent,
            vi.fn()
        );

        // Mock getAgents return values by mocking the classes they return
        // Since we mock the modules, the constructors will return mocks.
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should fail to claim job if already taken', async () => {
        mockJobControlPlane.claimJob.mockResolvedValue(false);
        await workerService.processJob('job-1');
        expect(mockJobControlPlane.claimJob).toHaveBeenCalledWith('job-1', workerId);
        expect(mockJobControlPlane.getJob).not.toHaveBeenCalled();
    });

    it('should fail if job not found after claim', async () => {
        mockJobControlPlane.claimJob.mockResolvedValue(true);
        mockJobControlPlane.getJob.mockResolvedValue(null);
        await workerService.processJob('job-1');
        expect(mockJobControlPlane.getJob).toHaveBeenCalledWith('job-1');
        expect(mockPublishJobEvent).not.toHaveBeenCalled();
    });

    it('should process EXPAND_CREATIVE_PROMPT job', async () => {
        mockJobControlPlane.claimJob.mockResolvedValue(true);
        mockJobControlPlane.getJob.mockResolvedValue({
            id: 'job-1',
            type: 'EXPAND_CREATIVE_PROMPT',
            projectId: 'owner-1',
            payload: { enhancedPrompt: 'foo' }
        });

        // We need to access the mock instance of CompositionalAgent
        const { CompositionalAgent } = await import('../../workflow/agents/compositional-agent');
        const mockExpandCreativePrompt = vi.fn().mockResolvedValue('expanded foo');
        (CompositionalAgent as any).mockImplementation(function () {
            return {
                expandCreativePrompt: mockExpandCreativePrompt
            };
        });

        // Also need to mock GCPStorageManager uploadJSON
        const mockUploadJSON = vi.fn();
        (GCPStorageManager as any).mockImplementation(function () {
            return {
                uploadJSON: mockUploadJSON
            };
        });

        await workerService.processJob('job-1');

        expect(mockExpandCreativePrompt).toHaveBeenCalledWith('foo');
        // Worker service no longer uploads to GCS for this job type, it saves result to DB
        expect(mockJobControlPlane.updateJobState).toHaveBeenCalledWith('job-1', 'COMPLETED', { expandedPrompt: 'expanded foo' });
        expect(mockPublishJobEvent).toHaveBeenCalledWith({ type: 'JOB_COMPLETED', jobId: 'job-1' });
    });

    it('should handle errors during processing', async () => {
        mockJobControlPlane.claimJob.mockResolvedValue(true);
        mockJobControlPlane.getJob.mockResolvedValue({
            id: 'job-1',
            type: 'EXPAND_CREATIVE_PROMPT',
            projectId: 'owner-1',
            payload: { enhancedPrompt: 'foo' }
        });

        const { CompositionalAgent } = await import('../../workflow/agents/compositional-agent');
        (CompositionalAgent as any).mockImplementation(function () {
            return {
                expandCreativePrompt: vi.fn().mockRejectedValue(new Error('Processing failed'))
            };
        });

        // Need to ensure GCPStorageManager is also mocked correctly for this test case
        // as getAgents instantiates it.
        (GCPStorageManager as any).mockImplementation(function () {
            return {
                uploadJSON: vi.fn()
            };
        });

        await workerService.processJob('job-1');

        expect(mockJobControlPlane.updateJobState).toHaveBeenCalledWith('job-1', 'FAILED', undefined, 'Processing failed');
        expect(mockPublishJobEvent).toHaveBeenCalledWith({ type: 'JOB_FAILED', jobId: 'job-1', error: 'Processing failed' });
    });
});
