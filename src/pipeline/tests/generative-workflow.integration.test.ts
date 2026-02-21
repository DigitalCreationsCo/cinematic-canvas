import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CinematicVideoWorkflow } from '../graph.js';
import { JobControlPlane } from '../../shared/services/job-control-plane.js';
import { ProjectRepository } from '../../shared/services/project-repository.js';
import { GCPStorageManager } from '../../shared/services/storage-manager.js';
import { DistributedLockManager } from '../../shared/services/lock-manager.js';
import { WorkflowState, Project, Job, JobType } from '../../shared/types/index.js';
import { Dispatcher } from '../dispatcher.js';
import { MemorySaver } from "@langchain/langgraph";

// Mock dependencies
vi.mock('../../shared/services/job-control-plane.js');
vi.mock('../../shared/services/project-repository.js');
vi.mock('../../shared/services/storage-manager.js');
vi.mock('../../shared/services/lock-manager.js');
vi.mock('../dispatcher.js');
vi.mock('../../shared/services/asset-version-manager.js', () => ({
    AssetVersionManager: class MockAssetVersionManager {
        setBestVersion = vi.fn().mockResolvedValue(undefined);
        getNextVersionNumber = vi.fn().mockResolvedValue([ 1 ]);
        getBestVersion = vi.fn().mockResolvedValue([ { data: 'gs://bucket/video.mp4', version: 1 } ]);
        createVersionedAssets = vi.fn().mockResolvedValue([ { head: 1 } ]);
    },
}));

