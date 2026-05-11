// src/shared/app-router/tests/storyblocks-endpoint.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for the POST /api/storyblocks HTTP endpoint.
//
// Exercises the full request cycle: Express handler → createCallerFactory →
// apiKeyProcedure middleware → db insert → JSON response.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { TRPCError } from "@trpc/server";
import { createAppRouter } from "../router.js";
import { createCallerFactory, createContext } from "../index.js";

// ── Hoisted mocks ─────────────────────────────────────────────────────────

const {
  mockDbInsertReturning,
  mockBucketInstance,
} = vi.hoisted(() => ({
  mockDbInsertReturning: vi.fn<(args: any[]) => Promise<any[]>>(),
  mockBucketInstance: {
    file: vi.fn().mockReturnValue({
      createWriteStream: vi.fn().mockReturnValue({
        on: vi.fn(),
        end: vi.fn(),
      }),
    }),
    createWriteStream: vi.fn().mockReturnValue({
      on: vi.fn(),
      end: vi.fn(),
    }),
    iam: {
      testPermissions: vi.fn().mockResolvedValue([{ "storage.objects.get": true, "storage.objects.list": true, "storage.objects.create": true, "storage.objects.delete": true }]),
    },
    exists: vi.fn().mockResolvedValue([true]),
    createBucket: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Module-level mocks ────────────────────────────────────────────────────

vi.mock("#shared/db/index.js", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: mockDbInsertReturning,
      })),
    })),
  },
  initializeDatabase: vi.fn(),
  getPool: vi.fn(),
}));

vi.mock("@google-cloud/storage", () => {
  // Use a class so `new Storage(...)` works (arrow functions aren't constructible).
  // `bucket` must be a function because GCPStorageManager calls
  // `this.storage.bucket(bucketName)` in its constructor.
  class MockStorage {
    bucket = vi.fn().mockReturnValue(mockBucketInstance);
  }
  return { Storage: MockStorage };
});

// ── Test-scoped constants ─────────────────────────────────────────────────

const API_KEY = "test-api-key-123";
// FAKE_BLOCKS as returned by db — Date objects get serialized by superjson to
// ISO strings in the JSON response, so expected values use strings.
const FAKE_BLOCKS = [
  {
    id: "block-abc-123",
    projectId: "proj-xyz-789",
    index: 1,
    title: "The Confrontation",
    content: "Vance slammed his fist onto the manual override.",
    dialogue: "\"You should have stayed out of this.\"",
    isNotable: true,
    happenedAt: new Date("2026-01-15T10:00:00.000Z"),
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
  },
  {
    id: "block-def-456",
    projectId: "proj-xyz-789",
    index: 2,
    title: "The Aftermath",
    content: "The airlock sealed, trapping the breach.",
    dialogue: "",
    isNotable: false,
    happenedAt: new Date("2026-01-15T10:05:00.000Z"),
    createdAt: new Date("2026-01-15T10:05:00.000Z"),
  },
];

// Deep-clone FAKE_BLOCKS and convert Date → ISO string for HTTP response assertions.
// superjson serialises Date objects as ISO strings in the JSON payload.
const FAKE_BLOCKS_SERIALIZED = FAKE_BLOCKS.map((b) => ({
  ...b,
  happenedAt: b.happenedAt.toISOString(),
  createdAt: b.createdAt.toISOString(),
}));

// ── Test app factory ──────────────────────────────────────────────────────

