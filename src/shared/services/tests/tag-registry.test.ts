import { createBuilder, createMockDb, createMockProjectRepository } from "#shared/mocks/mock-db.js";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TagRegistryService } from "#shared/services/tag-registry.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

describe("TagRegistryService", () => {
  let service: TagRegistryService;
  let repository: ProjectRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createMockProjectRepository();
    service = new TagRegistryService(repository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("registerHandle", () => {
    it("should register a new handle with @ prefix normalized", async () => {
      const input = {
        handle: "LukeSkywalker",
        entityId: "uuid-123",
        entityType: "character" as const,
        projectId: "uuid-project",
      };

      const mockEntry = {
        handle: "@LukeSkywalker",
        entityId: input.entityId,
        entityType: input.entityType,
        projectId: input.projectId,
        worldId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const db = createMockDb({ insertResult: [mockEntry] });

      const result = await service.registerHandle(input, db as any);

      expect(result.handle).toBe("@LukeSkywalker");
    });

    it("should register a handle without a suffix if available", async () => {
      const input = { entityId: "1", handle: "Hero", entityType: "character" as const };
      const db = createMockDb({ insertResult: [{ handle: "hero", id: "reg_1" }] });
      const result = await service.registerHandle(input, db as any);

      expect(result.handle).toBe("hero");
      expect(repository.patchEntities).not.toHaveBeenCalled();
    });

    it("should retry with suffix and patch entity on collision", async () => {
      const input = { entityId: "1", handle: "Hero", entityType: "character" as const };
      const db = createMockDb();
      const insertBuilder = createBuilder();
      insertBuilder.returning = vi
        .fn()
        .mockRejectedValueOnce({ code: "23505" })
        .mockResolvedValueOnce([{ handle: "Hero_abc123", id: "reg_2" }]);
      db.insert = vi.fn(() => insertBuilder);

      const result = await service.registerHandle(input, db as any);

      expect(repository.patchEntities).toHaveBeenCalledWith([
        expect.objectContaining({
          patch: { referenceId: expect.stringContaining("Hero_") },
        }),
      ]);
      expect(result.handle).toContain("Hero_");
    });

    it("should throw error if max retries are exceeded", async () => {
      const input = { entityId: "1", handle: "Hero", entityType: "character" as const };
      const db = createMockDb();
      const insertBuilder = createBuilder();
      insertBuilder.returning = vi.fn().mockRejectedValue({ code: "23505" });
      db.insert = vi.fn(() => insertBuilder);

      await expect(service.registerHandle(input, db as any)).rejects.toThrow(
        "Failed to register handle after 5 retries.",
      );
    });

    it("should throw error if database is not initialized", async () => {
      const input = {
        handle: "@TestHandle",
        entityId: "uuid-123",
        entityType: "character" as const,
      };

      await expect(service.registerHandle(input, null as any)).rejects.toThrow("Database not initialized");
    });
  });

  describe("unregisterHandle", () => {
    it("should unregister a handle and return true", async () => {
      const db = createMockDb();

      const result = await service.unregisterHandle("LukeSkywalker", db as any);

      expect(result).toBe(true);
    });

    it("should return false if handle does not exist", async () => {
      const db = createMockDb({ deleteResult: [] });

      const result = await service.unregisterHandle("NonExistent", db as any);

      expect(result).toBe(false);
    });
  });

  describe("getHandle", () => {
    it("should return handle if it exists", async () => {
      const mockEntry = {
        handle: "@LukeSkywalker",
        entityId: "uuid-123",
        entityType: "character" as const,
        projectId: "uuid-project",
      };

      const db = createMockDb({ selectResult: [mockEntry] });

      const result = await service.getHandle("LukeSkywalker", db as any);

      expect(result).toEqual(mockEntry);
    });

    it("should return null if handle does not exist", async () => {
      const db = createMockDb();

      db.transaction = vi.fn(async (callback) => {
        const tx = {
          select: vi.fn(() => tx),
          from: vi.fn(() => tx),
          where: vi.fn(() => tx),
          limit: vi.fn().mockResolvedValue([]),
        };
        return callback(tx);
      });

      const result = await service.getHandle("NonExistent", db as any);

      expect(result).toBeNull();
    });
  });

  describe("verifyHandleAccessBulk", () => {
    it("should return authorized handles from project scope", async () => {
      const mockEntries = [
        { handle: "@Hero", projectId: "project-456" },
        { handle: "@WorldChar", worldId: "world-1", projectId: null },
      ];

      const db = createMockDb({ selectResult: mockEntries });

      const result = await service.verifyHandleAccessBulk(
        { handles: ["@Hero", "@WorldChar"], userId: "user-123", projectId: "project-456" },
        db as any,
      );

      expect(result).toHaveLength(2);
    });

    it("should return empty array for unauthorized handles", async () => {
      const db = createMockDb();

      db.transaction = vi.fn(async (callback) => {
        const tx = {
          select: vi.fn(() => tx),
          from: vi.fn(() => tx),
          leftJoin: vi.fn(() => tx),
          where: vi.fn(() => tx),
          returning: vi.fn().mockResolvedValue([]),
        };
        return callback(tx as any);
      });

      const result = await service.verifyHandleAccessBulk(
        { handles: ["@Unauthorized"], userId: "user-123", projectId: "project-456" },
        db as any,
      );

      expect(result).toHaveLength(0);
    });
  });
});
