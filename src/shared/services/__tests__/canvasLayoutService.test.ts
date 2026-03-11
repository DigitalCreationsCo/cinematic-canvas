import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertBatchCanvasLayouts } from '../canvasLayoutService.js';
import { db } from '../db/index.js';

vi.mock('../db/index.js', () => ({
  db: {
    transaction: vi.fn(),
    query: {
      canvasNodeLayouts: {
        findMany: vi.fn()
      }
    }
  }
}));

describe('canvasLayoutService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upsertBatchCanvasLayouts', () => {
    it('throws OCC conflict if client version does not match DB version', async () => {
      // Mock db records with version = 5
      (db.query.canvasNodeLayouts.findMany as any).mockResolvedValueOnce([
        { entityId: 'node-1', idxVersion: 5 }
      ]);

      const updates = [
        {
          entityId: 'node-1',
          contextId: 'proj-1',
          contextType: 'project',
          type: 'scene',
          positionX: 100,
          positionY: 100,
          idxVersion: 4 // Client is stale
        }
      ];

      await expect(upsertBatchCanvasLayouts(updates)).rejects.toThrow(/OCC conflict/);
    });

    it('executes transaction successfully if versions match or no prior version exists', async () => {
      (db.query.canvasNodeLayouts.findMany as any).mockResolvedValueOnce([
        { entityId: 'node-1', idxVersion: 5 }
      ]);
      (db.transaction as any).mockResolvedValueOnce(true);

      const updates = [
        {
          entityId: 'node-1', // Match version
          contextId: 'proj-1',
          contextType: 'project',
          type: 'scene',
          positionX: 100,
          positionY: 100,
          idxVersion: 5
        },
        {
          entityId: 'node-2', // New record
          contextId: 'proj-1',
          contextType: 'project',
          type: 'scene',
          positionX: 200,
          positionY: 200,
          idxVersion: 0
        }
      ];

      await expect(upsertBatchCanvasLayouts(updates)).resolves.not.toThrow();
      expect(db.transaction).toHaveBeenCalled();
    });
  });
});