function createTestApp() {
  const app = express();
  app.use(express.json());

  const eventBus = {
    publishCommand: vi.fn(),
    publishPipelineEvent: vi.fn(),
    publishJobEvent: vi.fn(),
    close: vi.fn(),
  };
  const eventsRouter = {};
  const chatRouter = {};

  const appRouter = createAppRouter({
    eventBus,
    eventsRouter,
    chatRouter,
  } as any);

  const createCaller = createCallerFactory(appRouter);

  // Mirror the same endpoint wiring as src/server/index.ts
  app.post("/api/storyblocks", async (req, res) => {
    try {
      const ctx = await createContext({
        req,
        res,
        info: { connectionParams: {} },
      });
      const caller = createCaller(ctx);
      const result = await caller.storyblocks.create(req.body);
      res.json(result);
    } catch (err) {
      if (err instanceof TRPCError) {
        res.status(500).json({
          error: err.message,
          code: err.code,
        });
      } else {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        console.error("[Test] Storyblocks API unexpected error:", message);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("POST /api/storyblocks — HTTP endpoint (createCallerFactory)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STORYBLOCKS_API_KEY = API_KEY;
  });

  afterEach(() => {
    delete process.env.STORYBLOCKS_API_KEY;
  });

  // ── Happy path ─────────────────────────────────────────────────────────

  it("returns 200 and created blocks when API key is valid", async () => {
    mockDbInsertReturning.mockResolvedValue(FAKE_BLOCKS);

    const app = createTestApp();
    const res = await request(app)
      .post("/api/storyblocks")
      .set("x-api-key", API_KEY)
      .send({
        projectId: "proj-xyz-789",
        blocks: [
          {
            index: 1,
            title: "The Confrontation",
            content: "Vance slammed his fist onto the manual override.",
            dialogue: "\"You should have stayed out of this.\"",
            happenedAt: 1736935200000,
            isNotable: true,
          },
          {
            index: 2,
            title: "The Aftermath",
            content: "The airlock sealed, trapping the breach.",
            dialogue: "",
            happenedAt: 1736935500000,
            isNotable: false,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      count: 2,
      blocks: FAKE_BLOCKS_SERIALIZED,
    });
  });

  it("inserts the correct data into the database", async () => {
    mockDbInsertReturning.mockResolvedValue([FAKE_BLOCKS[0]]);

    const app = createTestApp();
    await request(app)
      .post("/api/storyblocks")
      .set("x-api-key", API_KEY)
      .send({
        projectId: "proj-xyz-789",
        blocks: [
          {
            index: 1,
            title: "The Confrontation",
            content: "Vance slammed his fist onto the manual override.",
            dialogue: "You should have stayed out of this.",
            happenedAt: 1736935200000,
            isNotable: true,
          },
        ],
      });

    // Grab the mock db instance — vi.mock returns the mocked module
    const { db } = await import("#shared/db/index.js");
    expect(db.insert).toHaveBeenCalledTimes(1);

    // Check that the values passed to the db match expected shape
    const valuesFn = (db.insert as any).mock.results[0].value.values;
    expect(valuesFn).toHaveBeenCalledWith([
      expect.objectContaining({
        projectId: "proj-xyz-789",
        index: 1,
        title: "The Confrontation",
        content: "Vance slammed his fist onto the manual override.",
        dialogue: "You should have stayed out of this.",
        isNotable: true,
        happenedAt: expect.any(Date),
      }),
    ]);
  });

  // ── API key validation ─────────────────────────────────────────────────

  it("returns UNAUTHORIZED when x-api-key header is missing", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post("/api/storyblocks")
      .send({
        projectId: "proj-xyz-789",
        blocks: [
          {
            index: 1,
            title: "Test",
            content: "Content",
            dialogue: "",
            happenedAt: 1736935200000,
            isNotable: false,
          },
        ],
      });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(res.body.error).toMatch(/api key/i);
  });

  it("returns UNAUTHORIZED when x-api-key header is wrong", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post("/api/storyblocks")
      .set("x-api-key", "wrong-key")
      .send({
        projectId: "proj-xyz-789",
        blocks: [
          {
            index: 1,
            title: "Test",
            content: "Content",
            dialogue: "",
            happenedAt: 1736935200000,
            isNotable: false,
          },
        ],
      });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("returns UNAUTHORIZED when STORYBLOCKS_API_KEY env var is not configured", async () => {
    delete process.env.STORYBLOCKS_API_KEY;

    const app = createTestApp();
    const res = await request(app)
      .post("/api/storyblocks")
      .set("x-api-key", "any-key")
      .send({
        projectId: "proj-xyz-789",
        blocks: [
          {
            index: 1,
            title: "Test",
            content: "Content",
            dialogue: "",
            happenedAt: 1736935200000,
            isNotable: false,
          },
        ],
      });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(res.body.error).toMatch(/not configured/i);
  });

  // ── Input validation ───────────────────────────────────────────────────

  it("returns BAD_REQUEST when projectId is missing", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post("/api/storyblocks")
      .set("x-api-key", API_KEY)
      .send({
        blocks: [
          {
            index: 1,
            title: "Test",
            content: "Content",
            dialogue: "",
            happenedAt: 1736935200000,
            isNotable: false,
          },
        ],
      });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("BAD_REQUEST");
  });

  it("returns BAD_REQUEST when blocks array is empty", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post("/api/storyblocks")
      .set("x-api-key", API_KEY)
      .send({
        projectId: "proj-xyz-789",
        blocks: [],
      });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("BAD_REQUEST");
  });

  it("returns BAD_REQUEST when block content is empty", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post("/api/storyblocks")
      .set("x-api-key", API_KEY)
      .send({
        projectId: "proj-xyz-789",
        blocks: [
          {
            index: 1,
            title: "Test",
            content: "",
            dialogue: "",
            happenedAt: 1736935200000,
            isNotable: false,
          },
        ],
      });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("BAD_REQUEST");
  });

  // ── Error scenarios ────────────────────────────────────────────────────

  it("returns INTERNAL_SERVER_ERROR when the database call fails", async () => {
    mockDbInsertReturning.mockRejectedValue(new Error("DB connection lost"));

    const app = createTestApp();
    const res = await request(app)
      .post("/api/storyblocks")
      .set("x-api-key", API_KEY)
      .send({
        projectId: "proj-xyz-789",
        blocks: [
          {
            index: 1,
            title: "Test",
            content: "Content",
            dialogue: "",
            happenedAt: 1736935200000,
            isNotable: false,
          },
        ],
      });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL_SERVER_ERROR");
  });

  // ── superjson edge cases ───────────────────────────────────────────────

  it("handles Date-like values in happenedAt (numeric timestamp)", async () => {
    mockDbInsertReturning.mockResolvedValue([FAKE_BLOCKS[0]]);

    const app = createTestApp();
    const res = await request(app)
      .post("/api/storyblocks")
      .set("x-api-key", API_KEY)
      .send({
        projectId: "proj-xyz-789",
        blocks: [
          {
            index: 99,
            title: "Edge Case",
            content: "Testing boundary conditions.",
            dialogue: "",
            happenedAt: 0, // epoch
            isNotable: false,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
