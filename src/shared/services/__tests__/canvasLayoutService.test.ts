import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertBatchCanvasLayouts, OCCConflictError } from '../canvasLayoutService.js';
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
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'new-id' }]),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
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

    it('throws OCCConflictError when client version is stale', async () => {
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

      await expect(upsertBatchCanvasLayouts(nodes)).rejects.toThrow(/node-stale/);
      expect(txMock.update).toHaveBeenCalled();
      expect(txMock.select).toHaveBeenCalled();
    });

    it('throws OCCConflictError with correct version info', async () => {
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

      try {
        await upsertBatchCanvasLayouts(nodes);
        throw new Error('Should have thrown OCCConflictError');
      } catch (error) {
        expect(error).toBeInstanceOf(OCCConflictError);
        expect((error as OCCConflictError).entityId).toBe('node-version-1-stale');
        expect((error as OCCConflictError).clientVersion).toBe(1);
        expect((error as OCCConflictError).serverVersion).toBe(3);
      }
    });

    it('returns empty object for empty input', async () => {
      const result = await upsertBatchCanvasLayouts([]);
      expect(result).toEqual({});
    });
  });
});
