// src/shared/app-router/tests/chat-router.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for ChatRouter — stop mutation event publishing.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createChatRouter } from "../chat-router.js";

// ── Hoisted mocks ─────────────────────────────────────────────────────────

const {
  mockIsUserMemberOfTeam,
  mockPublishPipelineEvent,
} = vi.hoisted(() => ({
  mockIsUserMemberOfTeam: vi.fn(),
  mockPublishPipelineEvent: vi.fn(),
}));

// ── Module-level mocks ────────────────────────────────────────────────────

vi.mock("#shared/services/usersAndTeamsDbService.js", () => ({
  usersAndTeamsDbService: {
    isUserMemberOfTeam: mockIsUserMemberOfTeam,
  },
}));

vi.mock("#shared/services/chat-service.js", () => ({
  chatService: {
    addMessage: vi.fn().mockResolvedValue({ id: "msg-1" }),
    getConversation: vi.fn().mockResolvedValue({
      id: "conv-1",
      projectId: "proj-1",
      userId: "user-1",
      title: "Test",
      tokenCount: 0,
      contextSummary: null,
      teamId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    getMessages: vi.fn().mockResolvedValue([]),
    getConversationsForProject: vi.fn().mockResolvedValue([]),
    createConversation: vi.fn().mockResolvedValue({ id: "conv-new-1" }),
    updateConversation: vi.fn().mockResolvedValue({}),
    deleteConversation: vi.fn().mockResolvedValue({}),
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────

describe("ChatRouter stop mutation", () => {
  let router: ReturnType<typeof createChatRouter>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsUserMemberOfTeam.mockResolvedValue(true);
    router = createChatRouter({
      eventBus: { publishPipelineEvent: mockPublishPipelineEvent } as any,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should publish a CHAT_STOP event when stop mutation is called", async () => {
    const caller = router.createCaller({
      user: { id: "user-1" },
      teamId: "team-1",
      worldId: undefined,
      projectId: undefined,
      headers: {} as any,
    });

    const result = await caller.stop({ conversationId: "conv-stop-1" });

    expect(result).toEqual({ success: true });
    expect(mockPublishPipelineEvent).toHaveBeenCalledTimes(1);
    expect(mockPublishPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CHAT_STOP",
        payload: { conversationId: "conv-stop-1" },
      }),
    );
  });

  it("should include userId and teamId in the CHAT_STOP event", async () => {
    const caller = router.createCaller({
      user: { id: "user-42" },
      teamId: "team-7",
      worldId: undefined,
      projectId: undefined,
      headers: {} as any,
    });

    await caller.stop({ conversationId: "conv-1" });

    expect(mockPublishPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-42",
        teamId: "team-7",
        type: "CHAT_STOP",
      }),
    );
  });

  it("should include an ISO timestamp in the CHAT_STOP event", async () => {
    const before = Date.now();
    const caller = router.createCaller({
      user: { id: "user-1" },
      teamId: "team-1",
      worldId: undefined,
      projectId: undefined,
      headers: {} as any,
    });

    await caller.stop({ conversationId: "conv-1" });

    const eventArg = mockPublishPipelineEvent.mock.calls[0][0];
    expect(eventArg.timestamp).toBeDefined();
    const timestamp = new Date(eventArg.timestamp).getTime();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(Date.now());
  });

  it("should still succeed when eventBus is not configured (undefined)", async () => {
    const routerWithoutBus = createChatRouter({ eventBus: undefined as any });
    const caller = routerWithoutBus.createCaller({
      user: { id: "user-1" },
      teamId: "team-1",
      worldId: undefined,
      projectId: undefined,
      headers: {} as any,
    });

    const result = await caller.stop({ conversationId: "conv-1" });

    expect(result).toEqual({ success: true });
    // No event published
    expect(mockPublishPipelineEvent).not.toHaveBeenCalled();
  });

  it("should throw TRPCError when event bus publish fails", async () => {
    mockPublishPipelineEvent.mockRejectedValue(new Error("PubSub unavailable"));

    const caller = router.createCaller({
      user: { id: "user-1" },
      teamId: "team-1",
      worldId: undefined,
      projectId: undefined,
      headers: {} as any,
    });

    await expect(caller.stop({ conversationId: "conv-1" })).rejects.toThrow();
  });

  it("should require a non-empty conversationId", async () => {
    const caller = router.createCaller({
      user: { id: "user-1" },
      teamId: "team-1",
      worldId: undefined,
      projectId: undefined,
      headers: {} as any,
    });

    // @ts-expect-error — testing input validation
    await expect(caller.stop({})).rejects.toThrow();
    // @ts-expect-error — testing input validation
    await expect(caller.stop({ conversationId: "" })).rejects.toThrow();
  });

  it("should block unauthenticated requests (no userId)", async () => {
    const caller = router.createCaller({
      user: null,
      teamId: "team-1",
      worldId: undefined,
      projectId: undefined,
      headers: {} as any,
    });

    await expect(caller.stop({ conversationId: "conv-1" })).rejects.toThrow("UNAUTHORIZED");
  });

  it("should block requests without team context", async () => {
    const caller = router.createCaller({
      user: { id: "user-1" },
      teamId: undefined,
      worldId: undefined,
      projectId: undefined,
      headers: {} as any,
    });

    await expect(caller.stop({ conversationId: "conv-1" })).rejects.toThrow("Team ID required");
  });
});
