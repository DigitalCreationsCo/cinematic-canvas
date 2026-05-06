/// <reference types="vitest/globals" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LayoutNodeInput,
  LayoutNodeLocal,
  LayoutNodeOutput,
  UpsertResult,
} from "#client/services/hybridNodeStorage.js";

const mockDefaultSupabase = {
  from: vi.fn(),
};

vi.mock("#client/lib/supabase.js", () => ({
  supabase: mockDefaultSupabase,
}));

const mockDb = vi.hoisted(async () => {
  const { createMockDb } = await import("#shared/mocks/mock-db.js");
  return createMockDb();
});
vi.mock("#shared/db/index.js", async () => ({
  db: await mockDb,
}));

vi.mock("#shared/db/schema.js", async (originalImport) => {
  const actual = (await originalImport()) as typeof import("#shared/db/schema.js");

  const mockTable = {
    idLayout: "idLayout",
    idContext: "idContext",
    contextType: "contextType",
    idEntity: "idEntity",
    nodeType: "nodeType",
    valPosX: "valPosX",
    valPosY: "valPosY",
    valWidth: "valWidth",
    valHeight: "valHeight",
    jsonUiMetadata: "jsonUiMetadata",
    idxVersion: "idxVersion",
    tsUpdated: "tsUpdated",
  };

  return {
    ...actual,
    // Ensure the table name property exists for Drizzle's internal query builder
    canvasNodeLayouts: Object.assign(mockTable, {
      [Symbol.for("drizzle:Name")]: "canvas_node_layouts",
      // If code uses getTableColumns, this helps:
      _: { name: "canvas_node_layouts", columns: mockTable },
    }),
  };
});

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("drizzle-orm");
  return {
    ...actual, // ← preserves getViewSelectedFields, getTableColumns, etc.
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
    eq: vi.fn((...args: unknown[]) => ({ eq: args })),
    and: vi.fn((...args: unknown[]) => ({ and: args })),
    or: vi.fn((...args: unknown[]) => ({ or: args })),
    inArray: vi.fn((...args: unknown[]) => ({ inArray: args })),
  };
});

function getEnv(): Record<string, string | boolean | undefined> {
  const meta = import.meta as ImportMeta & {
    env?: Record<string, string | boolean | undefined>;
  };

  if (!meta.env) {
    meta.env = {};
  }

  return meta.env;
}

function createLocalRow(overrides: Partial<LayoutNodeLocal> = {}): LayoutNodeLocal {
  return {
    id: "project-1:entity-1",
    idContext: "project-1",
    contextType: "project",
    idEntity: "entity-1",
    nodeType: "scene",
    valPosX: 100,
    valPosY: 200,
    valWidth: 300,
    valHeight: 400,
    jsonUiMetadata: { collapsed: false },
    idxVersion: 1,
    tsUpdated: "2024-01-01T00:00:00.000Z",
    tsSynced: null,
    ...overrides,
  };
}

function createInput(overrides: Partial<LayoutNodeInput> = {}): LayoutNodeInput {
  return {
    idContextTarget: "project-1",
    contextTypeTarget: "project",
    idEntityTarget: "entity-1",
    nodeTypeTarget: "scene",
    valPosXTarget: 100,
    valPosYTarget: 200,
    valWidthTarget: 300,
    valHeightTarget: 400,
    jsonUiMetadata: { collapsed: false },
    idxVersionCurrent: 1,
    ...overrides,
  };
}

