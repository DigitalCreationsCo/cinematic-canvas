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
    it('inserts new node when idxVersionCurrent is 1 and row does not exist', async () => {
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
      };
      txMock.returning.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'test-id' }]);
      (db.transaction as any).mockImplementationOnce(async (fn: Function) => fn(txMock));

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

      const result = await upsertBatchCanvasLayouts(nodes);
      expect(result['node-new']).toBe(2);
      expect(txMock.insert).toHaveBeenCalled();
    });

    it('updates existing node when idxVersionCurrent is 1 and row exists with version 1', async () => {
      const insertSpy = vi.fn().mockReturnThis();
      const valuesSpy = vi.fn().mockReturnThis();
      const returningSpy = vi.fn().mockResolvedValue([{ id: 'test-id' }]);
      
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
        insert: insertSpy,
        values: valuesSpy,
      };
      (db.transaction as any).mockImplementationOnce(async (fn: Function) => fn(txMock));

      const nodes = [
        {
          idContextTarget: 'proj-1',
          contextTypeTarget: 'project' as const,
          idEntityTarget: 'node-exists',
          nodeTypeTarget: 'scene',
          valPosXTarget: 150,
          valPosYTarget: 150,
          idxVersionCurrent: 1,
        }
      ];

      const result = await upsertBatchCanvasLayouts(nodes);
      expect(result['node-exists']).toBe(2);
      expect(txMock.update).toHaveBeenCalled();
      expect(insertSpy).not.toHaveBeenCalled();
    });

    it('updates existing node when versions match (idxVersionCurrent > 1)', async () => {
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
      };
      (db.transaction as any).mockImplementationOnce(async (fn: Function) => fn(txMock));

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

      const result = await upsertBatchCanvasLayouts(nodes);
      expect(result['node-1']).toBe(6);
      expect(txMock.update).toHaveBeenCalled();
    });

    it('throws OCC conflict when client version is stale (idxVersionCurrent > 1)', async () => {
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
      };
      (db.transaction as any).mockImplementationOnce(async (fn: Function) => fn(txMock));

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
