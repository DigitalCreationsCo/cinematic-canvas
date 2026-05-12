// src/client/src/store/tests/useChatStore.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for useChatStore — message queuing during streaming,
// stopStreaming, processQueue, and state lifecycle.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useChatStore } from "../useChatStore.js";
import type { Conversation, Message } from "#shared/types/chat.types.js";

// ── Module-level mocks ────────────────────────────────────────────────────
// NOTE: vi.hoisted() is required here because vi.mock() factories are hoisted
// above all other code. vi.hoisted() is hoisted even higher, ensuring the mock
// variables are initialized before the vi.mock() factory runs.

const mockSendMutate = vi.hoisted(() => vi.fn());
const mockStopMutate = vi.hoisted(() => vi.fn());
const mockListQuery = vi.hoisted(() => vi.fn());
const mockCreateMutate = vi.hoisted(() => vi.fn());
const mockGetQuery = vi.hoisted(() => vi.fn());
const mockAddToHistory = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockGetHistory = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("#client/lib/trpc.js", () => ({
  trpcClient: {
    chat: {
      send: { mutate: mockSendMutate },
      stop: { mutate: mockStopMutate },
      list: { query: mockListQuery },
      create: { mutate: mockCreateMutate },
      get: { query: mockGetQuery },
      messages: { query: vi.fn() },
      update: { mutate: vi.fn() },
      delete: { mutate: vi.fn() },
    },
  },
}));

vi.mock("#client/services/chatMessageHistory.js", () => ({
  addToHistory: mockAddToHistory,
  getHistory: mockGetHistory,
  clearHistory: vi.fn(),
  getAllHistory: vi.fn().mockResolvedValue([]),
}));

// ── Helpers ───────────────────────────────────────────────────────────────

