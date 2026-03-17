/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, getProjects } from './api.js';

vi.mock('./supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('./auth-context.js', () => ({
  getActiveTeamId: vi.fn().mockReturnValue('team-123'),
}));

global.fetch = vi.fn();

describe('api.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockReset();
  });

  describe('apiFetch', () => {
    it('should call fetch with correct endpoint and options', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: 'test' }),
      });

      const result = await apiFetch('/test-endpoint', { method: 'POST' });

      expect(global.fetch).toHaveBeenCalledWith('/api/test-endpoint', {
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-team-id': 'team-123',
        }),
      });
      expect(result).toEqual({ data: 'test' });
    });

    it('should include auth header when session exists', async () => {
      const { supabase } = await import('./supabase.js');
      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      });

      await apiFetch('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should throw error on non-ok response', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: 'Server error' }),
      });

      await expect(apiFetch('/test')).rejects.toThrow('Server error');
    });
  });

  describe('getProjects', () => {
    it('should fetch projects', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([{ id: 'proj-1' }]),
      });

      const result = await getProjects();

      expect(global.fetch).toHaveBeenCalled();
      expect(result).toEqual([{ id: 'proj-1' }]);
    });
  });
});
