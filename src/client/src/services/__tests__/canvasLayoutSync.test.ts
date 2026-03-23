import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { 
  fetchCanvasLayouts, 
  upsertCanvasLayouts, 
  deleteCanvasLayout,
  OCCConflictError,
  type LayoutNodeInput 
} from '../canvasLayoutSync.js';

describe('canvasLayoutSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchCanvasLayouts', () => {
    it('should fetch layouts for a context', async () => {
      const { supabase } = await import('../../lib/supabase.js');
      
      const mockData = [
        {
          id_entity: 'entity-1',
          node_type: 'scene',
          val_pos_x: 100,
          val_pos_y: 200,
          val_width: 300,
          val_height: 400,
          json_ui_metadata: { collapsed: true },
          idx_version: 5,
        },
      ];

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      } as any);

      const result = await fetchCanvasLayouts('project-123');

      expect(supabase.from).toHaveBeenCalledWith('canvas_node_layouts');
      expect(result).toHaveLength(1);
      expect(result[0].idEntity).toBe('entity-1');
      expect(result[0].nodeType).toBe('scene');
      expect(result[0].valPosX).toBe(100);
      expect(result[0].valPosY).toBe(200);
      expect(result[0].idxVersion).toBe(5);
    });

    it('should return empty array when no layouts exist', async () => {
      const { supabase } = await import('../../lib/supabase.js');
      
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any);

      const result = await fetchCanvasLayouts('project-empty');

      expect(result).toHaveLength(0);
    });

    it('should throw error when fetch fails', async () => {
      const { supabase } = await import('../../lib/supabase.js');
      
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'Fetch failed' } }),
      } as any);

      await expect(fetchCanvasLayouts('project-123')).rejects.toThrow('Fetch failed');
    });

    it('should handle null data gracefully', async () => {
      const { supabase } = await import('../../lib/supabase.js');
      
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as any);

      const result = await fetchCanvasLayouts('project-123');

      expect(result).toEqual([]);
    });
  });

  describe('upsertCanvasLayouts', () => {
    const createMockNode = (overrides = {}): LayoutNodeInput => ({
      idContextTarget: 'project-123',
      contextTypeTarget: 'project',
      idEntityTarget: 'entity-1',
      nodeTypeTarget: 'scene',
      valPosXTarget: 100,
      valPosYTarget: 200,
      valWidthTarget: 300,
      valHeightTarget: 400,
      jsonUiMetadata: { collapsed: false },
      idxVersionCurrent: 1,
      ...overrides,
    });

    it('should return success with empty versions for empty input', async () => {
      const result = await upsertCanvasLayouts([]);

      expect(result).toEqual({ success: true, newVersions: {} });
      
      const { supabase } = await import('../../lib/supabase.js');
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('should update existing row when version matches', async () => {
      const { supabase } = await import('../../lib/supabase.js');
      const node = createMockNode({ idxVersionCurrent: 5 });

      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { idx_version: 6 },
          error: null,
        }),
      } as any);

      const result = await upsertCanvasLayouts([node]);

      expect(result.success).toBe(true);
      expect(result.newVersions['entity-1']).toBe(6);
    });

    it('should collect errors when update fails', async () => {
      const { supabase } = await import('../../lib/supabase.js');
      const node = createMockNode({ idxVersionCurrent: 5 });

      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Update failed' },
        }),
      } as any);

      const result = await upsertCanvasLayouts([node]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Update failed');
    });

    it('should throw OCCConflictError when version mismatch', async () => {
      const { supabase } = await import('../../lib/supabase.js');
      const node = createMockNode({ idxVersionCurrent: 5 });

      vi.mocked(supabase.from)
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { idx_version: 7 },
            error: null,
          }),
        } as any);

      await expect(upsertCanvasLayouts([node])).rejects.toThrow(OCCConflictError);
    });

    it('should insert new row when it does not exist', async () => {
      const { supabase } = await import('../../lib/supabase.js');
      const node = createMockNode();

      vi.mocked(supabase.from)
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any)
        .mockReturnValueOnce({
          insert: vi.fn().mockResolvedValue({ error: null }),
        } as any);

      const result = await upsertCanvasLayouts([node]);

      expect(result.success).toBe(true);
    });

    it('should collect errors when insert fails with non-constraint error', async () => {
      const { supabase } = await import('../../lib/supabase.js');
      const node = createMockNode();

      vi.mocked(supabase.from)
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any)
        .mockReturnValueOnce({
          insert: vi.fn().mockResolvedValue({ 
            error: { code: 'OTHER_ERROR', message: 'Insert failed' } 
          }),
        } as any);

      const result = await upsertCanvasLayouts([node]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insert failed');
    });

    it('should throw OCCConflictError on unique constraint violation', async () => {
      const { supabase } = await import('../../lib/supabase.js');
      const node = createMockNode({ idxVersionCurrent: 1 });

      vi.mocked(supabase.from)
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any)
        .mockReturnValueOnce({
          insert: vi.fn().mockResolvedValue({ 
            error: { code: '23505', message: 'Unique violation' } 
          }),
        } as any);

      await expect(upsertCanvasLayouts([node])).rejects.toThrow(OCCConflictError);
    });
  });

  describe('deleteCanvasLayout', () => {
    it('should delete layout for entity', async () => {
      const { supabase } = await import('../../lib/supabase.js');

      const mockEq = vi.fn().mockReturnThis();
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({
        delete: mockDelete,
      } as any);

      await deleteCanvasLayout('project-123', 'entity-456');

      expect(supabase.from).toHaveBeenCalledWith('canvas_node_layouts');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith('id_context', 'project-123');
      expect(mockEq).toHaveBeenCalledWith('id_entity', 'entity-456');
    });

    it('should throw error when delete fails', async () => {
      const { supabase } = await import('../../lib/supabase.js');

      const errorResult = { error: { message: 'Delete failed' } };
      const secondEq = vi.fn().mockResolvedValue(errorResult);
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      const mockDelete = vi.fn().mockReturnValue({ eq: firstEq });
      
      vi.mocked(supabase.from).mockReturnValue({
        delete: mockDelete,
      } as any);

      await expect(deleteCanvasLayout('project-123', 'entity-456'))
        .rejects.toThrow('Delete failed');
    });
  });

  describe('OCCConflictError', () => {
    it('should have correct properties', () => {
      const error = new OCCConflictError('entity-1', 5, 7);

      expect(error.entityId).toBe('entity-1');
      expect(error.clientVersion).toBe(5);
      expect(error.serverVersion).toBe(7);
      expect(error.name).toBe('OCCConflictError');
      expect(error.message).toContain('entity-1');
      expect(error.message).toContain('5');
      expect(error.message).toContain('7');
    });

    it('should be instance of Error', () => {
      const error = new OCCConflictError('entity-1', 5, 7);
      expect(error instanceof Error).toBe(true);
    });
  });
});