const CONVERSATION_ID = "conv-test-1";
const PROJECT_ID = "proj-test-1";

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: CONVERSATION_ID,
    projectId: PROJECT_ID,
    userId: "user-test-1",
    teamId: null,
    title: "Test Conversation",
    tokenCount: 0,
    contextSummary: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Conversation;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("useChatStore — queue & stop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to initial state
    useChatStore.setState({
      conversations: [],
      currentConversation: null,
      messages: [],
      isLoading: false,
      isStreaming: false,
      streamChunk: "",
      viewMode: "events",
      messageHistory: [],
      historyIndex: -1,
      chatInputFocusTrigger: 0,
      queuedMessages: [],
    });
    // Default: send returns a valid message
    mockSendMutate.mockResolvedValue({
      message: { id: "server-msg-1", conversationId: CONVERSATION_ID },
      conversationId: CONVERSATION_ID,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── sendMessage() — queuing ─────────────────────────────────────────────

  describe("sendMessage() — queue behavior", () => {
    it("should queue a message when isStreaming is true", async () => {
      useChatStore.setState({
        currentConversation: makeConversation(),
        isStreaming: true,
        queuedMessages: [],
      });

      await useChatStore.getState().sendMessage("queued message");

      const state = useChatStore.getState();
      expect(state.queuedMessages).toEqual(["queued message"]);
      // Should NOT call the tRPC send mutation
      expect(mockSendMutate).not.toHaveBeenCalled();
    });

    it("should append to existing queued messages", async () => {
      useChatStore.setState({
        currentConversation: makeConversation(),
        isStreaming: true,
        queuedMessages: ["first"],
      });

      await useChatStore.getState().sendMessage("second");
      await useChatStore.getState().sendMessage("third");

      const state = useChatStore.getState();
      expect(state.queuedMessages).toEqual(["first", "second", "third"]);
    });

    it("should save queued messages to local history", async () => {
      useChatStore.setState({
        currentConversation: makeConversation(),
        isStreaming: true,
        queuedMessages: [],
      });

      await useChatStore.getState().sendMessage("save to history");

      expect(mockAddToHistory).toHaveBeenCalledWith(CONVERSATION_ID, "save to history");
    });

    it("should NOT add an optimistic message to the messages array when queuing", async () => {
      useChatStore.setState({
        currentConversation: makeConversation(),
        isStreaming: true,
        messages: [],
      });

      await useChatStore.getState().sendMessage("no optimistic");

      const state = useChatStore.getState();
      // No message should be added to the visible messages list while queued
      expect(state.messages).toHaveLength(0);
    });

    it("should be a no-op when there is no current conversation", async () => {
      useChatStore.setState({
        currentConversation: null,
        isStreaming: true,
        queuedMessages: [],
      });

      await useChatStore.getState().sendMessage("no conversation");
      expect(useChatStore.getState().queuedMessages).toEqual([]);
    });
  });

  // ── sendMessage() — normal flow (isStreaming = false) ──────────────────

  describe("sendMessage() — normal flow", () => {
    it("should call the tRPC send mutation with conversationId and content", async () => {
      useChatStore.setState({
        currentConversation: makeConversation(),
        isStreaming: false,
      });

      await useChatStore.getState().sendMessage("normal message");

      expect(mockSendMutate).toHaveBeenCalledWith({
        conversationId: CONVERSATION_ID,
        content: "normal message",
      });
    });

    it("should set isStreaming to true before the API call", async () => {
      // Use a deferred promise so we can check state mid-flight
      let resolveSend!: (v: unknown) => void;
      mockSendMutate.mockReturnValue(new Promise((resolve) => { resolveSend = resolve; }));

      useChatStore.setState({
        currentConversation: makeConversation(),
        isStreaming: false,
      });

      const sendPromise = useChatStore.getState().sendMessage("test");

      // isStreaming should be true before the API resolves
      expect(useChatStore.getState().isStreaming).toBe(true);

      resolveSend({ message: { id: "msg-1" }, conversationId: CONVERSATION_ID });
      await sendPromise;
    });

    it("should replace the optimistic pending message with the server-confirmed one", async () => {
      mockSendMutate.mockResolvedValue({
        message: { id: "server-msg-abc", conversationId: CONVERSATION_ID, content: "optimistic test" },
        conversationId: CONVERSATION_ID,
      });

      useChatStore.setState({
        currentConversation: makeConversation(),
        isStreaming: false,
        messages: [],
      });

      await useChatStore.getState().sendMessage("optimistic test");

      const state = useChatStore.getState();
      // Should be exactly 1 message (the original optimistic one was replaced)
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].id).toBe("server-msg-abc");
      expect(state.messages[0].content).toBe("optimistic test");
    });

    it("should set isStreaming=false on send failure and remove the pending message", async () => {
      mockSendMutate.mockRejectedValue(new Error("Network error"));

      useChatStore.setState({
        currentConversation: makeConversation(),
        isStreaming: false,
        messages: [],
      });

      await useChatStore.getState().sendMessage("will fail");

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.messages).toHaveLength(0);
    });
  });

  // ── stopStreaming() ─────────────────────────────────────────────────────

  describe("stopStreaming()", () => {
    it("should clear queued messages immediately", async () => {
      useChatStore.setState({
        currentConversation: makeConversation(),
        queuedMessages: ["queued1", "queued2"],
      });

      await useChatStore.getState().stopStreaming();

      expect(useChatStore.getState().queuedMessages).toEqual([]);
    });

    it("should call the tRPC stop mutation with the current conversation ID", async () => {
      useChatStore.setState({
        currentConversation: makeConversation(),
      });

      await useChatStore.getState().stopStreaming();

      expect(mockStopMutate).toHaveBeenCalledWith({
        conversationId: CONVERSATION_ID,
      });
    });

    it("should be a no-op when there is no current conversation", async () => {
      useChatStore.setState({ currentConversation: null });

      await useChatStore.getState().stopStreaming();

      expect(mockStopMutate).not.toHaveBeenCalled();
    });

    it("should handle tRPC mutation failure gracefully", async () => {
      mockStopMutate.mockRejectedValue(new Error("Server error"));

      useChatStore.setState({
        currentConversation: makeConversation(),
        queuedMessages: ["test"],
      });

      // Should not throw
      await expect(useChatStore.getState().stopStreaming()).resolves.not.toThrow();
      // Queue should still be cleared (optimistic)
      expect(useChatStore.getState().queuedMessages).toEqual([]);
    });

    it("should set isStreaming to false immediately so the UI returns to a responsive state", async () => {
      useChatStore.setState({
        currentConversation: makeConversation(),
        isStreaming: true,
        streamChunk: "partial response",
      });

      await useChatStore.getState().stopStreaming();

      // isStreaming must be set to false immediately — we do NOT wait for
      // the SSE round-trip (CHAT_STREAM_CHUNK isComplete). The SSE handler
      // will also set isStreaming=false when it arrives, which is idempotent.
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamChunk).toBe("");
    });
  });

  // ── processQueue() ──────────────────────────────────────────────────────

  describe("processQueue()", () => {
    it("should concatenate queued messages with double newline separator", async () => {
      useChatStore.setState({
        currentConversation: makeConversation(),
        queuedMessages: ["first message", "second message"],
        isStreaming: false,
      });

      await useChatStore.getState().processQueue();

      // The concatenated message should have been sent via sendMessage,
      // which calls the tRPC send mutation with the concatenated content
      expect(mockSendMutate).toHaveBeenCalledWith({
        conversationId: CONVERSATION_ID,
        content: "first message\n\nsecond message",
      });
    });

    it("should clear the queue after processing", async () => {
      useChatStore.setState({
        currentConversation: makeConversation(),
        queuedMessages: ["only one"],
        isStreaming: false,
      });

      await useChatStore.getState().processQueue();

      expect(useChatStore.getState().queuedMessages).toEqual([]);
    });

    it("should handle a single queued message without adding separators", async () => {
      useChatStore.setState({
        currentConversation: makeConversation(),
        queuedMessages: ["single message"],
        isStreaming: false,
      });

      await useChatStore.getState().processQueue();

      expect(mockSendMutate).toHaveBeenCalledWith({
        conversationId: CONVERSATION_ID,
        content: "single message",
      });
    });

    it("should be a no-op when the queue is empty", async () => {
      useChatStore.setState({
        currentConversation: makeConversation(),
        queuedMessages: [],
        isStreaming: false,
      });

      await useChatStore.getState().processQueue();

      expect(mockSendMutate).not.toHaveBeenCalled();
    });

    it("should handle many queued messages correctly", async () => {
      const many = Array.from({ length: 5 }, (_, i) => `message ${i + 1}`);
      useChatStore.setState({
        currentConversation: makeConversation(),
        queuedMessages: many,
        isStreaming: false,
      });

      await useChatStore.getState().processQueue();

      expect(mockSendMutate).toHaveBeenCalledWith({
        conversationId: CONVERSATION_ID,
        content: "message 1\n\nmessage 2\n\nmessage 3\n\nmessage 4\n\nmessage 5",
      });
    });
  });

  // ── State lifecycle — conversation switching ───────────────────────────

  describe("state lifecycle on conversation switch", () => {
    it("should reset queued messages and streaming state when selecting a new conversation", async () => {
      mockGetQuery.mockResolvedValue({
        conversation: makeConversation({ id: "conv-new-1" }),
        messages: [],
      });

      useChatStore.setState({
        isStreaming: true,
        streamChunk: "partial response",
        queuedMessages: ["queued while streaming"],
      });

      await useChatStore.getState().selectConversation("conv-new-1");

      const state = useChatStore.getState();
      expect(state.queuedMessages).toEqual([]);
      expect(state.isStreaming).toBe(false);
      expect(state.streamChunk).toBe("");
    });

    it("should reset all streaming state when clearing the current conversation", () => {
      useChatStore.setState({
        currentConversation: makeConversation(),
        isStreaming: true,
        streamChunk: "some streaming text",
        queuedMessages: ["q1"],
        messageHistory: ["prev msg"],
        historyIndex: 0,
      });

      useChatStore.getState().clearCurrentConversation();

      const state = useChatStore.getState();
      expect(state.currentConversation).toBeNull();
      expect(state.messages).toEqual([]);
      expect(state.isStreaming).toBe(false);
      expect(state.streamChunk).toBe("");
      expect(state.queuedMessages).toEqual([]);
      expect(state.messageHistory).toEqual([]);
      expect(state.historyIndex).toBe(-1);
    });
  });

  // ── SSE-driven queue processing integration ─────────────────────────────

  describe("SSE integration contract", () => {
    it("should set isStreaming=false and streamChunk on CHAT_STREAM_CHUNK isComplete", () => {
      // This simulates what usePipelineEvents does when it receives isComplete
      useChatStore.setState({
        isStreaming: true,
        streamChunk: "Partial response from AI ",
      });

      useChatStore.setState((state) => ({
        isStreaming: false,
        streamChunk: state.streamChunk + "[Complete]",
      }));

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamChunk).toBe("Partial response from AI [Complete]");
    });

    it("should append to streamChunk on streaming chunks", () => {
      useChatStore.setState({
        isStreaming: true,
        streamChunk: "",
      });

      // Simulate multiple chunk events
      useChatStore.setState((state) => ({
        isStreaming: true,
        streamChunk: state.streamChunk + "Hello ",
      }));
      useChatStore.setState((state) => ({
        isStreaming: true,
        streamChunk: state.streamChunk + "World ",
      }));
      useChatStore.setState((state) => ({
        isStreaming: true,
        streamChunk: state.streamChunk + "from AI",
      }));

      const state = useChatStore.getState();
      expect(state.streamChunk).toBe("Hello World from AI");
      expect(state.isStreaming).toBe(true);
    });

    it("should add a CHAT_MESSAGE to the messages list (dedup by ID)", () => {
      const msgPayload = {
        messageId: "ai-msg-1",
        conversationId: CONVERSATION_ID,
        role: "ai" as const,
        content: "Final response",
        tokenCount: 42,
        metadata: {},
      };

      useChatStore.setState((state) => {
        if (state.messages.some((m) => m.id === msgPayload.messageId)) return state;
        return {
          messages: [
            ...state.messages,
            {
              id: msgPayload.messageId,
              conversationId: msgPayload.conversationId,
              userId: "user-1",
              role: msgPayload.role,
              content: msgPayload.content,
              isComplete: true,
              tokenCount: msgPayload.tokenCount,
              metadata: msgPayload.metadata,
              createdAt: new Date(),
            },
          ],
        };
      });

      expect(useChatStore.getState().messages).toHaveLength(1);
      expect(useChatStore.getState().messages[0].id).toBe("ai-msg-1");

      // Dedup: sending the same message ID again should not duplicate
      useChatStore.setState((state) => {
        if (state.messages.some((m) => m.id === "ai-msg-1")) return state;
        return { messages: [...state.messages, {} as Message] };
      });

      expect(useChatStore.getState().messages).toHaveLength(1);
    });
  });
});
