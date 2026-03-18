// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import canvasRouter from './canvas.routes.js';
import { api } from './api-routes.js';

const { mockDb, MockProjectRepository, MockAssetVersionManager, MockCanvasLayoutService, MockUsersAndTeamsDbService, MockSacGitService, createVersionedAssets, getBestVersion } = vi.hoisted(() => {
  const createVersionedAssets = vi.fn().mockResolvedValue([ { id: 'history-1' } ]);
  const getAssetRegistryForEntity = vi.fn().mockResolvedValue([]);
  const getBestVersion = vi.fn().mockResolvedValue([{ data: 'gs://best-version' }]);
  return {
    createVersionedAssets,
    getBestVersion,
    mockDb: {
      query: vi.fn(),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })),
    },
    MockProjectRepository: class {},
    MockAssetVersionManager: class {
      createVersionedAssets = createVersionedAssets;
      getAssetRegistryForEntity = getAssetRegistryForEntity;
      getBestVersion = getBestVersion;
    },
    MockCanvasLayoutService: {
      fetchCanvasLayouts: vi.fn().mockResolvedValue([]),
      upsertBatchCanvasLayouts: vi.fn().mockResolvedValue(undefined),
      deleteCanvasLayout: vi.fn().mockResolvedValue(undefined),
      confirmCanvasChanges: vi.fn().mockResolvedValue({}),
    },
    MockUsersAndTeamsDbService: {
      usersAndTeamsDbService: {
        patchEntities: vi.fn().mockResolvedValue([]),
        createEntities: vi.fn().mockResolvedValue([]),
        getWorldAccessGrant: vi.fn().mockResolvedValue({ role: 'admin' }),
        getTeams: vi.fn().mockResolvedValue([]),
        updateWorldSacRepo: vi.fn().mockResolvedValue(true),
      }
    },
    MockSacGitService: {
      getSacGitService: vi.fn().mockReturnValue({
        createRepo: vi.fn().mockResolvedValue({ id: 'repo-1' }),
        forkProject: vi.fn().mockResolvedValue({ id: 'repo-2' }),
        commitLedger: vi.fn().mockResolvedValue({ commitId: 'commit-1' }),
        listCommits: vi.fn().mockResolvedValue([])
      })
    }
  };
});

vi.mock('../shared/db/index.js', () => ({ db: mockDb }));
vi.mock('../../shared/services/canvasLayoutService.js', () => MockCanvasLayoutService);
vi.mock('../../shared/services/project-repository.js', () => ({ ProjectRepository: MockProjectRepository }));
vi.mock('../../shared/services/asset-version-manager.js', () => ({ AssetVersionManager: MockAssetVersionManager }));
vi.mock('../../shared/services/usersAndTeamsDbService.js', () => MockUsersAndTeamsDbService);
vi.mock('../../shared/services/sac/SacGitServiceStub.js', () => MockSacGitService);
vi.mock('../middleware/auth.js', () => ({ requireAuth: (req: any, res: any, next: any) => { req.user = { id: 'test-user', email: 'test@example.com' }; next(); } }));

