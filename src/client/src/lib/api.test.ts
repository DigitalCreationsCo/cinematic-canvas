/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock trpc client with all the procedures
const mockMutate = vi.fn().mockResolvedValue({});
const mockQuery = vi.fn().mockResolvedValue({});

vi.mock('./trpc.js', () => ({
  trpcClient: {
    projects: {
      start: { mutate: mockMutate },
      stop: { mutate: mockMutate },
      resume: { mutate: mockMutate },
      regenerateScene: { mutate: mockMutate },
      regenerateFrame: { mutate: mockMutate },
      resolveIntervention: { mutate: mockMutate },
      requestState: { mutate: mockMutate },
      generateComposites: { mutate: mockMutate },
      create: { mutate: mockMutate },
      sceneAssets: { query: mockQuery },
      assets: { query: mockQuery },
      characterAssets: { query: mockQuery },
      locationAssets: { query: mockQuery },
      list: { query: mockQuery },
      command: { query: mockQuery },
    },
    assets: {
      generateCharacterImage: { mutate: mockMutate },
      generateLocationImage: { mutate: mockMutate },
      patch: { mutate: mockMutate },
    },
    entities: {
      patch: { mutate: mockMutate },
      delete: { mutate: mockMutate },
    },
    jobs: {
      list: { query: mockQuery },
    },
    mention: {
      resolve: { mutate: mockMutate },
      register: { mutate: mockMutate },
      unregister: { mutate: mockMutate },
      suggest: { query: mockQuery },
      getHandle: { query: mockQuery },
    },
  },
}));

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

