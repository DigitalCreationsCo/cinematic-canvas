// src/shared/services/tests/tag-registry.test.ts
// Vitest tests for TagRegistryService

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TagRegistryService } from '../tag-registry.js';

vi.mock('../../db/index.js', () => ({
  db: {
    transaction: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../../db/schema.js', () => ({
  tagRegistry: {
    handle: { primaryKey: vi.fn() },
    entityId: { notNull: vi.fn() },
    entityType: { notNull: vi.fn() },
    worldId: { references: vi.fn() },
    projectId: { references: vi.fn() },
  },
  characters: {
    id: {},
    name: {},
    physicalTraits: {},
    state: {},
  },
  locations: {
    id: {},
    name: {},
    type: {},
    state: {},
  },
  props: {
    id: {},
    name: {},
    description: {},
  },
  projects: {
    id: {},
    worldId: {},
  },
  worlds: {
    id: {},
  },
  assetEntries: {
    id: {},
    assetKey: {},
    characterId: {},
    locationId: {},
    fileId: {},
    best: {},
  },
  assetVersions: {
    id: {},
    assetEntryId: {},
    version: {},
    data: {},
  },
  worldAccessGrants: {
    id: {},
    worldId: {},
    userId: {},
  },
}));

describe('TagRegistryService', () => {
  let service: TagRegistryService;
  let mockTx: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TagRegistryService();

    mockTx = vi.fn().mockImplementation(async (callback) => {
      const txMock = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      };
      return callback(txMock);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerHandle', () => {
    it('should register a new handle with @ prefix normalized', async () => {
      const input = {
        handle: 'LukeSkywalker',
        entityId: 'uuid-123',
        entityType: 'character' as const,
        projectId: 'uuid-project',
      };

      const mockEntry = {
        handle: '@LukeSkywalker',
        entityId: input.entityId,
        entityType: input.entityType,
        projectId: input.projectId,
        worldId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTx.mockImplementation(async (callback) => {
        const txMock = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]),
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([mockEntry]),
        };
        return callback(txMock);
      });

      const result = await service.registerHandle(input, { transaction: mockTx } as any);

      expect(result.handle).toBe('@LukeSkywalker');
    });

    it('should throw error if handle already exists', async () => {
      const input = {
        handle: '@ExistingHandle',
        entityId: 'uuid-123',
        entityType: 'character' as const,
        projectId: 'uuid-project',
      };

      mockTx.mockImplementation(async (callback) => {
        const txMock = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ handle: '@ExistingHandle' }]),
        };
        return callback(txMock);
      });

      await expect(service.registerHandle(input, { transaction: mockTx } as any))
        .rejects.toThrow("Handle '@ExistingHandle' is already registered");
    });

    it('should throw error if database is not initialized', async () => {
      const input = {
        handle: '@TestHandle',
        entityId: 'uuid-123',
        entityType: 'character' as const,
      };

      await expect(service.registerHandle(input, null as any))
        .rejects.toThrow('Database not initialized');
    });
  });

  describe('unregisterHandle', () => {
    it('should unregister a handle and return true', async () => {
      mockTx.mockImplementation(async (callback) => {
        const txMock = {
          delete: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ handle: '@LukeSkywalker' }]),
        };
        return callback(txMock);
      });

      const result = await service.unregisterHandle('LukeSkywalker', { transaction: mockTx } as any);

      expect(result).toBe(true);
    });

    it('should return false if handle does not exist', async () => {
      mockTx.mockImplementation(async (callback) => {
        const txMock = {
          delete: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([]),
        };
        return callback(txMock);
      });

      const result = await service.unregisterHandle('NonExistent', { transaction: mockTx } as any);

      expect(result).toBe(false);
    });

    it('should normalize handle without @ prefix', async () => {
      let capturedHandle: string | undefined;

      mockTx.mockImplementation(async (callback) => {
        const txMock = {
          delete: vi.fn().mockReturnThis(),
          where: vi.fn().mockImplementation((condition: any) => {
            if (condition && typeof condition === 'object') {
              capturedHandle = 'delete condition captured';
            }
            return txMock;
          }),
          returning: vi.fn().mockResolvedValue([{ handle: '@LukeSkywalker' }]),
        };
        return callback(txMock);
      });

      await service.unregisterHandle('@LukeSkywalker', { transaction: mockTx } as any);

      expect(capturedHandle).toBeDefined();
    });
  });

  describe('getHandle', () => {
    it('should return handle if it exists', async () => {
      const mockEntry = {
        handle: '@LukeSkywalker',
        entityId: 'uuid-123',
        entityType: 'character' as const,
        projectId: 'uuid-project',
      };

      mockTx.mockImplementation(async (callback) => {
        const txMock = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([mockEntry]),
        };
        return callback(txMock);
      });

      const result = await service.getHandle('LukeSkywalker', { transaction: mockTx } as any);

      expect(result?.handle).toBe('@LukeSkywalker');
    });

    it('should return null if handle does not exist', async () => {
      mockTx.mockImplementation(async (callback) => {
        const txMock = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]),
        };
        return callback(txMock);
      });

      const result = await service.getHandle('NonExistent', { transaction: mockTx } as any);

      expect(result).toBeNull();
    });
  });

  describe('verifyHandleAccessBulk', () => {
    it('should return empty array for empty input', async () => {
      const result = await service.verifyHandleAccessBulk([], 'user-123', 'project-456');

      expect(result).toEqual([]);
    });

    it('should return authorized handles from project scope', async () => {
      mockTx.mockImplementation(async (callback) => {
        const txMock = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          leftJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { handle: '@LukeSkywalker' },
            { handle: '@HanSolo' },
          ]),
        };
        return callback(txMock);
      });

      const result = await service.verifyHandleAccessBulk(
        ['@LukeSkywalker', '@HanSolo', '@UnauthorizedIP'],
        'user-123',
        'project-456',
        { transaction: mockTx } as any
      );

      expect(result).toHaveLength(2);
      expect(result).toContain('@LukeSkywalker');
      expect(result).toContain('@HanSolo');
    });
  });

  describe('getHydrationPayloadsBulk', () => {
    it('should return empty array for empty input', async () => {
      const result = await service.getHydrationPayloadsBulk([]);

      expect(result).toEqual([]);
    });

    it('should return hydration payloads for authorized handles', async () => {
      const mockRecords = [
        {
          handle: '@LukeSkywalker',
          entityType: 'character',
          charName: 'Luke Skywalker',
          charDesc: 'Jedi Knight',
          charTraits: { build: 'athletic' },
          charState: { mood: 'determined' },
          locName: null,
          locDesc: null,
          locState: null,
          propName: null,
          propDesc: null,
          bestAssetData: 'gs://assets/luke.png',
        },
      ];

      mockTx.mockImplementation(async (callback) => {
        const txMock = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          leftJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(mockRecords),
        };
        return callback(txMock);
      });

      const result = await service.getHydrationPayloadsBulk(
        ['@LukeSkywalker'],
        { transaction: mockTx } as any
      );

      expect(result).toHaveLength(1);
      expect(result[0].handle).toBe('@LukeSkywalker');
      expect(result[0].name).toBe('Luke Skywalker');
    });
  });
});