describe.skip("hybridNodeStorage", () => {
  let HybridNodeStorage: typeof import("#client/services/hybridNodeStorage.js").HybridNodeStorage;
  let SupabaseAdapter: typeof import("#client/services/hybridNodeStorage.js").SupabaseAdapter;
  let OCCConflictError: typeof import("#client/services/hybridNodeStorage.js").OCCConflictError;
  let getHybridNodeStorage: typeof import("#client/services/hybridNodeStorage.js").getHybridNodeStorage;
  let resetHybridNodeStorage: typeof import("#client/services/hybridNodeStorage.js").resetHybridNodeStorage;
  let fetchCanvasLayoutsFromCloud: typeof import("#client/services/hybridNodeStorage.js").fetchCanvasLayoutsFromCloud;
  let upsertCanvasLayoutsToCloud: typeof import("#client/services/hybridNodeStorage.js").upsertCanvasLayoutsToCloud;
  let deleteCanvasLayoutFromCloud: typeof import("#client/services/hybridNodeStorage.js").deleteCanvasLayoutFromCloud;
  let fetchCanvasLayoutsFromDatabase: typeof import("#client/services/hybridNodeStorage.js").fetchCanvasLayoutsFromDatabase;
  let upsertBatchCanvasLayouts: typeof import("#client/services/hybridNodeStorage.js").upsertBatchCanvasLayouts;
  let deleteCanvasLayoutFromDatabase: typeof import("#client/services/hybridNodeStorage.js").deleteCanvasLayoutFromDatabase;

  const env = getEnv();
  const originalCloudSync = env.VITE_ENABLE_CLOUD_NODE_SYNC;

  async function loadModule(cloudSync: "true" | "false" = "false") {
    vi.clearAllMocks();
    vi.resetModules();
    env.VITE_ENABLE_CLOUD_NODE_SYNC = cloudSync;

    const module = await import("#client/services/hybridNodeStorage.js");
    module.resetHybridNodeStorage();

    HybridNodeStorage = module.HybridNodeStorage;
    SupabaseAdapter = module.SupabaseAdapter;
    OCCConflictError = module.OCCConflictError;
    getHybridNodeStorage = module.getHybridNodeStorage;
    resetHybridNodeStorage = module.resetHybridNodeStorage;
    fetchCanvasLayoutsFromCloud = module.fetchCanvasLayoutsFromCloud;
    upsertCanvasLayoutsToCloud = module.upsertCanvasLayoutsToCloud;
    deleteCanvasLayoutFromCloud = module.deleteCanvasLayoutFromCloud;
    fetchCanvasLayoutsFromDatabase = module.fetchCanvasLayoutsFromDatabase;
    upsertBatchCanvasLayouts = module.upsertBatchCanvasLayouts;
    deleteCanvasLayoutFromDatabase = module.deleteCanvasLayoutFromDatabase;

    return module;
  }

  beforeEach(async () => {
    await loadModule("false");
  });

  afterEach(async () => {
    if (originalCloudSync === undefined) {
      delete env.VITE_ENABLE_CLOUD_NODE_SYNC;
    } else {
      env.VITE_ENABLE_CLOUD_NODE_SYNC = originalCloudSync;
    }

    const { resetHybridNodeStorage: reset } = await import("#client/services/hybridNodeStorage.js");
    if (typeof reset === "function") {
      reset();
    }
  });

  describe.skip("HybridNodeStorage instance", () => {
    it("creates a singleton and resets it on demand", () => {
      const first = getHybridNodeStorage({} as any);
      const second = getHybridNodeStorage({} as any);
      expect(first).toBe(second);

      resetHybridNodeStorage();
      const third = getHybridNodeStorage({} as any);
      expect(third).not.toBe(first);
    });

    it("defaults cloud sync to disabled", () => {
      const storage = new HybridNodeStorage({} as any, {
        nodeLayouts: {} as any,
      });
      expect(storage.isCloudSyncEnabled()).toBe(false);
    });
  });

  describe.skip("SupabaseAdapter", () => {
    it("fetches cloud layouts and maps the row shape", async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id_entity: "entity-1",
                context_type: "project",
                node_type: "scene",
                val_pos_x: 10,
                val_pos_y: 20,
                val_width: 30,
                val_height: 40,
                json_ui_metadata: { collapsed: true },
                idx_version: 5,
              },
            ],
            error: null,
          }),
        }),
      };

      const adapter = new SupabaseAdapter(mockClient as any);
      const result = await adapter.fetch("project-1");

      expect(mockClient.from).toHaveBeenCalledWith("canvas_node_layouts");
      expect(result).toEqual([
        {
          idEntity: "entity-1",
          contextType: "project",
          nodeType: "scene",
          valPosX: 10,
          valPosY: 20,
          valWidth: 30,
          valHeight: 40,
          jsonUiMetadata: { collapsed: true },
          idxVersion: 5,
        },
      ]);
    });

    it("throws when cloud fetch fails", async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: "Fetch failed" } }),
        }),
      };

      const adapter = new SupabaseAdapter(mockClient as any);
      await expect(adapter.fetch("project-1")).rejects.toThrow("Fetch failed");
    });

    it("updates an existing cloud row when the version matches", async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { idx_version: 2 },
            error: null,
          }),
        }),
      };

      const adapter = new SupabaseAdapter(mockClient as any);
      const result = await adapter.upsert([createInput({ idxVersionCurrent: 1 })]);

      expect(result).toEqual({
        success: true,
        newVersions: { "entity-1": 2 },
      });
    });

    it("throws OCCConflictError when the server already has a newer version", async () => {
      const mockClient = {
        from: vi
          .fn()
          .mockReturnValueOnce({
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })
          .mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { idx_version: 7 },
              error: null,
            }),
          }),
      };

      const adapter = new SupabaseAdapter(mockClient as any);

      await expect(adapter.upsert([createInput({ idxVersionCurrent: 5 })])).rejects.toEqual(
        expect.objectContaining({
          entityId: "entity-1",
          clientVersion: 5,
          serverVersion: 7,
        }),
      );
    });

    it("inserts a new cloud row when no existing row is present", async () => {
      const mockClient = {
        from: vi
          .fn()
          .mockReturnValueOnce({
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })
          .mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })
          .mockReturnValueOnce({
            insert: vi.fn().mockResolvedValue({ error: null }),
          }),
      };

      const adapter = new SupabaseAdapter(mockClient as any);
      const result = await adapter.upsert([createInput({ idxVersionCurrent: 0 })]);

      expect(result).toEqual({
        success: true,
        newVersions: { "entity-1": 1 },
      });
    });

    it("returns a failure result for non-conflict insert errors", async () => {
      const mockClient = {
        from: vi
          .fn()
          .mockReturnValueOnce({
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })
          .mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })
          .mockReturnValueOnce({
            insert: vi.fn().mockResolvedValue({
              error: { code: "OTHER_ERROR", message: "Insert failed" },
            }),
          }),
      };

      const adapter = new SupabaseAdapter(mockClient as any);
      const result = await adapter.upsert([createInput()]);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Insert failed");
    });

    it("throws OCCConflictError on unique constraint violations", async () => {
      const mockClient = {
        from: vi
          .fn()
          .mockReturnValueOnce({
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })
          .mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })
          .mockReturnValueOnce({
            insert: vi.fn().mockResolvedValue({
              error: { code: "23505", message: "Unique violation" },
            }),
          })
          .mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { idx_version: 9 },
              error: null,
            }),
          }),
      };

      const adapter = new SupabaseAdapter(mockClient as any);

      await expect(adapter.upsert([createInput({ idxVersionCurrent: 1 })])).rejects.toEqual(
        expect.objectContaining({
          entityId: "entity-1",
          clientVersion: 1,
          serverVersion: 9,
        }),
      );
    });

    it("deletes a cloud row", async () => {
      const terminalEq = vi.fn().mockResolvedValue({ error: null });
      const mockClient = {
        from: vi.fn().mockReturnValue({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: terminalEq,
            }),
          }),
        }),
      };

      const adapter = new SupabaseAdapter(mockClient as any);
      await adapter.delete("project-1", "entity-1");

      expect(mockClient.from).toHaveBeenCalledWith("canvas_node_layouts");
      expect(terminalEq).toHaveBeenCalledWith("id_entity", "entity-1");
    });

    it("throws when cloud delete fails", async () => {
      const terminalEq = vi.fn().mockResolvedValue({ error: { message: "Delete failed" } });
      const mockClient = {
        from: vi.fn().mockReturnValue({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: terminalEq,
            }),
          }),
        }),
      };

      const adapter = new SupabaseAdapter(mockClient as any);
      await expect(adapter.delete("project-1", "entity-1")).rejects.toThrow("Delete failed");
    });
  });

  describe.skip("cloud helper wrappers", () => {
    it("delegate to the default Supabase client", async () => {
      mockDefaultSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      });

      await fetchCanvasLayoutsFromCloud("project-1");
      expect(mockDefaultSupabase.from).toHaveBeenCalledWith("canvas_node_layouts");
    });

    it("deleteCanvasLayoutFromCloud delegates to the default Supabase client", async () => {
      const terminalEq = vi.fn().mockResolvedValue({ error: null });
      mockDefaultSupabase.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: terminalEq,
          }),
        }),
      });

      await deleteCanvasLayoutFromCloud("project-1", "entity-1");
      expect(terminalEq).toHaveBeenCalledWith("id_entity", "entity-1");
    });

    it("upsertCanvasLayoutsToCloud delegates to the default Supabase client", async () => {
      mockDefaultSupabase.from.mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { idx_version: 2 },
          error: null,
        }),
      });

      const result = await upsertCanvasLayoutsToCloud([createInput({ idxVersionCurrent: 1 })]);
      expect(result.newVersions["entity-1"]).toBe(2);
    });
  });

  describe.skip("HybridNodeStorage local and hybrid behavior", () => {
    it("fetches local layouts from IndexedDB", async () => {
      const mockTable = {
        where: vi.fn().mockReturnValue({
          equals: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([createLocalRow()]),
          }),
        }),
        put: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
      };

      const storage = new HybridNodeStorage({} as any, { nodeLayouts: mockTable as any });
      const result = await storage.fetch("project-1");

      expect(result).toEqual([
        {
          idEntity: "entity-1",
          contextType: "project",
          nodeType: "scene",
          valPosX: 100,
          valPosY: 200,
          valWidth: 300,
          valHeight: 400,
          jsonUiMetadata: { collapsed: false },
          idxVersion: 1,
        },
      ]);
    });

    it.skip("merges newer server layouts into local storage and preserves world context", async () => {
      const module = await loadModule("true");
      const Storage = module.HybridNodeStorage;

      const localRows = [
        createLocalRow({
          id: "world-1:entity-1",
          idContext: "world-1",
          contextType: "world",
          idxVersion: 1,
        }),
      ];

      const mockTable = {
        where: vi
          .fn()
          .mockReturnValueOnce({
            equals: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(localRows),
            }),
          })
          .mockReturnValueOnce({
            equals: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue([
                createLocalRow({
                  id: "world-1:entity-1",
                  idContext: "world-1",
                  contextType: "world",
                  valPosX: 900,
                  idxVersion: 5,
                  tsSynced: "2024-01-02T00:00:00.000Z",
                }),
              ]),
            }),
          }),
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn(),
        update: vi.fn(),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id_entity: "entity-1",
                context_type: "world",
                node_type: "scene",
                val_pos_x: 900,
                val_pos_y: 1000,
                val_width: null,
                val_height: null,
                json_ui_metadata: null,
                idx_version: 5,
              },
            ],
            error: null,
          }),
        }),
      };

      const storage = new Storage(
        mockSupabase as any,
        {
          nodeLayouts: mockTable as any,
        },
        {
          cloudSyncEnabled: true,
        },
      );

      const result = await storage.fetch("world-1", {
        syncFromServer: true,
        contextType: "world",
      });

      expect(mockTable.put).toHaveBeenCalledWith(
        expect.objectContaining({
          contextType: "world",
          idxVersion: 5,
        }),
      );
      expect(result[0].contextType).toBe("world");
      expect(result[0].idxVersion).toBe(5);
    });

    it.skip("persists locally even when cloud sync returns a warning", async () => {
      const module = await loadModule("true");
      const Storage = module.HybridNodeStorage;

      const mockTable = {
        where: vi.fn().mockReturnValue({
          equals: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([]),
          }),
        }),
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(createLocalRow({ id: "project-1:entity-1" })),
        update: vi.fn(),
      };

      const mockSupabase = {
        from: vi
          .fn()
          .mockReturnValueOnce({
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })
          .mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })
          .mockReturnValueOnce({
            insert: vi.fn().mockResolvedValue({
              error: { code: "OTHER_ERROR", message: "Insert failed" },
            }),
          }),
      };

      const storage = new Storage(
        mockSupabase as any,
        {
          nodeLayouts: mockTable as any,
        },
        {
          cloudSyncEnabled: true,
        },
      );

      const result = await storage.upsert([createInput({ idxVersionCurrent: 0 })]);

      expect(mockTable.put).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.error).toContain("Insert failed");
    });

    it.skip("throws OCCConflictError when cloud sync detects a stale client write", async () => {
      const module = await loadModule("true");
      const Storage = module.HybridNodeStorage;

      const mockTable = {
        where: vi.fn().mockReturnValue({
          equals: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([]),
          }),
        }),
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn(),
        update: vi.fn(),
      };

      const mockSupabase = {
        from: vi
          .fn()
          .mockReturnValueOnce({
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })
          .mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { idx_version: 6 },
              error: null,
            }),
          }),
      };

      const storage = new Storage(
        mockSupabase as any,
        {
          nodeLayouts: mockTable as any,
        },
        {
          cloudSyncEnabled: true,
        },
      );

      await expect(storage.upsert([createInput({ idxVersionCurrent: 4 })])).rejects.toEqual(
        expect.objectContaining({
          entityId: "entity-1",
          clientVersion: 4,
          serverVersion: 6,
        }),
      );
    });

    it("skips a local overwrite when IndexedDB already has a newer version", async () => {
      const mockTable = {
        where: vi.fn().mockReturnValue({
          equals: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([createLocalRow({ idxVersion: 9 })]),
          }),
        }),
        put: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
      };

      const storage = new HybridNodeStorage({} as any, { nodeLayouts: mockTable as any });
      const result = await storage.upsert([createInput({ idxVersionCurrent: 3 })]);

      expect(result.newVersions["entity-1"]).toBe(9);
      expect(mockTable.put).not.toHaveBeenCalled();
    });

    // cloud storage sync is disabled for now
    it.skip("deletes from IndexedDB and cloud storage", async () => {
      const module = await loadModule("true");
      const Storage = module.HybridNodeStorage;

      const terminalEq = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: terminalEq,
            }),
          }),
        }),
      };

      const mockTable = {
        where: vi.fn(),
        put: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined),
        get: vi.fn(),
        update: vi.fn(),
      };

      const storage = new Storage(
        mockSupabase as any,
        { nodeLayouts: mockTable as any },
        {
          cloudSyncEnabled: true,
        },
      );
      await storage.delete("project-1", "entity-1");

      expect(mockTable.delete).toHaveBeenCalledWith("project-1:entity-1");
      expect(terminalEq).toHaveBeenCalledWith("id_entity", "entity-1");
    });

    it("returns unsynced local changes", async () => {
      const mockTable = {
        where: vi.fn().mockReturnValue({
          equals: vi.fn().mockReturnValue({
            filter: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue([
                createLocalRow(),
                createLocalRow({
                  id: "project-1:entity-2",
                  idEntity: "entity-2",
                }),
              ]),
            }),
          }),
        }),
        put: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
      };

      const storage = new HybridNodeStorage({} as any, { nodeLayouts: mockTable as any });
      const result = await storage.getUnsyncedChanges("project-1");

      expect(result).toHaveLength(2);
    });

    it.skip("force-syncs unsynced changes and marks them synced locally", async () => {
      const module = await loadModule("true");
      const Storage = module.HybridNodeStorage;

      const unsynced = [
        createLocalRow({
          id: "project-1:entity-1",
          idEntity: "entity-1",
          idxVersion: 1,
          tsSynced: null,
        }),
      ];

      const mockTable = {
        where: vi.fn(),
        toCollection: vi.fn().mockReturnValue({
          filter: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(unsynced),
          }),
        }),
        put: vi.fn(),
        get: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { idx_version: 1 },
            error: null,
          }),
        }),
      };

      const storage = new Storage(
        mockSupabase as any,
        { nodeLayouts: mockTable as any },
        {
          cloudSyncEnabled: true,
        },
      );
      const syncedCount = await storage.forceSyncUnsynced();

      expect(syncedCount).toBe(1);
      expect(mockTable.update).toHaveBeenCalledWith(
        "project-1:entity-1",
        expect.objectContaining({
          tsSynced: expect.any(String),
        }),
      );
    });
  });

  describe.skip("database helper exports", () => {
    it("fetchCanvasLayoutsFromDatabase maps selected rows", async () => {
      (await mockDb).select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              idEntity: "entity-1",
              contextType: "project",
              nodeType: "scene",
              valPosX: 1,
              valPosY: 2,
              valWidth: null,
              valHeight: null,
              jsonUiMetadata: null,
              idxVersion: 3,
            },
          ]),
        }),
      });

      const result = await fetchCanvasLayoutsFromDatabase("project-1");

      expect(result).toEqual([
        {
          idEntity: "entity-1",
          contextType: "project",
          nodeType: "scene",
          valPosX: 1,
          valPosY: 2,
          valWidth: null,
          valHeight: null,
          jsonUiMetadata: null,
          idxVersion: 3,
        },
      ]);
    });

    it("inserts a new row when upsertBatchCanvasLayouts does not find one", async () => {
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: "new-id" }]),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
      };

      (await mockDb).transaction.mockImplementationOnce(async (fn: (tx: typeof txMock) => Promise<void>) => fn(txMock));

      const result = await upsertBatchCanvasLayouts([createInput({ idxVersionCurrent: 1 })]);

      expect(result["entity-1"]).toBe(2);
      expect(txMock.insert).toHaveBeenCalled();
    });

    it("updates an existing database row when versions match", async () => {
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: "existing-id" }]),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        limit: vi.fn(),
        insert: vi.fn(),
        values: vi.fn(),
      };

      (await mockDb).transaction.mockImplementationOnce(async (fn: (tx: typeof txMock) => Promise<void>) => fn(txMock));

      const result = await upsertBatchCanvasLayouts([createInput({ idxVersionCurrent: 5 })]);

      expect(result["entity-1"]).toBe(6);
      expect(txMock.insert).not.toHaveBeenCalled();
    });

    it("throws OCCConflictError when the client version is stale in the database path", async () => {
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ idxVersion: 6 }]),
        insert: vi.fn(),
        values: vi.fn(),
      };

      (await mockDb).transaction.mockImplementationOnce(async (fn: (tx: typeof txMock) => Promise<void>) => fn(txMock));

      await expect(upsertBatchCanvasLayouts([createInput({ idxVersionCurrent: 4 })])).rejects.toEqual(
        expect.objectContaining({
          entityId: "entity-1",
          clientVersion: 4,
          serverVersion: 6,
        }),
      );
    });

    it("returns an empty object for an empty batch", async () => {
      await expect(upsertBatchCanvasLayouts([])).resolves.toEqual({});
      expect((await mockDb).transaction).not.toHaveBeenCalled();
    });

    it("deleteCanvasLayoutFromDatabase deletes by context and entity", async () => {
      const dbInstance = await mockDb;
      const { createBuilder } = await import("#shared/mocks/mock-db.js");

      const mockDeleteBuilder = createBuilder([{ id: "deleted-id" }]);
      dbInstance.delete.mockReturnValue(mockDeleteBuilder);

      await deleteCanvasLayoutFromDatabase("project-1", "entity-1");

      expect(dbInstance.delete).toHaveBeenCalled();
      // Verify where was called
      expect(mockDeleteBuilder.where).toHaveBeenCalled();
    });
  });

  describe.skip("shared types and errors", () => {
    it("OCCConflictError exposes the conflict details", () => {
      const error = new OCCConflictError("entity-1", 5, 7);
      expect(error).toBeInstanceOf(Error);
      expect(error.entityId).toBe("entity-1");
      expect(error.clientVersion).toBe(5);
      expect(error.serverVersion).toBe(7);
    });

    it("keeps the expected layout and result shapes", () => {
      const output: LayoutNodeOutput = {
        idEntity: "entity-1",
        contextType: "project",
        nodeType: "scene",
        valPosX: 1,
        valPosY: 2,
        valWidth: null,
        valHeight: null,
        jsonUiMetadata: null,
        idxVersion: 1,
      };

      const result: UpsertResult = {
        success: true,
        newVersions: { "entity-1": 2 },
      };

      expect(output.idEntity).toBe("entity-1");
      expect(result.newVersions["entity-1"]).toBe(2);
    });
  });
});
