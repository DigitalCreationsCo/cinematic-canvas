import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkerService } from '../../../src/worker/worker-service.js';
import { JobControlPlane } from '../../../src/shared/services/job-control-plane.js';
import { DistributedLockManager } from '../../../src/shared/services/lock-manager.js';
import { AssetVersionManager } from '../../../src/shared/services/asset-version-manager.js';
import { ProjectRepository } from '../../../src/shared/services/project-repository.js';
import { MediaProcessingAgent } from '../../../src/shared/agents/media-processing-agent.js';
import { ContinuityManagerAgent } from '../../../src/shared/agents/continuity-manager.js';
import { SceneGeneratorAgent } from '../../../src/shared/agents/scene-generator.js';
import { Job, JobEvent } from '../../../src/shared/types/job.types.js';
import { PipelineEvent } from '../../../src/shared/types/pipeline.types.js';

// Mock all dependencies
vi.mock('../../../src/shared/services/job-control-plane.js');
vi.mock('../../../src/shared/services/lock-manager.js');
vi.mock('../../../src/shared/services/asset-version-manager.js');
vi.mock('../../../src/shared/services/project-repository.js');
vi.mock('../../../src/shared/agents/media-processing-agent.js');
vi.mock('../../../src/shared/agents/continuity-manager.js');
vi.mock('../../../src/shared/agents/scene-generator.js');

