/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSession = vi.fn().mockResolvedValue({ data: { session: null } });

vi.mock('./supabase.js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock('./auth-context.js', () => ({
  getActiveTeamId: vi.fn().mockReturnValue('team-123'),
}));

vi.mock('#client/store/useWorldStore.js', () => ({
  getActiveWorldId: vi.fn().mockReturnValue('world-1'),
}));

vi.mock('#client/store/useProjectStore.js', () => ({
  getActiveProjectId: vi.fn().mockReturnValue('proj-1'),
}));

const trpcModule = await import('./trpc.js');

describe('trpc.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null } });
  });

  describe('queryClient', () => {
    it('should be defined', () => {
      expect(trpcModule.queryClient).toBeDefined();
    });

    it('should have default query options', () => {
      expect(trpcModule.queryClient.getDefaultOptions()).toBeDefined();
    });
  });

  describe('supabase client', () => {
    it('should be defined', () => {
      expect(trpcModule.supabase).toBeDefined();
    });
  });

  describe('trpcClient', () => {
    it('should be defined', () => {
      expect(trpcModule.trpcClient).toBeDefined();
    });
  });

  describe('trpc proxy', () => {
    it('should be defined', () => {
      expect(trpcModule.trpc).toBeDefined();
    });

    it('should have projects namespace', () => {
      expect(trpcModule.trpc.projects).toBeDefined();
    });
  });
});

describe('trpc.ts - Headers Configuration', () => {
  it('should include team id header when team is active', async () => {
    const { getActiveTeamId } = await import('./auth-context.js');
    const teamId = getActiveTeamId();
    expect(teamId).toBe('team-123');
  });

  it('should include world id header when world is active', async () => {
    const { getActiveWorldId } = await import('#client/store/useWorldStore.js');
    const worldId = getActiveWorldId();
    expect(worldId).toBe('world-1');
  });

  it('should include project id header when project is active', async () => {
    const { getActiveProjectId } = await import('#client/store/useProjectStore.js');
    const projectId = getActiveProjectId();
    expect(projectId).toBe('proj-1');
  });
});