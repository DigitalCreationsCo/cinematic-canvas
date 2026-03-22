import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertBatchCanvasLayouts } from '../canvasLayoutService.js';
import { db } from '../../db/index.js';

vi.mock('../../db/index.js', () => ({
  db: {
    transaction: vi.fn(async (fn) => fn({
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
    })),
  }
}));

describe('canvasLayoutService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upsertBatchCanvasLayouts', () => {
    it('inserts new node when idxVersionCurrent is 1', async () => {
      const nodes = [
        {
          idContextTarget: 'proj-1',
          contextTypeTarget: 'project' as const,
          idEntityTarget: 'node-new',
          nodeTypeTarget: 'scene',
          valPosXTarget: 100,
          valPosYTarget: 100,
          idxVersionCurrent: 1,
        }
      ];

      await expect(upsertBatchCanvasLayouts(nodes)).resolves.not.toThrow();
      expect(db.transaction).toHaveBeenCalled();
    });

    it('updates existing node when versions match', async () => {
      const nodes = [
        {
          idContextTarget: 'proj-1',
          contextTypeTarget: 'project' as const,
          idEntityTarget: 'node-1',
          nodeTypeTarget: 'scene',
          valPosXTarget: 200,
          valPosYTarget: 200,
          idxVersionCurrent: 5,
        }
      ];

      await expect(upsertBatchCanvasLayouts(nodes)).resolves.not.toThrow();
      expect(db.transaction).toHaveBeenCalled();
    });

    it('throws OCC conflict when client version is stale', async () => {
      (db.transaction as any).mockImplementationOnce(async (fn: Function) => fn({
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      }));

      const nodes = [
        {
          idContextTarget: 'proj-1',
          contextTypeTarget: 'project' as const,
          idEntityTarget: 'node-stale',
          nodeTypeTarget: 'scene',
          valPosXTarget: 300,
          valPosYTarget: 300,
          idxVersionCurrent: 4,
        }
      ];

      await expect(upsertBatchCanvasLayouts(nodes)).rejects.toThrow(/OCC conflict/);
    });
  });
});