describe('Generative Workflow Integration', () => {
    let workflow: CinematicVideoWorkflow;
    let mockJobControlPlane: any;
    let mockProjectRepository: any;
    let mockStorageManager: any;
    let mockLockManager: any;
    let mockDispatcher: any;
    let mockPublishEvent: any;
    let checkpointer: MemorySaver;

    const projectId = 'test-project-id';
    const gcpProjectId = 'test-gcp-project';
    const bucketName = 'test-bucket';

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup Mocks
        mockJobControlPlane = {
            createJob: vi.fn().mockResolvedValue({ id: 'job-123' }),
            getJob: vi.fn(),
            updateJobState: vi.fn(),
            jobId: vi.fn().mockReturnValue('job-123'),
            uniqueKey: vi.fn().mockReturnValue('unique-key'),
        };

        mockProjectRepository = {
            getProject: vi.fn().mockResolvedValue({ 
                id: projectId, 
                metadata: { enhancedPrompt: 'test prompt' },
                storyboard: { scenes: [] },
                generationRules: [],
            }),
            getProjectScenes: vi.fn().mockResolvedValue([]),
            getProjectFullState: vi.fn().mockResolvedValue({
                id: projectId,
                metadata: { audioGcsUri: 'gs://bucket/audio.mp3' },
                scenes: [],
                forceRegenerateSceneIds: []
            }),
            updateProject: vi.fn().mockResolvedValue({ id: projectId, status: 'complete' }),
            updateCharacters: vi.fn().mockResolvedValue([]),
            updateLocations: vi.fn().mockResolvedValue([]),
        };

        mockStorageManager = {
            fileExists: vi.fn().mockResolvedValue(false),
            getObjectPath: vi.fn().mockReturnValue('path/to/object'),
            uploadJSON: vi.fn().mockResolvedValue('gs://bucket/path/to/object'),
            getPublicUrl: vi.fn().mockReturnValue('https://storage.googleapis.com/bucket/path/to/object'),
        };

        mockLockManager = {
            acquireLock: vi.fn().mockResolvedValue(true),
            releaseLock: vi.fn().mockResolvedValue(undefined),
        };

        mockDispatcher = {
            ensureJob: vi.fn().mockResolvedValue({ id: 'job-123', status: 'completed' }),
            ensureBatchJobs: vi.fn().mockResolvedValue([{ id: 'job-123', status: 'completed' }]),
            dispatch: vi.fn().mockResolvedValue(undefined),
        };

        (Dispatcher as unknown as ReturnType<typeof vi.fn>).mockImplementation(function() { return mockDispatcher; });

        // Initialize Workflow
        workflow = new CinematicVideoWorkflow({
            gcpProjectId,
            projectId,
            bucketName,
            jobControlPlane: mockJobControlPlane,
            projectRepository: mockProjectRepository,
            storageManager: mockStorageManager,
            lockManager: mockLockManager,
        });

        mockPublishEvent = vi.fn();
        workflow.publishEvent = mockPublishEvent;
        checkpointer = new MemorySaver();
    });

    it('should initialize successfully', () => {
        expect(workflow).toBeDefined();
        expect(workflow.graph).toBeDefined();
    });

    it('should traverse the graph for a prompt-based workflow', async () => {
        // Setup initial state
        const initialState: WorkflowState = {
            id: 'workflow-1',
            projectId: projectId,
            hasAudio: false,
            currentSceneIndex: 0,
            nodeAttempts: {},
            jobIds: {},
            errors: [],
            userApprovedProcessing: false,
            __interrupt__: [],
            __interrupt_resolved__: false,
            localAudioPath: undefined
        };

        // Compile the graph
        const app = workflow.graph.compile({ checkpointer });

         mockProjectRepository.getProject.mockResolvedValueOnce({ 
            id: projectId, 
            metadata: { }, 
            storyboard: { scenes: [] },
            generationRules: [],
        });

        const iterator = await app.stream(initialState, { configurable: { thread_id: "test-thread" } });
        
        for await (const chunk of iterator) {
        }
        
        // Verify EnsureJob was called for expand_creative_prompt
        expect(mockDispatcher.ensureJob).toHaveBeenCalledWith(expect.objectContaining({
            nodeName: 'expand_creative_prompt',
            jobType: 'EXPAND_CREATIVE_PROMPT'
        }));
        
        // Verify EnsureJob was called for generate_storyboard_exclusively_from_prompt
        expect(mockDispatcher.ensureJob).toHaveBeenCalledWith(expect.objectContaining({
            nodeName: 'generate_storyboard_exclusively_from_prompt',
            jobType: 'GENERATE_STORYBOARD'
        }));
    });

    it('should handle user approval interruption', async () => {
        // Mock getProjectScenes to return scenes with some assets
        mockProjectRepository.getProjectScenes.mockResolvedValue([
            { id: 'scene-1', assets: { scene_video: { data: 'gs://...' } } }
        ]);

        const initialState: WorkflowState = {
            id: 'workflow-1',
            projectId: projectId,
            hasAudio: false,
            currentSceneIndex: 0,
            nodeAttempts: {},
            jobIds: {},
            errors: [],
            userApprovedProcessing: false,
            __interrupt__: [],
            __interrupt_resolved__: false,
            localAudioPath: undefined
        };
        
        const app = workflow.graph.compile({ checkpointer });
        
        // Let's mock `getProject` to return a state that directs to `generate_scene_assets`
        mockProjectRepository.getProject.mockResolvedValue({ 
            id: projectId, 
            metadata: { enhancedPrompt: 'test prompt' },
            storyboard: { scenes: [{ id: 's1' }] },
            generationRules: ['rule1'],
        });
        
        const iterator = await app.stream(initialState, { configurable: { thread_id: "test-thread-2" } });
        
        try {
            for await (const chunk of iterator) {
                // Iterating through chunks to progress the graph
            }
        } catch (e) {
            // Expected interruption
        }
        
        const state = await app.getState({ configurable: { thread_id: "test-thread-2" } });
        expect(state.tasks[0]?.interrupts).toBeDefined();
        expect(state.tasks[0]?.interrupts?.length).toBeGreaterThan(0);
        expect(state.tasks[0]?.interrupts?.[0].value.type).toBe('user_approval');
    });

    it('should handle job failure with interrupt', async () => {
        mockProjectRepository.getProject.mockResolvedValue({ 
            id: projectId, 
            metadata: { enhancedPrompt: 'test prompt' },
            storyboard: { scenes: [] },
            generationRules: [],
        });

        mockDispatcher.ensureJob.mockImplementation((args: any) => {
            if (args.nodeName === 'enrich_storyboard_and_scenes') {
                throw new Error('Simulated Job Failure');
            }
            return { id: 'job-123', status: 'completed' };
        });

        const initialState: WorkflowState = {
            id: 'workflow-1',
            projectId: projectId,
            hasAudio: false,
            currentSceneIndex: 0,
            nodeAttempts: {},
            jobIds: {},
            errors: [],
            userApprovedProcessing: false,
            __interrupt__: [],
            __interrupt_resolved__: false,
            localAudioPath: undefined
        };

        const app = workflow.graph.compile({ checkpointer });
        
        const iterator = await app.stream(initialState, { configurable: { thread_id: "test-thread-error" } });
        
        try {
            for await (const chunk of iterator) {
            }
        } catch (e) {
        }

        const state = await app.getState({ configurable: { thread_id: "test-thread-error" } });
        
        expect(state.tasks[0]?.interrupts).toBeDefined();
        expect(state.tasks[0]?.interrupts?.length).toBeGreaterThan(0);
        const interruptVal = state.tasks[0]?.interrupts?.[0].value;
        expect(interruptVal.error).toContain('Simulated Job Failure');
        expect(interruptVal.nodeName).toBe('enrich_storyboard_and_scenes');
    });

});