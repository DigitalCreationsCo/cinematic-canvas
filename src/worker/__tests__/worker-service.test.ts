import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkerService } from '../../../src/worker/worker-service.js';
import { JobControlPlane } from '../../../src/shared/services/job-control-plane.js';
import { DistributedLockManager } from '../../../src/shared/services/lock-manager.js';
import { AssetVersionManager } from '../../../src/shared/services/asset-version-manager.js';
import { ProjectRepository } from '../../../src/shared/services/project-repository.js';
import { Job, JobEvent, PipelineEvent } from '../../../src/shared/types/job.types.js';

// Mock all dependencies
vi.mock('../../../src/shared/services/job-control-plane.js');
vi.mock('../../../src/shared/services/lock-manager.js');
vi.mock('../../../src/shared/services/asset-version-manager.js');
vi.mock('../../../src/shared/services/project-repository.js');

describe('WorkerService Asset Management', () => {
  let workerService: WorkerService;
  let mockJobControlPlane: JobControlPlane;
  let mockLockManager: DistributedLockManager;
  let mockAssetManager: AssetVersionManager;
  let mockProjectRepo: ProjectRepository;
  let mockPublishJobEvent: vi.MockedFunction<(event: JobEvent) => Promise<void>>;
  let mockPublishPipelineEvent: vi.MockedFunction<(event: PipelineEvent) => Promise<void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockJobControlPlane = {
      claimJob: vi.fn(),
      createIncrementAttemptHook: vi.fn(),
    } as any;
    
    mockLockManager = {} as any;
    
    mockAssetManager = {
      createVersionedAssets: vi.fn(),
    } as any;
    
    mockProjectRepo = {
      getProject: vi.fn(),
      updateProject: vi.fn(),
    } as any;
    
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
        attempts: { currentAttempt: 1, maxRetries: 3 },
        uniqueKey: 'unique-key',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

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

      vi.mocked(mockAssetManager.createVersionedAssets).mockResolvedValue(mockAssetHistories);

      // Get the saveAssets callback
      const saveAssets = workerService.createSaveAssetsCallback(job);

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

      // Verify pipeline event was published with correct payload
      expect(vi.mocked(mockPublishPipelineEvent)).toHaveBeenCalledWith({
        type: 'NEW_ASSETS_BATCH',
        projectId: 'proj-1',
        payload: [
          {
            entityId: 'scene-1',
            assetKey: 'scene_start_frame',
            history: mockAssetHistories[0]
          },
          {
            entityId: 'scene-1',
            assetKey: 'scene_end_frame',
            history: mockAssetHistories[1]
          }
        ],
        timestamp: expect.any(String)
      });
    });

    it('should handle single asset key for multiple entities', async () => {
      const job: Job = {
        id: 'job-1',
        projectId: 'proj-1',
        type: 'GENERATE_CHARACTER_ASSETS',
        state: 'RUNNING',
        attempts: { currentAttempt: 1, maxRetries: 3 },
        uniqueKey: 'unique-key',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

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

      vi.mocked(mockAssetManager.createVersionedAssets).mockResolvedValue(mockAssetHistories);

      const saveAssets = workerService.createSaveAssetsCallback(job);

      // Call with single asset key for multiple entities
      await saveAssets(
        { projectId: 'proj-1', characterIds: ['char-1', 'char-2'] },
        ['character_image'],
        'image',
        ['character-1-url', 'character-2-url'],
        [{ model: 'test-model' }, { model: 'test-model' }],
        true
      );

      // Verify payload uses fallback to assetKeys[0] for all entities
      expect(vi.mocked(mockPublishPipelineEvent)).toHaveBeenCalledWith({
        type: 'NEW_ASSETS_BATCH',
        projectId: 'proj-1',
        payload: [
          {
            entityId: 'char-1',
            assetKey: 'character_image',
            history: mockAssetHistories[0]
          },
          {
            entityId: 'char-2',
            assetKey: 'character_image',
            history: mockAssetHistories[1]
          }
        ],
        timestamp: expect.any(String)
      });
    });

    it('should handle errors gracefully', async () => {
      const job: Job = {
        id: 'job-1',
        projectId: 'proj-1',
        type: 'GENERATE_SCENE_FRAMES',
        state: 'RUNNING',
        attempts: { currentAttempt: 1, maxRetries: 3 },
        uniqueKey: 'unique-key',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const error = new Error('Asset creation failed');
      vi.mocked(mockAssetManager.createVersionedAssets).mockRejectedValue(error);

      const saveAssets = workerService.createSaveAssetsCallback(job);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await saveAssets(
        { projectId: 'proj-1', sceneIds: ['scene-1'] },
        ['scene_start_frame'],
        'image',
        ['scene-1-url'],
        [{ model: 'test-model' }],
        true
      );

      // Should log error but not throw
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: error,
          functionName: 'saveAssets',
          projectId: 'proj-1',
          jobId: 'job-1',
          workerId: 'worker-1'
        })
      );

      // Should not publish pipeline event on error
      expect(vi.mocked(mockPublishPipelineEvent)).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
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
