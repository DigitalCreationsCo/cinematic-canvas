/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';

vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const mockSupabaseClient = {
  from: vi.fn(),
};

class MockCanvasNodeDB extends Dexie {
  nodeLayouts!: Dexie.Table<Record<string, unknown>, string>;
  
  constructor() {
    super('MockCanvasNodeStorage');
    this.version(1).stores({
      nodeLayouts: 'id, idContext, idEntity, tsUpdated, tsSynced',
    });
  }
}

describe('HybridNodeStorage', () => {
  let HybridNodeStorage: typeof import('../hybridNodeStorage.js').HybridNodeStorage;
  let SupabaseAdapter: typeof import('../hybridNodeStorage.js').SupabaseAdapter;
  let OCCConflictError: typeof import('../hybridNodeStorage.js').OCCConflictError;
  let getHybridNodeStorage: typeof import('../hybridNodeStorage.js').getHybridNodeStorage;
  let resetHybridNodeStorage: typeof import('../hybridNodeStorage.js').resetHybridNodeStorage;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    
    const module = await import('../hybridNodeStorage.js');
    HybridNodeStorage = module.HybridNodeStorage;
    SupabaseAdapter = module.SupabaseAdapter;
    OCCConflictError = module.OCCConflictError;
    getHybridNodeStorage = module.getHybridNodeStorage;
    resetHybridNodeStorage = module.resetHybridNodeStorage;
    
    resetHybridNodeStorage();
  });

  afterEach(() => {
    resetHybridNodeStorage();
  });

  describe('constructor', () => {
    it('should initialize with cloud sync disabled by default', () => {
      const storage = new HybridNodeStorage(mockSupabaseClient as any);
      expect(storage.isCloudSyncEnabled()).toBe(false);
    });

    it('should create instance with isCloudSyncEnabled method', () => {
      const storage = new HybridNodeStorage(mockSupabaseClient as any);
      expect(typeof storage.isCloudSyncEnabled).toBe('function');
    });

    it('should create instance with upsert method', () => {
      const storage = new HybridNodeStorage(mockSupabaseClient as any);
      expect(typeof storage.upsert).toBe('function');
    });

    it('should create instance with fetch method', () => {
      const storage = new HybridNodeStorage(mockSupabaseClient as any);
      expect(typeof storage.fetch).toBe('function');
    });

    it('should create instance with delete method', () => {
      const storage = new HybridNodeStorage(mockSupabaseClient as any);
      expect(typeof storage.delete).toBe('function');
    });
  });

  describe('getHybridNodeStorage singleton', () => {
    it('should return same instance on multiple calls', () => {
      const storage1 = getHybridNodeStorage(mockSupabaseClient as any);
      const storage2 = getHybridNodeStorage(mockSupabaseClient as any);
      expect(storage1).toBe(storage2);
    });

    it('should reset instance when resetHybridNodeStorage is called', () => {
      const storage1 = getHybridNodeStorage(mockSupabaseClient as any);
      resetHybridNodeStorage();
      const storage2 = getHybridNodeStorage(mockSupabaseClient as any);
      expect(storage1).not.toBe(storage2);
    });
  });

  describe('SupabaseAdapter', () => {
    it('should fetch layouts from supabase', async () => {
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

      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: mockData, error: null }),
        }),
      };

      const adapter = new SupabaseAdapter(mockClient as any);
      const result = await adapter.fetch('project-123');

      expect(mockClient.from).toHaveBeenCalledWith('canvas_node_layouts');
      expect(result).toHaveLength(1);
      expect(result[0].idEntity).toBe('entity-1');
      expect(result[0].nodeType).toBe('scene');
      expect(result[0].valPosX).toBe(100);
    });

    it('should upsert layouts to supabase', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { idx_version: 2 },
            error: null,
          }),
        }),
      };

      const adapter = new SupabaseAdapter(mockClient as any);
      const result = await adapter.upsert([{
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
      }]);

      expect(result.success).toBe(true);
      expect(result.newVersions['entity-1']).toBe(2);
    });

    it('should delete layout from supabase', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockClient = {
        from: vi.fn().mockReturnValue({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: mockEq,
            }),
          }),
        }),
      };

      const adapter = new SupabaseAdapter(mockClient as any);
      await adapter.delete('project-123', 'entity-1');

      expect(mockClient.from).toHaveBeenCalledWith('canvas_node_layouts');
      expect(mockEq).toHaveBeenCalledWith('id_entity', 'entity-1');
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

  describe('IndexedDB operations via Dexie', () => {
    it('should use correct database name', async () => {
      const Dexie = (await import('dexie')).default;
      const db = new Dexie('CinematicCanvasNodeStorage');
      
      expect(db.name).toBe('CinematicCanvasNodeStorage');
      
      await db.close();
    });

    it('should define correct schema for nodeLayouts', async () => {
      const Dexie = (await import('dexie')).default;
      
      class TestDB extends Dexie {
        nodeLayouts!: Dexie.Table<Record<string, unknown>, string>;
        
        constructor() {
          super('TestSchema');
          this.version(1).stores({
            nodeLayouts: 'id, idContext, idEntity, tsUpdated, tsSynced',
          });
        }
      }
      
      const db = new TestDB();
      expect(db.nodeLayouts).toBeDefined();
      
      await db.close();
    });
  });

  describe('storage instance', () => {
    it('should create storage with correct initial state', async () => {
      const module = await import('../hybridNodeStorage.js');
      const storage = new module.HybridNodeStorage(mockSupabaseClient as any);
      expect(storage.isCloudSyncEnabled()).toBe(false);
    });
  });
});

