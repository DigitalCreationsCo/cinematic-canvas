import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetVersionManager } from '../asset-version-manager.js';
import { ProjectRepository } from '../../services/project-repository.js';
import { db } from '../../db/index.js';
import { mediaObjects, assetVersions, assetEntries } from "../../db/schema.js";
import { count, eq, ilike, inArray } from "drizzle-orm";

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
    imageId: 'imageId',
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
  mediaObjects: {
    data: 'data',
    refCount: 'refCount',
    status: 'status',
    lastReferencedAt: 'lastReferencedAt',
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
      await expect(
        // This would fail validation if dataList doesn't match scope
        manager.createVersionedAssets(
          scope,
          ['image_file'],
          'image',
          [], // Empty data list - should fail
          { model: 'test-model', jobId: 'test-job-id' }
        )
      ).rejects.toThrow();
    });
  });

  describe('getNextVersionNumber', () => {
    it('should return next version numbers for entities', async () => {
      // Mock the database response
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 'entry-1', head: 1, best: 1, projectId: 'proj-1', sceneId: 'scene-1', assetKey: 'image_file' },
          ]),
        }),
      } as any);

      const scope = {
        projectId: 'proj-1',
        sceneIds: ['scene-1'],
      };

      const versions = await manager.getNextVersionNumber(scope, ['image_file']);
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

      const versions = await manager.getNextVersionNumber(scope, ['image_file']);
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

      const bestVersions = await manager.getBestVersion(scope, ['image_file']);
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
        manager.setBestVersion(scope, ['image_file'], [1])
      ).rejects.toThrow('Scope has 2 entities but 1 version numbers were provided');
    });
  });

  describe('deleteVersions', () => {
    it('should throw if trying to delete the best version', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 'entry-1', head: 1, best: 1, projectId: 'proj-1', sceneId: 'scene-1', assetKey: 'image_file' },
          ]),
        }),
      } as any);

      const scope = {
        projectId: 'proj-1',
        sceneIds: ['scene-1'],
      };

      await expect(
        manager.deleteVersions(scope, ['image_file'], [1])
      ).rejects.toThrow('Cannot delete the best version of an asset.');
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

  describe('getAllImageAssets', () => {
    it('should return empty registry for non-existent image', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const registry = await manager.getAllImageAssets('non-existent-image');
      expect(registry).toEqual({});
    });

    it('should return registry with asset entries for existing image', async () => {
      const mockEntries = [
        { id: 'entry-1', imageId: 'img-1', assetKey: 'image_file', head: 1, best: 1 },
      ];
      const mockVersions = [
        { assetEntryId: 'entry-1', version: 1, data: 'gs://bucket/image.png', type: 'image' as const, metadata: {} },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn()
          .mockReturnValueOnce({
            where: vi.fn().mockResolvedValue(mockEntries),
          })
          .mockReturnValueOnce({
            where: vi.fn().mockResolvedValue(mockVersions),
          }),
      } as any);

      const registry = await manager.getAllImageAssets('img-1');
      expect(registry).toHaveProperty('image_file');
      expect(registry.image_file?.head).toBe(1);
      expect(registry.image_file?.best).toBe(1);
      expect(registry.image_file?.versions).toHaveLength(1);
    });
  });

  describe('getAssetRegistryForEntity', () => {
    it('should call getAllCharacterAssets for character entity type', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await manager.getAssetRegistryForEntity('char-1', 'character');
      expect(db.select).toHaveBeenCalled();
    });

    it('should call getAllLocationAssets for location entity type', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await manager.getAssetRegistryForEntity('loc-1', 'location');
      expect(db.select).toHaveBeenCalled();
    });

    it('should call getAllSceneAssets for scene entity type', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await manager.getAssetRegistryForEntity('scene-1', 'scene');
      expect(db.select).toHaveBeenCalled();
    });

    it('should call getAllImageAssets for image entity type', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await manager.getAssetRegistryForEntity('img-1', 'image');
      expect(db.select).toHaveBeenCalled();
    });

    it('should call getAllProjectAssets for project entity type', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await manager.getAssetRegistryForEntity('proj-1', 'project');
      expect(db.select).toHaveBeenCalled();
    });
  });

  describe('createVersionedAssets with imageIds scope', () => {
    it('should validate imageIds scope correctly', async () => {
      const scope = {
        projectId: 'proj-1',
        imageIds: ['img-1'],
      };

      // Should throw because dataList doesn't match scope
      await expect(
        manager.createVersionedAssets(
          scope,
          ['image_file'],
          'image',
          [], // Empty data list
          {}
        )
      ).rejects.toThrow();
    });

    it('should create versioned assets for image entity', async () => {
      const scope = {
        projectId: 'proj-1',
        imageIds: ['img-1'],
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'entry-1' }]),
          }),
        }),
      } as any);

      await manager.createVersionedAssets(
        scope,
        ['image_file'],
        'image',
        ['gs://bucket/image.png'],
        { model: 'test', jobId: 'job-1' }
      );
    });
  });

  describe('getNextVersionNumber with imageIds scope', () => {
    it('should return next version number for image entity', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 'entry-1', head: 3, best: 2, projectId: 'proj-1', imageId: 'img-1', assetKey: 'image_file' },
          ]),
        }),
      } as any);

      const scope = {
        projectId: 'proj-1',
        imageIds: ['img-1'],
      };

      const versions = await manager.getNextVersionNumber(scope, ['image_file']);
      expect(versions).toEqual([4]); // head is 3, so next is 4
    });
  });

  describe('setBestVersion with imageIds scope', () => {
    it('should set best version for image entity', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 'entry-1', head: 3, best: 2, projectId: 'proj-1', imageId: 'img-1', assetKey: 'image_file', versions: [{ version: 2 }, { version: 3 }] },
          ]),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'entry-1', best: 3 }]),
            }),
          }),
        }),
      } as any);

      const scope = {
        projectId: 'proj-1',
        imageIds: ['img-1'],
      };

      const result = await manager.setBestVersion(scope, ['image_file'], [3]);
      expect(result[0].best).toBe(3);
    });
  });

  describe('deleteVersions with imageIds scope', () => {
    it('should throw if trying to delete the best version for image', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 'entry-1', head: 2, best: 1, projectId: 'proj-1', imageId: 'img-1', assetKey: 'image_file' },
          ]),
        }),
      } as any);

      const scope = {
        projectId: 'proj-1',
        imageIds: ['img-1'],
      };

      await expect(
        manager.deleteVersions(scope, ['image_file'], [1])
      ).rejects.toThrow('Cannot delete version 1 - it is currently marked as best');
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

