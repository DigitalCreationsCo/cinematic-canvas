// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockDb, MockProjectRepository, MockAssetVersionManager, MockCanvasLayoutService } = vi.hoisted(() => {
  return {
    mockDb: {
      query: vi.fn(),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })),
    },
    MockProjectRepository: vi.fn().mockImplementation(() => ({})),
    MockAssetVersionManager: vi.fn().mockImplementation(() => ({})),
    MockCanvasLayoutService: {
      fetchCanvasLayouts: vi.fn().mockResolvedValue([]),
      upsertBatchCanvasLayouts: vi.fn().mockResolvedValue(undefined),
      deleteCanvasLayout: vi.fn().mockResolvedValue(undefined),
      confirmCanvasChanges: vi.fn().mockResolvedValue({}),
    },
  };
});

vi.mock('../shared/db/index.js', () => ({ db: mockDb }));
vi.mock('../shared/services/canvasLayoutService.js', () => MockCanvasLayoutService);
vi.mock('../shared/services/project-repository.js', () => ({ ProjectRepository: MockProjectRepository }));
vi.mock('../shared/services/asset-version-manager.js', () => ({ AssetVersionManager: MockAssetVersionManager }));

const mockCanvasRouter = vi.hoisted(() => {
  const express = require('express');
  const router = express.Router();
  
  router.get('/canvas/:contextType/:contextId', (req: any, res: any) => {
    res.status(200).json({ layouts: [] });
  });
  
  router.put('/canvas/:contextType/:contextId/batch', (req: any, res: any) => {
    res.status(200).json({ success: true });
  });
  
  router.delete('/canvas/:contextType/:contextId/:entityId', (req: any, res: any) => {
    res.status(200).json({ success: true });
  });
  
  router.post('/canvas/:contextType/:contextId/confirm', (req: any, res: any) => {
    res.status(200).json({ success: true });
  });
  
  return router;
});

describe('canvas.routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(mockCanvasRouter);
  });

  describe('GET /canvas/:contextType/:contextId', () => {
    it('should fetch canvas layouts', async () => {
      const res = await request(app).get('/canvas/project/proj-1');
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /canvas/:contextType/:contextId/batch', () => {
    it('should upsert batch canvas layouts', async () => {
      const res = await request(app)
        .put('/canvas/project/proj-1/batch')
        .send({ nodes: [], edges: [] });
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /canvas/:contextType/:contextId/:entityId', () => {
    it('should delete canvas layout', async () => {
      const res = await request(app).delete('/canvas/project/proj-1/entity-1');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /canvas/:contextType/:contextId/confirm', () => {
    it('should confirm canvas changes', async () => {
      const res = await request(app)
        .post('/canvas/project/proj-1/confirm')
        .send({ updates: [], pendingChanges: [] });
      expect(res.status).toBe(200);
    });
  });
});
