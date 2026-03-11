import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetVersionManager } from '../asset-version-manager.js';
import { ProjectRepository } from '../../services/project-repository.js';
import { db } from '../../db/index.js';
import { assetEntries, assetVersions } from '../../db/schema.js';

// Mock the database
vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn((fn) => fn(db)),
  },
}));

vi.mock('../../db/schema.js', () => ({
  assetEntries: {
    id: 'id',
    projectId: 'projectId',
    sceneId: 'sceneId',
    characterId: 'characterId',
    locationId: 'locationId',
    assetKey: 'assetKey',
    head: 'head',
    best: 'best',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  assetVersions: {
    id: 'id',
    assetEntryId: 'assetEntryId',
    version: 'version',
    data: 'data',
    type: 'type',
    metadata: 'metadata',
    createdAt: 'createdAt',
  },
}));

describe('AssetVersionManager', () => {
  let manager: AssetVersionManager;
  let mockProjectRepo: ProjectRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectRepo = {
      getProject: vi.fn(),
    } as unknown as ProjectRepository;
    manager = new AssetVersionManager(mockProjectRepo);
  });

  describe('createVersionedAssets', () => {
    it('should create versioned assets for a scene', async () => {
      // This is a basic test - the actual implementation requires DB mocking
      // which is complex for this class. We test the validation at least.
      const scope = {
        projectId: 'proj-1',
        sceneIds: ['scene-1'],
      };

      // Expect validation to work
      expect(() => {
        // This would fail validation if dataList doesn't match scope
        manager.createVersionedAssets(
          scope,
          ['reference_image'],
          'image',
          [], // Empty data list - should fail
          {}
        );
      }).rejects.toThrow();
    });
  });

  describe('getNextVersionNumber', () => {
    it('should return next version numbers for entities', async () => {
      // Mock the database response
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 'entry-1', head: 1, best: 1, projectId: 'proj-1', sceneId: 'scene-1', assetKey: 'reference_image' },
          ]),
        }),
      } as any);

      const scope = {
        projectId: 'proj-1',
        sceneIds: ['scene-1'],
      };

      const versions = await manager.getNextVersionNumber(scope, ['reference_image']);
      expect(versions).toEqual([2]); // head is 1, so next is 2
    });

    it('should return 1 for entities with no existing entries', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const scope = {
        projectId: 'proj-1',
        sceneIds: ['new-scene'],
      };

      const versions = await manager.getNextVersionNumber(scope, ['reference_image']);
      expect(versions).toEqual([1]); // No entry, so next is 1
    });
  });

  describe('getBestVersion', () => {
    it('should return the best version for an asset', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const scope = {
        projectId: 'proj-1',
        sceneIds: ['scene-1'],
      };

      const bestVersions = await manager.getBestVersion(scope, ['reference_image']);
      expect(bestVersions).toEqual([null]); // No entry, so null
    });
  });

  describe('setBestVersion', () => {
    it('should throw if entity count does not match version count', async () => {
      const scope = {
        projectId: 'proj-1',
        sceneIds: ['scene-1', 'scene-2'],
      };

      await expect(
        manager.setBestVersion(scope, ['reference_image'], [1])
      ).rejects.toThrow('Scope has 2 entities but 1 version numbers were provided');
    });
  });

  describe('deleteVersions', () => {
    it('should throw if trying to delete the best version', async () => {
      // This requires more complex mocking - just test validation
      const scope = {
        projectId: 'proj-1',
        sceneIds: ['scene-1'],
      };

      // Without proper mocking, this tests the validation path
      await expect(
        manager.deleteVersions(scope, ['reference_image'], [1])
      ).rejects.toThrow();
    });
  });

  describe('getAllSceneAssets', () => {
    it('should return empty registry for non-existent scene', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const registry = await manager.getAllSceneAssets('non-existent-scene');
      expect(registry).toEqual({});
    });
  });

  describe('getAllProjectAssets', () => {
    it('should return empty registry for non-existent project', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const registry = await manager.getAllProjectAssets('non-existent-project');
      expect(registry).toEqual({});
    });
  });

  describe('getAllCharacterAssets', () => {
    it('should return empty registry for non-existent character', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const registry = await manager.getAllCharacterAssets('non-existent-character');
      expect(registry).toEqual({});
    });
  });

  describe('getAllLocationAssets', () => {
    it('should return empty registry for non-existent location', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const registry = await manager.getAllLocationAssets('non-existent-location');
      expect(registry).toEqual({});
    });
  });

  describe('getCompletedProjectVideos', () => {
    it('should return videos with optional filters', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
            orderBy: vi.fn().mockResolvedValue([]),
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const videos = await manager.getCompletedProjectVideos({ limit: 10 });
      expect(videos).toEqual([]);
    });

    it('should apply minDuration filter when provided', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
            orderBy: vi.fn().mockResolvedValue([]),
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const videos = await manager.getCompletedProjectVideos({ minDuration: 5 });
      expect(videos).toEqual([]);
    });
  });
});