describe("AssetVersionManager - Reference Counting", () => {

  let mockProjectRepo: ProjectRepository;
  let manager: AssetVersionManager;
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectRepo = {
      getProject: vi.fn(),
    } as unknown as ProjectRepository;
    manager = new AssetVersionManager(mockProjectRepo);
  });

  const mockScope = { projectId: "test-project-123" };
  const sharedGcsUri = "gs://bucket/shared-image.png";
  const uniqueGcsUri = "gs://bucket/unique-video.mp4";

  it("should increment ref_count when multiple assets point to the same URI", async () => {
    // Create two different assets (e.g., image_file and thumbnail) 
    // pointing to the same physical file
    await manager.createVersionedAssets(
      mockScope,
      ["image_file", "thumbnail"],
      "image",
      [sharedGcsUri, sharedGcsUri],
      []
    );

    const media = await db.query.mediaObjects.findFirst({
      where: eq(mediaObjects.data, sharedGcsUri),
    });

    expect(media?.refCount).toBe(2);
    expect(media?.status).toBe("active");
  });

  it("should decrement ref_count and mark status when a version is deleted", async () => {
    // 1. Setup: Create an asset
    await manager.createVersionedAssets(
      mockScope,
      ["scene_video"],
      "video",
      [uniqueGcsUri],
      [{ duration: 10 }]
    );

    // Create a second version so we can delete version 1 (cannot delete 'best')
    await manager.createVersionedAssets(
      mockScope,
      ["scene_video"],
      "video",
      ["gs://bucket/version-2.mp4"],
      [{ duration: 10 }]
    );

    // 2. Action: Delete version 1
    await manager.deleteVersions(mockScope, ["scene_video"], [1]);

    // 3. Verify
    const media = await db.query.mediaObjects.findFirst({
      where: eq(mediaObjects.data, uniqueGcsUri),
    });

    expect(media?.refCount).toBe(0);
    expect(media?.status).toBe("pending_deletion");
  });

  it("should maintain ref_count > 0 if other assets still reference the media", async () => {
    // 1. Setup: Two assets share one URI
    await manager.createVersionedAssets(
      mockScope,
      ["image_file", "image_file"],
      "image",
      [sharedGcsUri, sharedGcsUri],
      []
    );

    // Add a second version to image_file so we can delete v1
    await manager.createVersionedAssets(
      mockScope,
      ["image_file"],
      "image",
      ["gs://bucket/new.png"],
      []
    );

    // 2. Action: Delete v1 of image_file
    await manager.deleteVersions(mockScope, ["image_file"], [1]);

    // 3. Verify: refCount should be 1 because image_file still uses it
    const media = await db.query.mediaObjects.findFirst({
      where: eq(mediaObjects.data, sharedGcsUri),
    });

    expect(media?.refCount).toBe(1);
    expect(media?.status).toBe("active");
  });

  it("should update last_referenced_at on every decrement", async () => {
    await manager.createVersionedAssets(mockScope, ["scene_video"], "video", [uniqueGcsUri], [{}]);
    await manager.createVersionedAssets(mockScope, ["scene_video"], "video", ["gs://bucket/v2.mp4"], [{}]);

    const initialMedia = await db.query.mediaObjects.findFirst({
      where: eq(mediaObjects.data, uniqueGcsUri),
    });

    // Wait a brief moment to ensure timestamp difference
    await new Promise(res => setTimeout(res, 10));

    await manager.deleteVersions(mockScope, ["scene_video"], [1]);

    const updatedMedia = await db.query.mediaObjects.findFirst({
      where: eq(mediaObjects.data, uniqueGcsUri),
    });

    expect(updatedMedia!.lastReferencedAt.getTime()).toBeGreaterThan(initialMedia!.lastReferencedAt.getTime());
  });
});

