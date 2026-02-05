import { WorkerService } from '../worker-service.js';
import { CompositionalAgent } from '../../shared/agents/compositional-agent.js';
import { GCPStorageManager } from '../../shared/services/storage-manager.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies with explicit factories
vi.mock('../../shared/services/job-control-plane.js');

// Mock StorageManager (must be a constructor for new GCPStorageManager())
const mockUploadJSON = vi.fn();
vi.mock('../../shared/services/storage-manager.js', () => ({
    GCPStorageManager: class MockGCPStorageManager {
        uploadJSON = mockUploadJSON;
    },
}));

// All agents must be constructors so getAgents() can do new Agent(...)
const mockExpandCreativePrompt = vi.fn();
vi.mock('../../shared/agents/audio-processing-agent.js', () => ({
    AudioProcessingAgent: class MockAudioProcessingAgent { },
}));
vi.mock('../../shared/agents/compositional-agent.js', () => ({
    CompositionalAgent: class MockCompositionalAgent {
        expandCreativePrompt = mockExpandCreativePrompt;
        generateStoryboardExclusivelyFromPrompt = vi.fn().mockResolvedValue({ data: {}, metadata: {} });
        generateFullStoryboard = vi.fn().mockResolvedValue({ data: {}, metadata: {} });
    },
}));
vi.mock('../../shared/agents/quality-check-agent.js', () => ({
    QualityCheckAgent: class MockQualityCheckAgent { },
}));
vi.mock('../../shared/agents/semantic-expert-agent.js', () => ({
    SemanticExpertAgent: class MockSemanticExpertAgent { },
}));
const mockGenerateImage = vi.fn();
vi.mock('../../shared/agents/frame-composition-agent.js', () => ({
    FrameCompositionAgent: class MockFrameCompositionAgent {
        generateImage = mockGenerateImage;
    },
}));

const mockGenerateSceneWithQualityCheck = vi.fn();
vi.mock('../../shared/agents/scene-generator.js', () => ({
    SceneGeneratorAgent: class MockSceneGeneratorAgent {
        generateSceneWithQualityCheck = mockGenerateSceneWithQualityCheck;
    },
}));
vi.mock('../../shared/agents/continuity-manager.js', () => ({
    ContinuityManagerAgent: class MockContinuityManagerAgent {
        prepareAndRefineSceneInputs = vi.fn().mockResolvedValue({
            enhancedPrompt: 'enhanced',
            characterReferenceImages: [],
            locationReferenceImages: [],
            sceneCharacters: [],
            location: {},
            previousScene: undefined,
            generationRules: []
        });
        updateNarrativeState = vi.fn().mockReturnValue({});
    },
}));
vi.mock('../../shared/services/media-controller.js', () => ({
    MediaController: class MockMediaController { },
}));
vi.mock('../../shared/services/asset-version-manager.js', () => ({
    AssetVersionManager: class MockAssetVersionManager {
        getNextVersionNumber = vi.fn().mockResolvedValue([ 1 ]);
        createVersionedAssets = vi.fn().mockResolvedValue([]);
    },
}));

const mockGetProject = vi.fn();
const mockUpdateProject = vi.fn();
vi.mock('../../shared/services/project-repository.js', () => ({
    ProjectRepository: class MockProjectRepository {
        getProject = mockGetProject;
        updateProject = mockUpdateProject;
        updateScenes = vi.fn().mockResolvedValue(undefined);
        getProjectScenes = vi.fn().mockResolvedValue([]);
        getProjectCharacters = vi.fn().mockResolvedValue([]);
        getProjectLocations = vi.fn().mockResolvedValue([]);
        createCharacters = vi.fn().mockResolvedValue(undefined);
        createLocations = vi.fn().mockResolvedValue(undefined);
        createScenes = vi.fn().mockResolvedValue(undefined);
        getProjectFullState = vi.fn().mockResolvedValue({
            scenes: [ { id: 'scene-1', assets: {} } ],
            metadata: { hasAudio: false },
            forceRegenerateSceneIds: []
        });
    },
}));

