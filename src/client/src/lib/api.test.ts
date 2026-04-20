/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

vi.mock('#client/store/useWorldStore.js', () => ({
  getActiveWorldId: vi.fn().mockReturnValue('world-1'),
}));

vi.mock('#client/store/useJobStore.js', () => ({
  ClientJob: {},
}));

const mockNodes: any[] = [];
vi.mock('#client/store/useNodeStore.js', () => ({
  useNodeStore: {
    getState: vi.fn(() => ({
      nodes: mockNodes,
      addNode: (node: any) => mockNodes.push(node),
      deleteNode: (id: string) => {
        const idx = mockNodes.findIndex((n: any) => n.id === id);
        if (idx > -1) mockNodes.splice(idx, 1);
      },
      promotePendingNode: (id: string) => {
        const node = mockNodes.find((n: any) => n.id === id);
        if (node) {
          node.data.isPending = false;
          node.data.pipelineSelected = true;
        }
      },
    })),
  },
}));

vi.mock('../domain/canvas/NodeFactory.js', () => ({
  NodeFactory: {
    createPendingNode: vi.fn((params: any) => ({
      id: params.entityId,
      type: params.type,
      position: params.posCanvas,
      data: {
        entityId: params.entityId,
        contextId: params.contextId,
        contextType: params.contextType,
        nodeTypeFlag: undefined,
        scope: params.scope,
        isLocked: false,
        pipelineSelected: false,
        collapsed: false,
        idxVersion: 1,
        pendingChangeCount: 0,
        label: params.label,
        isPending: true,
      },
    })),
    createNode: vi.fn((params: any) => ({
      id: params.entityId,
      type: params.type,
      position: params.posCanvas,
      data: {
        entityId: params.entityId,
        contextId: params.contextId,
        contextType: params.contextType,
        scope: params.scope,
        isLocked: false,
        pipelineSelected: true,
        collapsed: false,
        idxVersion: 1,
        pendingChangeCount: 0,
        label: params.label,
      },
    })),
  },
}));

global.fetch = vi.fn();

const { apiFetch, getProjects, createEntityWithPendingNode, confirmEntityNode } = await import('./api.js');

describe('api.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockReset();
    mockNodes.length = 0;
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

  describe('createEntityWithPendingNode', () => {
    it('creates a pending node and returns id and pendingNodeId', () => {
      const result = createEntityWithPendingNode({
        entityType: 'character',
        projectId: 'proj-1',
        contextId: 'proj-1',
        contextType: 'project',
        scope: 'project',
        data: { name: 'John' },
      });

      expect(result.id).toMatch(/^pending_/);
      expect(result.pendingNodeId).toBe(result.id);
    });

    it('uses provided position when passed', () => {
      const result = createEntityWithPendingNode({
        entityType: 'location',
        projectId: 'proj-1',
        contextId: 'proj-1',
        contextType: 'project',
        scope: 'project',
        posCanvas: { x: 50, y: 100 },
      });

      expect(result.id).toMatch(/^pending_/);
    });

    it('returns same id for both id and pendingNodeId', () => {
      const result = createEntityWithPendingNode({
        entityType: 'scene',
        projectId: 'proj-1',
        contextId: 'proj-1',
        contextType: 'project',
        scope: 'project',
      });

      expect(result.id).toBe(result.pendingNodeId);
    });
  });

  describe('confirmEntityNode', () => {
    it('handles promotion when pending id matches confirmed id', () => {
      const result = createEntityWithPendingNode({
        entityType: 'character',
        projectId: 'proj-1',
        contextId: 'proj-1',
        contextType: 'project',
        scope: 'project',
      });

      expect(() => confirmEntityNode(result.pendingNodeId, result.id)).not.toThrow();
    });

    it('handles replacement when server returns different id', () => {
      const result = createEntityWithPendingNode({
        entityType: 'character',
        projectId: 'proj-1',
        contextId: 'proj-1',
        contextType: 'project',
        scope: 'project',
      });

      expect(() => confirmEntityNode(result.pendingNodeId, 'server-new-id', { name: 'New Name' })).not.toThrow();
    });

    it('handles non-existent pending node gracefully', () => {
      expect(() => confirmEntityNode('non-existent', 'server-id', {})).not.toThrow();
    });
  });
});