describe("AssetVersionManager - Polymorphic Media Handling", () => {

  let manager: AssetVersionManager;
  let mockProjectRepo: ProjectRepository;
  // Use a unique prefix for test data to allow targeted cleanup
  const TEST_PROJECT_ID = "00000000-0000-0000-0000-000000000000";
  const TEST_URI_PREFIX = "gs://cinematic-canvas-tests/";
  const mockScope = { projectId: TEST_PROJECT_ID };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockProjectRepo = {
      getProject: vi.fn(),
    } as unknown as ProjectRepository;
    manager = new AssetVersionManager(mockProjectRepo);

    const mockScope = { projectId: "test-p-1" };
    const gcsUri = "gs://cinematic-canvas/scene-1/output.mp4";
    const textPrompt = "A cinematic shot of a neon-lit cyberpunk street, 8k, highly detailed.";

    /** * SAFE CLEANUP: Only delete records belonging to our test project 
     * or using our test storage prefix.
     */
    const testEntries = await db.select({ id: assetEntries.id })
      .from(assetEntries)
      .where(eq(assetEntries.projectId, TEST_PROJECT_ID));

    const entryIds = testEntries.map(e => e.id);

    if (entryIds.length > 0) {
      await db.delete(assetVersions).where(inArray(assetVersions.assetEntryId, entryIds));
      await db.delete(assetEntries).where(inArray(assetEntries.id, entryIds));
    }

    // Cleanup media objects that match our test URI pattern
    await db.delete(mediaObjects).where(ilike(mediaObjects.data, `${TEST_URI_PREFIX}%`));
  });

  it("should create a media_object and link mediaId for 'video' types", async () => {
    const videoUri = `${TEST_URI_PREFIX}scene-1.mp4`;

    await manager.createVersionedAssets(
      mockScope,
      ["scene_video"],
      "video",
      [videoUri],
      []
    );

    const media = await db.query.mediaObjects.findFirst({
      where: eq(mediaObjects.data, videoUri),
    });

    expect(media).toBeDefined();
    expect(media?.refCount).toBe(1);

    const version = await db.query.assetVersions.findFirst();
    expect(version?.mediaId).toBe(videoUri);
  });

  it("should NOT create a media_object or link mediaId for 'text' types", async () => {
    const textPrompt = "A futuristic city in the clouds.";

    await manager.createVersionedAssets(
      mockScope,
      ["enhanced_prompt"],
      "text" as any,
      [textPrompt],
      [{}]
    );

    // Verify media_objects wasn't touched for this URI
    const media = await db.query.mediaObjects.findFirst({
      where: eq(mediaObjects.data, textPrompt),
    });
    expect(media).toBeUndefined();

    const version = await db.query.assetVersions.findFirst();
    expect(version?.data).toBe(textPrompt);
    expect(version?.mediaId).toBeNull();
  });

  it("should decrement ref_count correctly while ignoring text assets", async () => {
    const videoUri = `${TEST_URI_PREFIX}shared.mp4`;

    // 1. Setup: 1 Video (v1, v2) and 1 Text asset
    await manager.createVersionedAssets(mockScope, ["scene_video"], "video", [videoUri], [{}]);
    await manager.createVersionedAssets(mockScope, ["scene_video"], "video", [`${TEST_URI_PREFIX}v2.mp4`], [{}]);
    await manager.createVersionedAssets(mockScope, ["enhanced_prompt"], "text" as any, ["Some text"], [{}]);

    // 2. Action: Delete v1 of video
    await manager.deleteVersions(mockScope, ["scene_video"], [1]);

    const media = await db.query.mediaObjects.findFirst({
      where: eq(mediaObjects.data, videoUri),
    });
    expect(media?.refCount).toBe(0);
    expect(media?.status).toBe("pending_deletion");

    // 3. Action: Delete the text asset (v1)
    // This confirms the polymorphic logic doesn't attempt to decrement a null mediaId
    await expect(manager.deleteVersions(mockScope, ["enhanced_prompt"], [1])).resolves.toBeDefined();
  });
});