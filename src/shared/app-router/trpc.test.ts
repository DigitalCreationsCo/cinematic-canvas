// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#shared/services/usersAndTeamsDbService.js', () => ({
  usersAndTeamsDbService: {
    isUserMemberOfTeam: vi.fn(),
  },
}));

describe('createContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses HTTP headers for standard requests', async () => {
    const { createContext, supabaseAdmin } = await import('./trpc.js');
    const getUser = vi.spyOn(supabaseAdmin.auth, 'getUser').mockResolvedValue({
      data: { user: { id: 'user-1' } as any },
      error: null,
    } as any);

    const ctx = await createContext({
      req: {
        headers: {
          authorization: 'Bearer token-from-header',
          'x-team-id': 'team-1',
          'x-world-id': 'world-1',
          'x-project-id': 'project-1',
        },
      } as any,
      res: {} as any,
      info: {
        connectionParams: null,
      } as any,
    });

    expect(getUser).toHaveBeenCalledWith('token-from-header');
    expect(ctx.user?.id).toBe('user-1');
    expect(ctx.teamId).toBe('team-1');
    expect(ctx.worldId).toBe('world-1');
    expect(ctx.projectId).toBe('project-1');
  });

  it('falls back to connectionParams for subscription requests', async () => {
    const { createContext, supabaseAdmin } = await import('./trpc.js');
    const getUser = vi.spyOn(supabaseAdmin.auth, 'getUser').mockResolvedValue({
      data: { user: { id: 'user-2' } as any },
      error: null,
    } as any);

    const ctx = await createContext({
      req: {
        headers: {},
      } as any,
      res: {} as any,
      info: {
        connectionParams: {
          Authorization: 'Bearer token-from-connection-params',
          'x-team-id': 'team-2',
          'x-world-id': 'world-2',
          'x-project-id': 'project-2',
        },
      } as any,
    });

    expect(getUser).toHaveBeenCalledWith('token-from-connection-params');
    expect(ctx.user?.id).toBe('user-2');
    expect(ctx.teamId).toBe('team-2');
    expect(ctx.worldId).toBe('world-2');
    expect(ctx.projectId).toBe('project-2');
  });
});