vi.mock('#client/store/useProjectStore.js', () => ({
  getActiveProjectId: vi.fn().mockReturnValue('proj-1'),
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

// Import all the actual exports
const api = await import('./api.js');

describe('api.ts - Pipeline Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockResolvedValue({});
    mockQuery.mockResolvedValue({});
  });

  describe('startPipeline', () => {
    it('should call projects.start.mutate with input', async () => {
      const input = { projectId: 'proj-1', initialPrompt: 'test prompt' } as any;
      await api.startPipeline(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });

    it('should return mutate result', async () => {
      mockMutate.mockResolvedValueOnce({ jobId: 'job-123' });
      const result = await api.startPipeline({ projectId: 'proj-1', initialPrompt: 'test' } as any);
      expect(result).toEqual({ jobId: 'job-123' });
    });
  });

  describe('stopPipeline', () => {
    it('should call projects.stop.mutate with input', async () => {
      const input = { projectId: 'proj-1' } as any;
      await api.stopPipeline(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });
  });

  describe('resumePipeline', () => {
    it('should call projects.resume.mutate with input', async () => {
      const input = { projectId: 'proj-1' } as any;
      await api.resumePipeline(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });
  });

  describe('regenerateScene', () => {
    it('should call projects.regenerateScene.mutate with input', async () => {
      const input = { projectId: 'proj-1', payload: { sceneId: 'scene-1', forceRegenerate: true } } as any;
      await api.regenerateScene(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });
  });

  describe('regenerateFrame', () => {
    it('should call projects.regenerateFrame.mutate with input', async () => {
      const input = { projectId: 'proj-1', payload: { sceneIds: ['scene-1'], assetKeys: ['scene_start_frame'] } as any;
      await api.regenerateFrame(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });
  });

  describe('resolveIntervention', () => {
    it('should call projects.resolveIntervention.mutate with input', async () => {
      const input = { projectId: 'proj-1', payload: { action: 'retry', jobType: 'scene', revisedParams: {} } } as any;
      await api.resolveIntervention(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });
  });

  describe('requestFullState', () => {
    it('should call projects.requestState.mutate with input', async () => {
      const input = { projectId: 'proj-1' } as any;
      await api.requestFullState(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });
  });

  describe('generateComposites', () => {
    it('should call projects.generateComposites.mutate with input', async () => {
      const input = { imageId: 'img-1', inputImages: [], prompt: '' } as any;
      await api.generateComposites(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });
  });
});

describe('api.ts - Asset Generation Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockResolvedValue({});
  });

  describe('generateCharacterImage', () => {
    it('should call assets.generateCharacterImage.mutate with input', async () => {
      const input = { projectId: 'proj-1', characterId: 'char-1', prompt: 'test' };
      await api.generateCharacterImage(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });

    it('should return the mutate result', async () => {
      mockMutate.mockResolvedValueOnce({ assetUrl: 'char.png' });
      const result = await api.generateCharacterImage({ projectId: 'proj-1', characterId: 'char-1' });
      expect(result).toEqual({ assetUrl: 'char.png' });
    });
  });

  describe('generateLocationImage', () => {
    it('should call assets.generateLocationImage.mutate with input', async () => {
      const input = { projectId: 'proj-1', locationId: 'loc-1', prompt: 'test' };
      await api.generateLocationImage(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });
  });
});

describe('api.ts - Project Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockResolvedValue({});
  });

  describe('createProject', () => {
    it('should call projects.create.mutate with input', async () => {
      const input = { name: 'New Project' };
      await api.createProject(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });

    it('should return new project id', async () => {
      mockMutate.mockResolvedValueOnce({ projectId: 'proj-new' });
      const result = await api.createProject({ name: 'Test' });
      expect(result).toEqual({ projectId: 'proj-new' });
    });
  });
});

describe('api.ts - Entity Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockResolvedValue({});
  });

  describe('patchEntities', () => {
    it('should call entities.patch.mutate with input', async () => {
      const input = { entityType: 'character', entityId: 'char-1', updates: { name: 'New Name' } };
      await api.patchEntities(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });
  });

  describe('patchAsset', () => {
    it('should call assets.patch.mutate with input', async () => {
      const input = { assetId: 'asset-1', updates: { name: 'New Name' } };
      await api.patchAsset(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });
  });

  describe('deleteEntity', () => {
    it('should call entities.delete.mutate with input', async () => {
      const input = { entityType: 'character', entityId: 'char-1' };
      await api.deleteEntity(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });
  });
});

describe('api.ts - Mention Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockResolvedValue({});
  });

  describe('resolveMentions', () => {
    it('should call mention.resolve.mutate with input', async () => {
      const input = { htmlInput: '<p>@char-1</p>', projectId: 'proj-1' };
      await api.resolveMentions(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });
  });

  describe('registerMentionHandle', () => {
    it('should call mention.register.mutate with input', async () => {
      const input = { handle: 'test', entityId: 'char-1', entityType: 'character' };
      await api.registerMentionHandle(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });
  });

  describe('unregisterMentionHandle', () => {
    it('should call mention.unregister.mutate with input', async () => {
      const input = { handle: 'test' };
      await api.unregisterMentionHandle(input);
      expect(mockMutate).toHaveBeenCalledWith(input);
    });
  });
});

describe('api.ts - Query Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({});
  });

  describe('getSceneAssets', () => {
    it('should call projects.sceneAssets.query with input', async () => {
      const input = { projectId: 'proj-1' };
      await api.getSceneAssets(input);
      expect(mockQuery).toHaveBeenCalledWith(input);
    });

    it('should return query result', async () => {
      mockQuery.mockResolvedValueOnce([{ id: 'asset-1' }]);
      const result = await api.getSceneAssets({ projectId: 'proj-1' });
      expect(result).toEqual([{ id: 'asset-1' }]);
    });
  });

  describe('getProjectAssets', () => {
    it('should call projects.assets.query with input', async () => {
      const input = { projectId: 'proj-1' };
      await api.getProjectAssets(input);
      expect(mockQuery).toHaveBeenCalledWith(input);
    });
  });

  describe('getCharacterAssets', () => {
    it('should call projects.characterAssets.query with input', async () => {
      const input = { projectId: 'proj-1' };
      await api.getCharacterAssets(input);
      expect(mockQuery).toHaveBeenCalledWith(input);
    });
  });

  describe('getLocationAssets', () => {
    it('should call projects.locationAssets.query with input', async () => {
      const input = { projectId: 'proj-1' };
      await api.getLocationAssets(input);
      expect(mockQuery).toHaveBeenCalledWith(input);
    });
  });

  describe('getProjects', () => {
    it('should call projects.list.query with input', async () => {
      const input = {};
      await api.getProjects(input);
      expect(mockQuery).toHaveBeenCalledWith(input);
    });

    it('should return projects list', async () => {
      mockQuery.mockResolvedValueOnce([{ id: 'proj-1' }, { id: 'proj-2' }]);
      const result = await api.getProjects({});
      expect(result).toEqual([{ id: 'proj-1' }, { id: 'proj-2' }]);
    });
  });

  describe('fetchActiveJobsForProject', () => {
    it('should call jobs.list.query with input', async () => {
      const input = { projectId: 'proj-1' };
      await api.fetchActiveJobsForProject(input);
      expect(mockQuery).toHaveBeenCalledWith(input);
    });
  });

  describe('getCommandStatus', () => {
    it('should call projects.command.query with input', async () => {
      const input = { projectId: 'proj-1' };
      await api.getCommandStatus(input);
      expect(mockQuery).toHaveBeenCalledWith(input);
    });
  });

  describe('getMentionSuggestions', () => {
    it('should call mention.suggest.query with input', async () => {
      const input = { projectId: 'proj-1', query: '@' };
      await api.getMentionSuggestions(input);
      expect(mockQuery).toHaveBeenCalledWith(input);
    });
  });

  describe('getMentionHandle', () => {
    it('should call mention.getHandle.query with input', async () => {
      const input = { entityId: 'char-1' };
      await api.getMentionHandle(input);
      expect(mockQuery).toHaveBeenCalledWith(input);
    });
  });
});

describe('api.ts - Node Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNodes.length = 0;
  });

  describe('createEntityWithPendingNode', () => {
    it('creates a pending node and returns id and pendingNodeId', () => {
      const result = api.createEntityWithPendingNode({
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
      const result = api.createEntityWithPendingNode({
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
      const result = api.createEntityWithPendingNode({
        entityType: 'scene',
        projectId: 'proj-1',
        contextId: 'proj-1',
        contextType: 'project',
        scope: 'project',
      });

      expect(result.id).toBe(result.pendingNodeId);
    });

    it('adds node to store', () => {
      api.createEntityWithPendingNode({
        entityType: 'character',
        projectId: 'proj-1',
        contextId: 'proj-1',
        contextType: 'project',
        scope: 'project',
      });

      expect(mockNodes.length).toBe(1);
    });
  });

  describe('confirmEntityNode', () => {
    it('handles promotion when pending id matches confirmed id', () => {
      const result = api.createEntityWithPendingNode({
        entityType: 'character',
        projectId: 'proj-1',
        contextId: 'proj-1',
        contextType: 'project',
        scope: 'project',
      });

      expect(() => api.confirmEntityNode(result.pendingNodeId, result.id)).not.toThrow();
    });

    it('handles replacement when server returns different id', () => {
      const result = api.createEntityWithPendingNode({
        entityType: 'character',
        projectId: 'proj-1',
        contextId: 'proj-1',
        contextType: 'project',
        scope: 'project',
      });

      expect(() => api.confirmEntityNode(result.pendingNodeId, 'server-new-id', { name: 'New Name' })).not.toThrow();
    });

    it('handles non-existent pending node gracefully', () => {
      expect(() => api.confirmEntityNode('non-existent', 'server-id', {})).not.toThrow();
    });

    it('replaces node when server returns different id', () => {
      const result = api.createEntityWithPendingNode({
        entityType: 'character',
        projectId: 'proj-1',
        contextId: 'proj-1',
        contextType: 'project',
        scope: 'project',
      });

      api.confirmEntityNode(result.pendingNodeId, 'server-id-123', { name: 'Confirmed' });

      // Should delete old pending node and add new node
      expect(mockNodes.length).toBe(1);
      expect(mockNodes[0].id).toBe('server-id-123');
    });
  });
});

describe('api.ts - Type Exports', () => {
  it('should export EntityType type', () => {
    expect(api.EntityType).toBeDefined();
  });

  it('should export ResolveMentionsRequest interface', () => {
    // Just verify the type is exported by checking it exists - runtime check
    expect(api.ResolveMentionsRequest).toBeDefined();
  });

  it('should export ResolveMentionsResponse interface', () => {
    expect(api.ResolveMentionsResponse).toBeDefined();
  });

  it('should export MentionSuggestion interface', () => {
    expect(api.MentionSuggestion).toBeDefined();
  });

  it('should export SuggestMentionsResponse interface', () => {
    expect(api.SuggestMentionsResponse).toBeDefined();
  });
});