describe('canvas.routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api', canvasRouter);
  });

  describe('GET /api/canvas/:contextType/:contextId', () => {
    it('should fetch canvas layouts', async () => {
      const res = await request(app).get('/api/canvas/project/proj-1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
    
    it('should handle fetch error', async () => {
      MockCanvasLayoutService.fetchCanvasLayouts.mockRejectedValueOnce(new Error('Fetch failed'));
      const res = await request(app).get('/api/canvas/project/proj-1');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch canvas layouts");
    });
  });

  describe('PUT /api/canvas/:contextType/:contextId/batch', () => {
    it('should upsert batch canvas layouts', async () => {
      const res = await request(app)
        .put('/api/canvas/project/proj-1/batch')
        .send({ nodes: [], edges: [] });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
    
    it('should handle validation error', async () => {
      const res = await request(app)
        .put('/api/canvas/project/proj-1/batch')
        .send({});
      expect(res.status).toBe(200);
    });
    
    it('should handle OCC conflict error', async () => {
      const occError = new Error('OCC conflict');
      (occError as any).code = 'OCC_CONFLICT';
      MockCanvasLayoutService.upsertBatchCanvasLayouts.mockRejectedValueOnce(occError);
      
      const res = await request(app)
        .put('/api/canvas/project/proj-1/batch')
        .send({ nodes: [], edges: [] });
      expect(res.status).toBe(409);
    });
    
    it('should handle upsert error', async () => {
      MockCanvasLayoutService.upsertBatchCanvasLayouts.mockRejectedValueOnce(new Error('Upsert failed'));
      
      const res = await request(app)
        .put('/api/canvas/project/proj-1/batch')
        .send({ nodes: [], edges: [] });
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /api/canvas/:contextType/:contextId/:entityId', () => {
    it('should delete canvas layout', async () => {
      const res = await request(app).delete('/api/canvas/project/proj-1/entity-1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
    
    it('should handle delete error', async () => {
      MockCanvasLayoutService.deleteCanvasLayout.mockRejectedValueOnce(new Error('Delete failed'));
      const res = await request(app).delete('/api/canvas/project/proj-1/entity-1');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to delete canvas layout");
    });
  });

  describe('POST /api/canvas/confirm-changes', () => {
    it('should confirm canvas changes', async () => {
      const res = await request(app)
        .post('/api/canvas/confirm-changes')
        .send({ projectId: 'proj-1', updates: [], pendingChanges: [] });
      expect(res.status).toBe(200);
    });
    
    it('should handle validation error for confirm', async () => {
      const res = await request(app)
        .post('/api/canvas/confirm-changes')
        .send({}); // missing required
      expect(res.status).toBe(400);
    });
    
    it('should handle confirm error', async () => {
      MockCanvasLayoutService.confirmCanvasChanges.mockRejectedValueOnce(new Error('Confirm failed'));
      const res = await request(app)
        .post('/api/canvas/confirm-changes')
        .send({ projectId: 'proj-1', updates: [], pendingChanges: [] });
      expect(res.status).toBe(500);
    });
  });
  
  describe('GET /api/worlds/:worldId/access', () => {
    it('should get world access', async () => {
      const res = await request(app).get('/api/worlds/world-1/access');
      expect(res.status).toBe(200);
    });
    
    it('should return default role when no explicit grant found', async () => {
      MockUsersAndTeamsDbService.usersAndTeamsDbService.getWorldAccessGrant = vi.fn().mockResolvedValueOnce(null);
      const res = await request(app).get('/api/worlds/world-1/access');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ role: 'owner', licenseType: 'base_ledger' });
    });
    
    it('should handle error getting world access', async () => {
      MockUsersAndTeamsDbService.usersAndTeamsDbService.getWorldAccessGrant = vi.fn().mockRejectedValueOnce(new Error('Failed'));
      const res = await request(app).get('/api/worlds/world-1/access');
      expect(res.status).toBe(500);
    });
  });
  
  describe('POST /api/sac/worlds/:worldId/repo', () => {
    it('should create repo', async () => {
      MockSacGitService.getSacGitService().createRepo.mockResolvedValueOnce({ repoId: 'repo-1', repoUrl: 'http://test' });
      const res = await request(app).post('/api/sac/worlds/world-1/repo').send();
      expect(res.status).toBe(201);
    });
    
    it('should handle error creating repo', async () => {
      MockSacGitService.getSacGitService().createRepo.mockRejectedValueOnce(new Error('Failed'));
      const res = await request(app).post('/api/sac/worlds/world-1/repo').send();
      expect(res.status).toBe(500);
    });
  });
  
  describe('POST /api/sac/projects/:projectId/fork', () => {
    it('should fork project', async () => {
      MockSacGitService.getSacGitService().forkRepo = vi.fn().mockResolvedValueOnce({ repoId: 'repo-2' });
      const res = await request(app).post('/api/sac/projects/proj-1/fork').send({ worldId: 'world-1' });
      expect(res.status).toBe(201);
    });
    
    it('should handle missing params', async () => {
      const res = await request(app).post('/api/sac/projects/proj-1/fork').send({});
      expect(res.status).toBe(400);
    });
    
    it('should handle fork error', async () => {
      MockSacGitService.getSacGitService().forkRepo = vi.fn().mockRejectedValueOnce(new Error('Failed'));
      const res = await request(app).post('/api/sac/projects/proj-1/fork').send({ worldId: 'world-1' });
      expect(res.status).toBe(500);
    });
  });
  
  describe('POST /api/sac/repos/:repoId/commit', () => {
    it('should commit ledger', async () => {
      MockSacGitService.getSacGitService().commitLedger.mockResolvedValueOnce({ commitId: 'commit-1' });
      const res = await request(app).post('/api/sac/repos/repo-1/commit').send({ ledger: {}, message: 'test' });
      expect(res.status).toBe(201);
    });
    
    it('should handle commit error', async () => {
      MockSacGitService.getSacGitService().commitLedger.mockRejectedValueOnce(new Error('Failed'));
      const res = await request(app).post('/api/sac/repos/repo-1/commit').send({ message: 'test' });
      expect(res.status).toBe(500);
    });
  });
  
  describe('GET /api/sac/repos/:repoId/commits', () => {
    it('should list commits', async () => {
      const res = await request(app).get('/api/sac/repos/repo-1/commits');
      expect(res.status).toBe(200);
    });
    
    it('should handle error listing commits', async () => {
      MockSacGitService.getSacGitService().listCommits.mockRejectedValueOnce(new Error('Failed'));
      const res = await request(app).get('/api/sac/repos/repo-1/commits');
      expect(res.status).toBe(500);
    });
  });
  
  describe('POST /api/scenes/:sceneId/frame-input', () => {
    it('should link frame to scene', async () => {
      mockDb.select.mockImplementationOnce(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ id: 'img-1', data: 'gs://test' }]) })) })) }));
      const res = await request(app).post('/api/scenes/scene-1/frame-input').send({ projectId: 'proj-1', sourceEntityId: 'img-1', sourceType: 'image' });
      expect(res.status).toBe(201);
    });
    
    it('should link frame using scene source type', async () => {
      getBestVersion.mockResolvedValueOnce([{ data: 'gs://scene-frame' }]);
      const res = await request(app).post('/api/scenes/scene-1/frame-input').send({ projectId: 'proj-1', sourceEntityId: 'scene-src', sourceType: 'scene' });
      expect(res.status).toBe(201);
    });
    
    it('should return 422 when source has no valid output frame', async () => {
      getBestVersion.mockResolvedValueOnce([]);
      const res = await request(app).post('/api/scenes/scene-1/frame-input').send({ projectId: 'proj-1', sourceEntityId: 'scene-src', sourceType: 'scene' });
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('does not have a valid output frame');
    });
    
    it('should handle missing params', async () => {
      const res = await request(app).post('/api/scenes/scene-1/frame-input').send({});
      expect(res.status).toBe(400);
    });
    
    it('should handle link error', async () => {
      createVersionedAssets.mockRejectedValueOnce(new Error('Failed'));
      
      mockDb.select.mockImplementationOnce(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ id: 'img-1', data: 'gs://test' }]) })) })) }));
      const res = await request(app).post('/api/scenes/scene-1/frame-input').send({ projectId: 'proj-1', sourceEntityId: 'img-1', sourceType: 'image' });
      expect(res.status).toBe(500);
    });
  });
});