describe('WorkerService Asset Management', () => {
  let workerService: WorkerService;
  let mockJobControlPlane: JobControlPlane;
  let mockLockManager: DistributedLockManager;
  let mockAssetManager: AssetVersionManager;
  let mockProjectRepo: ProjectRepository;
  let mockMediaProcessingAgent: MediaProcessingAgent;
  let mockContinuityManagerAgent: ContinuityManagerAgent;
  let mockSceneGeneratorAgent: SceneGeneratorAgent;
  let mockPublishJobEvent: vi.MockedFunction<(event: JobEvent) => Promise<void>>;
  let mockPublishPipelineEvent: vi.MockedFunction<(event: PipelineEvent) => Promise<void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockJobControlPlane = {
      claimJob: vi.fn(),
      createIncrementAttemptHook: vi.fn(),
      updateJobSafe: vi.fn(),
    } as any;
    
    mockLockManager = {} as any;
    
    mockAssetManager = {
      createVersionedAssets: vi.fn(),
      getNextVersionNumber: vi.fn().mockResolvedValue([1]),
    } as any;
    
    mockProjectRepo = {
      getProject: vi.fn(),
      getProjectFullState: vi.fn(),
      updateProject: vi.fn(),
    } as any;

    mockMediaProcessingAgent = {
        renderVideo: vi.fn().mockResolvedValue({ videoGcsUri: 'video-uri', thumbnailGcsUri: 'thumb-uri', duration: 10 }),
        processAudioToScenes: vi.fn(),
    } as any;

    mockContinuityManagerAgent = {
        prepareAndRefineSceneInputs: vi.fn().mockResolvedValue({}),
        updateNarrativeState: vi.fn().mockReturnValue({ scenes: [] }),
    } as any;

    mockSceneGeneratorAgent = {
        generateSceneWithQualityCheck: vi.fn().mockResolvedValue({ data: { scene: {} }, metadata: {} }),
    } as any;
    
    // Wire up mocks to constructors
    vi.mocked(AssetVersionManager).mockImplementation(function() { return mockAssetManager; } as any);
    vi.mocked(ProjectRepository).mockImplementation(function() { return mockProjectRepo; } as any);
    vi.mocked(MediaProcessingAgent).mockImplementation(function() { return mockMediaProcessingAgent; } as any);
    vi.mocked(ContinuityManagerAgent).mockImplementation(function() { return mockContinuityManagerAgent; } as any);
    vi.mocked(SceneGeneratorAgent).mockImplementation(function() { return mockSceneGeneratorAgent; } as any);

    mockPublishJobEvent = vi.fn().mockResolvedValue(undefined);
    mockPublishPipelineEvent = vi.fn().mockResolvedValue(undefined);
    
    workerService = new WorkerService(
      'test-project',
      'worker-1',
      'test-bucket',
      mockJobControlPlane,
      mockLockManager,
      mockPublishJobEvent,
      mockPublishPipelineEvent
    );
  });

  describe('saveAssets callback', () => {
    it('should handle polymorphic asset keys correctly', async () => {
      const job: Job = {
        id: 'job-1',
        projectId: 'proj-1',
        type: 'GENERATE_SCENE_FRAMES',
        state: 'RUNNING',
        attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
        uniqueKey: 'unique-key',
        createdAt: new Date(),
        updatedAt: new Date(),
        error: '',
        assetKey: 'scene_start_frame', // dummy
        workflowId: 'wf-1'
      } as any;

      const mockAssetHistories = [
        {
          head: 1,
          best: 1,
          versions: [{
            version: 1,
            data: 'scene-1-start-frame-url',
            type: 'image',
            metadata: { model: 'test-model', jobId: 'job-1' },
            createdAt: new Date()
          }]
        },
        {
          head: 1,
          best: 1,
          versions: [{
            version: 1,
            data: 'scene-1-end-frame-url',
            type: 'image',
            metadata: { model: 'test-model', jobId: 'job-1' },
            createdAt: new Date()
          }]
        }
      ];

      vi.mocked(mockAssetManager.createVersionedAssets).mockResolvedValue(mockAssetHistories as any);

      // Get the saveAssets callback
      const saveAssets = (workerService as any).createSaveAssetsCallback(job);

      // Call with polymorphic asset keys
      await saveAssets(
        { projectId: 'proj-1', sceneIds: ['scene-1'] },
        ['scene_start_frame', 'scene_end_frame'],
        'image',
        ['scene-1-start-frame-url', 'scene-1-end-frame-url'],
        [{ model: 'test-model' }, { model: 'test-model' }],
        true
      );

      // Verify asset manager was called correctly
      expect(vi.mocked(mockAssetManager.createVersionedAssets)).toHaveBeenCalledWith(
        { projectId: 'proj-1', sceneIds: ['scene-1'] },
        ['scene_start_frame', 'scene_end_frame'],
        'image',
        ['scene-1-start-frame-url', 'scene-1-end-frame-url'],
        [{ model: 'test-model', jobId: 'job-1' }, { model: 'test-model', jobId: 'job-1' }],
        true
      );
    });

    it('should handle single asset key for multiple entities', async () => {
      const job: Job = {
        id: 'job-1',
        projectId: 'proj-1',
        type: 'GENERATE_CHARACTER_ASSETS',
        state: 'RUNNING',
        attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
        uniqueKey: 'unique-key',
        createdAt: new Date(),
        updatedAt: new Date(),
        error: '',
        assetKey: 'character_image',
        workflowId: 'wf-1'
      } as any;

      const mockAssetHistories = [
        {
          head: 1,
          best: 1,
          versions: [{
            version: 1,
            data: 'character-1-url',
            type: 'image',
            metadata: { model: 'test-model', jobId: 'job-1' },
            createdAt: new Date()
          }]
        },
        {
          head: 1,
          best: 1,
          versions: [{
            version: 1,
            data: 'character-2-url',
            type: 'image',
            metadata: { model: 'test-model', jobId: 'job-1' },
            createdAt: new Date()
          }]
        }
      ];

      vi.mocked(mockAssetManager.createVersionedAssets).mockResolvedValue(mockAssetHistories as any);

      const saveAssets = (workerService as any).createSaveAssetsCallback(job);

      // Call with single asset key for multiple entities
      await saveAssets(
        { projectId: 'proj-1', characterIds: ['char-1', 'char-2'] },
        ['character_image'],
        'image',
        ['character-1-url', 'character-2-url'],
        [{ model: 'test-model' }, { model: 'test-model' }],
        true
      );
    });

    it('should handle errors gracefully', async () => {
      const job: Job = {
        id: 'job-1',
        projectId: 'proj-1',
        type: 'GENERATE_SCENE_FRAMES',
        state: 'RUNNING',
        attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
        uniqueKey: 'unique-key',
        createdAt: new Date(),
        updatedAt: new Date(),
        error: '',
        assetKey: 'scene_start_frame',
        workflowId: 'wf-1'
      } as any;

      const error = new Error('Asset creation failed');
      vi.mocked(mockAssetManager.createVersionedAssets).mockRejectedValue(error);

      const saveAssets = (workerService as any).createSaveAssetsCallback(job);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(saveAssets(
        { projectId: 'proj-1', sceneIds: ['scene-1'] },
        ['scene_start_frame'],
        'image',
        ['scene-1-url'],
        [{ model: 'test-model' }],
        true
      )).rejects.toThrow('Asset creation failed');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
            functionName: 'saveAssets',
        }),
        expect.any(String)
      );

      expect(vi.mocked(mockPublishPipelineEvent)).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('GENERATE_SCENE_VIDEO Inline Render', () => {
      it('should trigger inline render if renderInProgress is true and videos exist', async () => {
          const job: Job = {
              id: 'job-video-1',
              projectId: 'proj-1',
              type: 'GENERATE_SCENE_VIDEO',
              state: 'RUNNING',
              attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
              uniqueKey: 'unique-video-key',
              createdAt: new Date(),
              updatedAt: new Date(),
              error: '',
              assetKey: 'scene_video',
              workflowId: 'wf-1',
              payload: {
                  sceneId: 'scene-1',
                  overridePrompt: '',
                  renderInProgress: true
              }
          } as any;

          vi.mocked(mockJobControlPlane.claimJob).mockResolvedValue([job, new Date().toISOString()]);
          vi.mocked(mockJobControlPlane.updateJobSafe).mockResolvedValue(job);
          vi.mocked(mockAssetManager.createVersionedAssets).mockResolvedValue([{ head: 1, best: 1, versions: [] }] as any);
          
          const mockScene = { 
              id: 'scene-1', 
              assets: { 
                  scene_video: { 
                      head: 1, best: 1, versions: [{ version: 1, data: 'video-url-1', type: 'video' }] 
                  } 
              } 
          };
          const mockProject = {
              id: 'proj-1',
              metadata: { title: 'Test Project', audioGcsUri: 'audio-uri' },
              scenes: [mockScene],
              forceRegenerateSceneIds: [],
              generationRules: [],
          };
          
          const updatedProject = { ...mockProject, metadata: { ...mockProject.metadata, title: 'Updated Title' } };

          vi.mocked(mockProjectRepo.getProjectFullState).mockResolvedValue(mockProject as any);
          vi.mocked(mockProjectRepo.updateProject).mockResolvedValue(updatedProject as any);
          
          // Setup mocks for internal agent calls
          vi.mocked(mockContinuityManagerAgent.updateNarrativeState).mockReturnValue(updatedProject as any);

          await workerService.processJob('job-video-1');
          
          // Verify renderVideo was called
          expect(vi.mocked(mockMediaProcessingAgent.renderVideo)).toHaveBeenCalled();
          
          // Verify saveAssets was called for render_video
          // createSaveAssetsCallback calls createVersionedAssets
          // We expect createVersionedAssets to be called with 'render_video'
          expect(vi.mocked(mockAssetManager.createVersionedAssets)).toHaveBeenCalledWith(
              expect.objectContaining({ projectId: 'proj-1' }),
              ['render_video'],
              'video',
              expect.any(Array),
              expect.any(Array),
              true
          );
      });
  });

  describe('polymorphic asset key patterns', () => {
    it('should correctly map asset keys using nullish coalescing', () => {
      // Test the specific pattern: assetKeys[index] ?? assetKeys[0]
      const testCases = [
        {
          assetKeys: ['scene_start_frame', 'scene_end_frame'],
          expectedMappings: ['scene_start_frame', 'scene_end_frame']
        },
        {
          assetKeys: ['character_image'],
          expectedMappings: ['character_image', 'character_image', 'character_image']
        },
        {
          assetKeys: ['storyboard'],
          expectedMappings: ['storyboard']
        }
      ];

      testCases.forEach(({ assetKeys, expectedMappings }) => {
        expectedMappings.forEach((expected, index) => {
          const actual = assetKeys[index] ?? assetKeys[0];
          expect(actual).toBe(expected);
        });
      });
    });
  });
});