describe('WorkerService', () => {
    let workerService: WorkerService;
    let mockJobControlPlane: any;
    let mockPublishJobEvent: any;
    const gcpProjectId = 'test-gcp-project-id';
    const workerId = 'test-worker-id';
    const bucketName = 'test-bucket';

    beforeEach(() => {
        mockPublishJobEvent = vi.fn();
        mockJobControlPlane = {
            claimJob: vi.fn(),
            getJob: vi.fn(),
            updateJobState: vi.fn(),
            updateJobSafe: vi.fn().mockResolvedValue({ id: 'job-1', attempts: { currentAttempt: 1 }, type: 'EXPAND_CREATIVE_PROMPT', projectId: 'owner-1', payload: {} }),
            updateJobSafeAndIncrementAttempt: vi.fn().mockResolvedValue(undefined),
            createIncrementAttemptHook: vi.fn().mockReturnValue(vi.fn()),
        };

        // Reset our manual spies
        mockExpandCreativePrompt.mockReset();
        mockExpandCreativePrompt.mockReset();
        mockGenerateImage.mockReset();
        mockGenerateSceneWithQualityCheck.mockReset();
        mockUploadJSON.mockReset();

        // Default behavior (worker expects { data: { expandedPrompt }, metadata })
        mockExpandCreativePrompt.mockResolvedValue({ data: { expandedPrompt: 'expanded foo' }, metadata: {} });

        workerService = new WorkerService(
            gcpProjectId,
            workerId,
            bucketName,
            mockJobControlPlane,
            { lock: vi.fn(), unlock: vi.fn() } as any,
            mockPublishJobEvent,
            vi.fn()
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should fail to claim job if already taken', async () => {
        mockJobControlPlane.claimJob.mockResolvedValue(null);
        await workerService.processJob('job-1');
        expect(mockJobControlPlane.claimJob).toHaveBeenCalledWith('job-1');
        expect(mockJobControlPlane.getJob).not.toHaveBeenCalled();
    });

    it('should fail if job not found after claim', async () => {
        mockJobControlPlane.claimJob.mockResolvedValue(null);
        await workerService.processJob('job-1');
        expect(mockPublishJobEvent).not.toHaveBeenCalled();
    });

    const makeClaim = (overrides: Partial<{ id: string; type: string; projectId: string; payload: any; attempts: any; }> = {}) => [
        {
            id: 'job-1',
            type: 'EXPAND_CREATIVE_PROMPT',
            projectId: 'owner-1',
            payload: { enhancedPrompt: 'foo' },
            attempts: { currentAttempt: 1, totalAttempts: 1, maxRetries: 3, failureHistory: [] },
            ...overrides
        },
        new Date().toISOString()
    ] as const;

    it('should process EXPAND_CREATIVE_PROMPT job', async () => {
        mockJobControlPlane.claimJob.mockResolvedValue(makeClaim());
        mockGetProject.mockResolvedValue({ id: 'owner-1', metadata: { title: 'Test', initialPrompt: 'foo' } });
        mockUpdateProject.mockResolvedValue({ id: 'owner-1', metadata: { title: 'Test', initialPrompt: 'foo', enhancedPrompt: 'expanded foo' } });

        await workerService.processJob('job-1');

        expect(mockExpandCreativePrompt).toHaveBeenCalledWith('Test', 'foo', expect.objectContaining({ projectId: 'owner-1' }));
        expect(mockJobControlPlane.updateJobSafe).toHaveBeenCalledWith('job-1', 1, { state: 'COMPLETED' });
        expect(mockPublishJobEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'JOB_COMPLETED', jobId: 'job-1' }));
    });

    it('should handle errors during processing', async () => {
        mockJobControlPlane.claimJob.mockResolvedValue(makeClaim());
        mockExpandCreativePrompt.mockRejectedValue(new Error('Processing failed'));

        await workerService.processJob('job-1');

        expect(mockJobControlPlane.updateJobSafeAndIncrementAttempt).toHaveBeenCalled();
        expect(mockPublishJobEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'JOB_FAILED', jobId: 'job-1' }));
    });

    it('should propagate claimJob errors (DB failure)', async () => {
        const error = new Error('DB Connection Failed');
        mockJobControlPlane.claimJob.mockRejectedValue(error);

        await expect(workerService.processJob('job-1')).rejects.toThrow('DB Connection Failed');

        expect(mockJobControlPlane.claimJob).toHaveBeenCalledWith('job-1');
        expect(mockJobControlPlane.getJob).not.toHaveBeenCalled();
        expect(mockJobControlPlane.updateJobState).not.toHaveBeenCalled();
        expect(mockJobControlPlane.updateJobState).not.toHaveBeenCalled();
    });

    it('should pass uniqueId to SceneGeneratorAgent for GENERATE_SCENE_VIDEO', async () => {
        mockJobControlPlane.claimJob.mockResolvedValue(makeClaim({
            type: 'GENERATE_SCENE_VIDEO',
            payload: { sceneId: 'scene-1', overridePrompt: 'foo' }
        }));
        mockGenerateSceneWithQualityCheck.mockResolvedValue({ data: { videoUrl: 'url' }, metadata: {} });

        await workerService.processJob('job-1');

        expect(mockGenerateSceneWithQualityCheck).toHaveBeenCalledWith(
            expect.objectContaining({
                uniqueId: 'job-1'
            })
        );
    });

    it('should pass uniqueId to FrameCompositionAgent for FRAME_RENDER', async () => {
        mockJobControlPlane.claimJob.mockResolvedValue(makeClaim({
            type: 'FRAME_RENDER',
            payload: { scene: { id: 'scene-1' }, prompt: 'foo', framePosition: 'start' }
        }));
        mockGenerateImage.mockResolvedValue({ data: { image: 'url' }, metadata: {} });

        await workerService.processJob('job-1');

        expect(mockGenerateImage).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'scene-1' }), // scene
            'foo', // prompt
            'start', // position
            undefined, // chars
            undefined, // locs
            undefined, // prev
            undefined, // refs
            expect.any(Function), // save
            expect.any(Function), // update
            expect.any(Function), // attempt
            'job-1' // uniqueId
        );
    });
});
