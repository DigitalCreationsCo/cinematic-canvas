import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertBatchCanvasLayouts } from '../canvasLayoutService.js';
import { db } from '../../db/index.js';

vi.mock('../../db/index.js', () => ({
  db: {
    transaction: vi.fn(async (fn) => fn({
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
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
    it('inserts new node when row does not exist', async () => {
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn()
          .mockResolvedValueOnce([]) // UPDATE returns 0 rows
          .mockResolvedValueOnce([{ id: 'new-id' }]), // INSERT returns the new row
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]), // SELECT returns 0 rows (row doesn't exist)
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
      };
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
      expect(txMock.update).toHaveBeenCalled();
      expect(txMock.select).toHaveBeenCalled();
      expect(txMock.insert).toHaveBeenCalled();
    });

    it('updates existing node when versions match', async () => {
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
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
          idxVersionCurrent: 5,
        }
      ];

      const result = await upsertBatchCanvasLayouts(nodes);
      expect(result['node-exists']).toBe(6);
      expect(txMock.update).toHaveBeenCalled();
      expect(txMock.select).not.toHaveBeenCalled();
      expect(txMock.insert).not.toHaveBeenCalled();
    });

    it('throws OCC conflict when client version is stale (row exists with different version)', async () => {
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ idxVersion: 6 }]),
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

      await expect(upsertBatchCanvasLayouts(nodes)).rejects.toThrow(/OCC conflict for entity: node-stale/);
    });

    it('throws OCC conflict when client has version 1 but row exists with higher version', async () => {
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ idxVersion: 3 }]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
      };
      (db.transaction as any).mockImplementationOnce(async (fn: Function) => fn(txMock));

      const nodes = [
        {
          idContextTarget: 'proj-1',
          contextTypeTarget: 'project' as const,
          idEntityTarget: 'node-version-1-stale',
          nodeTypeTarget: 'scene',
          valPosXTarget: 400,
          valPosYTarget: 400,
          idxVersionCurrent: 1,
        }
      ];

      await expect(upsertBatchCanvasLayouts(nodes)).rejects.toThrow(/OCC conflict for entity: node-version-1-stale/);
      expect(txMock.insert).not.toHaveBeenCalled();
    });

    it('handles multiple nodes - first succeeds, second gets OCC conflict', async () => {
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn()
          .mockResolvedValueOnce([{ id: 'node-1' }]) // First UPDATE succeeds
          .mockResolvedValueOnce([]), // Second UPDATE returns 0 rows
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ idxVersion: 5 }]), // Row exists with version 5
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
      };
      (db.transaction as any).mockImplementationOnce(async (fn: Function) => fn(txMock));

      const nodes = [
        {
          idContextTarget: 'proj-1',
          contextTypeTarget: 'project' as const,
          idEntityTarget: 'node-1',
          nodeTypeTarget: 'scene',
          valPosXTarget: 100,
          valPosYTarget: 100,
          idxVersionCurrent: 5,
        },
        {
          idContextTarget: 'proj-1',
          contextTypeTarget: 'project' as const,
          idEntityTarget: 'node-2',
          nodeTypeTarget: 'scene',
          valPosXTarget: 200,
          valPosYTarget: 200,
          idxVersionCurrent: 4,
        },
      ];

      await expect(upsertBatchCanvasLayouts(nodes)).rejects.toThrow(/OCC conflict/);
      expect(txMock.update).toHaveBeenCalledTimes(2);
    });

    it('returns empty object for empty input', async () => {
      const result = await upsertBatchCanvasLayouts([]);
      expect(result).toEqual({});
    });

    it('skips processing when input is empty array', async () => {
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
      };
      (db.transaction as any).mockImplementationOnce(async (fn: Function) => fn(txMock));

      await upsertBatchCanvasLayouts([]);
      expect(txMock.update).not.toHaveBeenCalled();
    });
  });
});
