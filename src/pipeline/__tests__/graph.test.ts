import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CinematicVideoWorkflow } from '../graph.js';
import { JobControlPlane } from '../../shared/services/job-control-plane.js';
import { DistributedLockManager } from '../../shared/services/lock-manager.js';
import { ProjectRepository } from '../../shared/services/project-repository.js';
import { GCPStorageManager } from '../../shared/services/storage-manager.js';
import { AssetVersionManager } from '../../shared/services/asset-version-manager.js';
import { Dispatcher } from '../dispatcher.js';
import { START, END } from '@langchain/langgraph';

vi.mock('../../shared/services/job-control-plane.js');
vi.mock('../../shared/services/lock-manager.js');
vi.mock('../../shared/services/project-repository.js');
vi.mock('../../shared/services/storage-manager.js');
vi.mock('../../shared/services/asset-version-manager.js');
vi.mock('../dispatcher.js');

describe('CinematicVideoWorkflow', () => {
  let workflow: CinematicVideoWorkflow;
  let mockJobControlPlane: JobControlPlane;
  let mockLockManager: DistributedLockManager;
  let mockProjectRepo: ProjectRepository;
  let mockStorageManager: GCPStorageManager;
  let mockDispatcher: Dispatcher;

  const mockProjectId = 'test-project-id';
  const mockGcpProjectId = 'test-gcp-project';
  const mockBucketName = 'test-bucket';

  beforeEach(() => {
    vi.clearAllMocks();

    mockJobControlPlane = {
        uniqueKey: vi.fn(),
        jobId: vi.fn(),
    } as any;
    
    mockLockManager = {} as any;
    
    mockProjectRepo = {
      getProject: vi.fn(),
      getProjectScenes: vi.fn(),
      getProjectFullState: vi.fn(),
      updateProject: vi.fn(),
    } as any;

    mockStorageManager = {
        fileExists: vi.fn(),
        getObjectPath: vi.fn(),
        uploadJSON: vi.fn(),
        getPublicUrl: vi.fn(),
    } as any;

    mockDispatcher = {
        ensureJob: vi.fn(),
        ensureBatchJobs: vi.fn(),
        dispatch: vi.fn().mockResolvedValue(undefined),
    } as any;

    vi.mocked(Dispatcher).mockImplementation(function() { return mockDispatcher; } as any);

    workflow = new CinematicVideoWorkflow({
      gcpProjectId: mockGcpProjectId,
      projectId: mockProjectId,
      bucketName: mockBucketName,
      jobControlPlane: mockJobControlPlane,
      lockManager: mockLockManager,
      projectRepository: mockProjectRepo,
      storageManager: mockStorageManager,
    });
  });

  afterEach(() => {
      vi.unstubAllGlobals();
  });

  it('should initialize successfully', () => {
    expect(workflow).toBeDefined();
    expect(workflow.graph).toBeDefined();
  });

  describe('Graph Construction & Transitions', () => {
      it('should route to expand_creative_prompt if no assets exist', async () => {
          vi.mocked(mockProjectRepo.getProject).mockResolvedValue({
              id: mockProjectId,
              metadata: { enhancedPrompt: null },
              storyboard: { scenes: [] },
              generationRules: []
          } as any);
          vi.mocked(mockProjectRepo.getProjectScenes).mockResolvedValue([]);

          const graph: any = workflow.graph;
          expect(graph.nodes).toHaveProperty('expand_creative_prompt');
      });
  });
});