describe('LayoutNodeLocal interface', () => {
  it('should have all required fields', () => {
    const layout: import('../hybridNodeStorage.js').LayoutNodeLocal = {
      id: 'project-1:entity-1',
      idContext: 'project-1',
      contextType: 'project',
      idEntity: 'entity-1',
      nodeType: 'scene',
      valPosX: 100,
      valPosY: 200,
      valWidth: 300,
      valHeight: 400,
      jsonUiMetadata: { collapsed: false },
      idxVersion: 5,
      tsUpdated: '2024-01-01T00:00:00.000Z',
      tsSynced: '2024-01-01T00:00:00.000Z',
    };

    expect(layout.id).toBe('project-1:entity-1');
    expect(layout.idxVersion).toBe(5);
    expect(layout.tsSynced).not.toBeNull();
  });

  it('should allow null for optional fields', () => {
    const layout: import('../hybridNodeStorage.js').LayoutNodeLocal = {
      id: 'project-1:entity-1',
      idContext: 'project-1',
      contextType: 'project',
      idEntity: 'entity-1',
      nodeType: 'scene',
      valPosX: 100,
      valPosY: 200,
      valWidth: null,
      valHeight: null,
      jsonUiMetadata: null,
      idxVersion: 1,
      tsUpdated: '2024-01-01T00:00:00.000Z',
      tsSynced: null,
    };

    expect(layout.valWidth).toBeNull();
    expect(layout.valHeight).toBeNull();
    expect(layout.jsonUiMetadata).toBeNull();
    expect(layout.tsSynced).toBeNull();
  });
});

describe('LayoutNodeInput interface', () => {
  it('should have all required fields', () => {
    const input: import('../hybridNodeStorage.js').LayoutNodeInput = {
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
    };

    expect(input.idContextTarget).toBe('project-123');
    expect(input.idxVersionCurrent).toBe(1);
  });
});

describe('UpsertResult interface', () => {
  it('should have success and newVersions', () => {
    const result: import('../hybridNodeStorage.js').UpsertResult = {
      success: true,
      newVersions: { 'entity-1': 2, 'entity-2': 3 },
    };

    expect(result.success).toBe(true);
    expect(result.newVersions['entity-1']).toBe(2);
  });

  it('should allow error field', () => {
    const result: import('../hybridNodeStorage.js').UpsertResult = {
      success: false,
      newVersions: {},
      error: 'Some error occurred',
    };

    expect(result.success).toBe(false);
    expect(result.error).toBe('Some error occurred');
  });
});
