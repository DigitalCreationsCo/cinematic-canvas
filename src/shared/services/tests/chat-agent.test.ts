// src/shared/services/tests/chat-agent.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for ChatAgent — stop(), sendMessage() abort flow,
// toLangChainMessage(), buildSystemPrompt(), and history management.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { ToolCall } from "@langchain/core/messages/tool";
import { ChatAgent, createChatAgent } from "#shared/services/chat-agent.js";
import type { ChatAgentConfig, ChatAgentState, ChatStateMessage } from "#shared/services/chat-agent.js";

// ── Hoisted helpers: values shared between module mocks and test body ─────

const {
  mockAddMessage,
  mockUpdateMessage,
  mockGetMessages,
  mockInvoke,
  mockBindTools,
  mockModelInvoke,
} = vi.hoisted(() => ({
  mockAddMessage: vi.fn(),
  mockUpdateMessage: vi.fn(),
  mockGetMessages: vi.fn(),
  mockInvoke: vi.fn(),
  mockBindTools: vi.fn(),
  mockModelInvoke: vi.fn(),
}));

// ── Module-level mocks ────────────────────────────────────────────────────

vi.mock("#shared/services/chat-service.js", () => ({
  chatService: {
    addMessage: mockAddMessage,
    updateMessage: mockUpdateMessage,
    getMessages: mockGetMessages,
  },
}));

vi.mock("#shared/lm/text-model-controller.js", () => ({
  TextModelController: vi.fn().mockImplementation(() => ({
    bindTools: mockBindTools,
  })),
}));

vi.mock("#shared/lm/tools/index.js", () => ({
  createAssistantTools: vi.fn().mockReturnValue([]),
}));

// Mock LangGraph so createGraph() returns a graph whose compiled.invoke
// is controlled per test via mockInvoke.
vi.mock("@langchain/langgraph", () => {
  // Must be a class (not arrow function) so it can be used with `new` as a constructor.
  return {
    StateGraph: class {
      channels: any;
      constructor(channels?: any) { this.channels = channels; }
      addNode = vi.fn().mockReturnThis();
      addEdge = vi.fn().mockReturnThis();
      addConditionalEdges = vi.fn().mockReturnThis();
      compile = vi.fn().mockReturnValue({ invoke: mockInvoke });
    },
    END: "__end__",
    START: "__start__",
    MemorySaver: vi.fn(),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────

const DEFAULT_PROJECT_ID = "proj-test-1";
const DEFAULT_USER_ID = "user-test-1";
const DEFAULT_CONVERSATION_ID = "conv-test-1";

function createMinimalConfig(overrides: Partial<ChatAgentConfig> = {}): ChatAgentConfig {
  return {
    conversationId: DEFAULT_CONVERSATION_ID,
    projectId: DEFAULT_PROJECT_ID,
    userId: DEFAULT_USER_ID,
    storyboard: undefined,
    toolContext: {
      provider: { bindTools: mockBindTools } as any,
      safetyRetries: 1,
      storageManager: {} as any,
      projectRepository: {} as any,
      console: console,
      traceId: "test-trace",
      projectId: DEFAULT_PROJECT_ID,
      incrementAttempt: vi.fn(),
    },
    ...overrides,
  };
}

/** Drain an async generator into an array of yielded values. */
async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

/** Create a DOMException-like AbortError for use in mock graph invoke. */
function abortError(): Error {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  return err;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("ChatAgent", () => {
  let agent: ChatAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: addMessage returns a valid message with an ID
    mockAddMessage.mockResolvedValue({ id: "msg-ai-1", conversationId: DEFAULT_CONVERSATION_ID });
    // Default: no history
    mockGetMessages.mockResolvedValue([]);
    // Default: bindTools returns an object whose invoke returns a response
    mockBindTools.mockReturnValue({ invoke: mockModelInvoke });
    mockModelInvoke.mockResolvedValue({
      content: "Default AI response",
      tool_calls: [],
    });

    agent = createChatAgent(createMinimalConfig());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── stop() ──────────────────────────────────────────────────────────────

  describe("stop()", () => {
    it("should abort the active AbortController when one exists", () => {
      // Arrange: simulate that sendMessage has set up an active controller
      const controller = new AbortController();
      const spyAbort = vi.spyOn(controller, "abort");
      (agent as any).abortController = controller;

      // Act
      agent.stop();

      // Assert
      expect(spyAbort).toHaveBeenCalledOnce();
      expect((agent as any).abortController).toBe(controller); // still set (nulled in finally)
    });

    it("should be safe to call when no AbortController is active", () => {
      // Arrange: ensure abortController is null
      (agent as any).abortController = null;

      // Act & Assert — should not throw
      expect(() => agent.stop()).not.toThrow();
    });

    it("should be safe to call multiple times (idempotent)", () => {
      const controller = new AbortController();
      vi.spyOn(controller, "abort");
      (agent as any).abortController = controller;

      agent.stop();
      agent.stop();
      agent.stop();

      // Each stop() calls abort() — the controller handles idempotency
      expect(controller.abort).toHaveBeenCalledTimes(3);
    });
  });

  // ── invalidateHistoryCache() ────────────────────────────────────────────

  describe("invalidateHistoryCache()", () => {
    it("should set historyCache to null when it was populated", () => {
      // Arrange
      (agent as any).historyCache = [{ role: "human", content: "hello" }];

      // Act
      agent.invalidateHistoryCache();

      // Assert
      expect((agent as any).historyCache).toBeNull();
    });

    it("should be safe to call when historyCache is already null", () => {
      (agent as any).historyCache = null;
      expect(() => agent.invalidateHistoryCache()).not.toThrow();
      expect((agent as any).historyCache).toBeNull();
    });
  });

  // ── toLangChainMessage() ────────────────────────────────────────────────

  describe("toLangChainMessage()", () => {
    function map(msg: ChatStateMessage) {
      return (agent as any).toLangChainMessage(msg);
    }

    it('should map "human" role to HumanMessage with text content', () => {
      const result = map({ role: "human", content: "Hello there!" });
      expect(result).toBeInstanceOf(HumanMessage);
      expect(result.content).toBe("Hello there!");
    });

    it('should map "ai" role to AIMessage with content and optional tool_calls', () => {
      const toolCalls: ToolCall[] = [
        { id: "call-1", name: "test_tool", args: { foo: "bar" } },
      ];
      const result = map({ role: "ai", content: "I shall use a tool.", tool_calls: toolCalls });
      expect(result).toBeInstanceOf(AIMessage);
      expect(result.content).toBe("I shall use a tool.");
      expect(result.tool_calls).toEqual(toolCalls);
    });

    it('should map "ai" role to AIMessage when no tool_calls present', () => {
      const result = map({ role: "ai", content: "Just a message." });
      expect(result).toBeInstanceOf(AIMessage);
      expect(result.content).toBe("Just a message.");
      // AIMessage defaults tool_calls to [] when not provided
      expect(result.tool_calls).toEqual([]);
    });

    it('should map "system" role to SystemMessage', () => {
      const result = map({ role: "system", content: "You are a helpful assistant." });
      expect(result).toBeInstanceOf(SystemMessage);
      expect(result.content).toBe("You are a helpful assistant.");
    });

    it('should map "tool" role to ToolMessage with tool_call_id and name', () => {
      const result = map({
        role: "tool",
        content: '{"result": "ok"}',
        tool_call_id: "call-1",
        name: "test_tool",
      });
      expect(result).toBeInstanceOf(ToolMessage);
      expect(result.content).toBe('{"result": "ok"}');
      expect(result.tool_call_id).toBe("call-1");
      expect(result.name).toBe("test_tool");
    });

    it('should fall back to HumanMessage for unknown roles', () => {
      const result = map({ role: "unknown_role" as any, content: "fallback" });
      expect(result).toBeInstanceOf(HumanMessage);
      expect(result.content).toBe("fallback");
    });

    it('should handle tool messages with missing optional fields gracefully', () => {
      const result = map({ role: "tool", content: "result", tool_call_id: undefined, name: undefined });
      expect(result).toBeInstanceOf(ToolMessage);
      expect(result.tool_call_id).toBe(""); // defaults to ""
      expect(result.name).toBeUndefined();
    });
  });

  // ── buildSystemPrompt() ─────────────────────────────────────────────────

  describe("buildSystemPrompt()", () => {
    it("should return the default prompt when no storyboard is configured", () => {
      const prompt: string = (agent as any).buildSystemPrompt();
      expect(prompt).toContain("You are a helpful AI assistant for Cinematic Canvas");
      expect(prompt).not.toContain("Project Storyboard Context");
    });

    it("should append storyboard context when a storyboard is provided", () => {
      const storyboard = { title: "Test Story", logline: "A test story." };
      const agentWithStoryboard = createChatAgent(createMinimalConfig({ storyboard }));
      const prompt: string = (agentWithStoryboard as any).buildSystemPrompt();
      expect(prompt).toContain("Project Storyboard Context");
      expect(prompt).toContain('"title": "Test Story"');
      expect(prompt).toContain('"logline": "A test story."');
    });

    it("should keep the base prompt intact when storyboard is provided", () => {
      const storyboard = { title: "Test" };
      const agentWithStoryboard = createChatAgent(createMinimalConfig({ storyboard }));
      const prompt: string = (agentWithStoryboard as any).buildSystemPrompt();
      // Base prompt should still be present
      expect(prompt).toContain("You are a helpful AI assistant for Cinematic Canvas");
      // Storyboard context appended after base
      expect(prompt.indexOf("You are a helpful")).toBeLessThan(prompt.indexOf("Project Storyboard Context"));
    });

    it("should use custom systemPrompt when provided in config", () => {
      const customPrompt = "Custom system prompt for testing.";
      const agentCustom = createChatAgent(createMinimalConfig({ systemPrompt: customPrompt }));
      const prompt: string = (agentCustom as any).buildSystemPrompt();
      expect(prompt).toContain(customPrompt);
      expect(prompt).not.toContain("Cinematic Canvas");
    });
  });

  // ── sendMessage() — abort flow ──────────────────────────────────────────

  describe("sendMessage() — abort handling", () => {
    beforeEach(() => {
      // By default the graph invoke hangs indefinitely until aborted.
      mockInvoke.mockImplementation(async (_state: ChatAgentState, config: any) => {
        const { signal } = config;
        return new Promise((_resolve, reject) => {
          if (signal.aborted) {
            reject(abortError());
            return;
          }
          signal.addEventListener(
            "abort",
            () => reject(abortError()),
            { once: true },
          );
        });
      });
    });

    it("should yield an initial chunk with messageId and isComplete=false", async () => {
      mockAddMessage.mockResolvedValue({ id: "msg-start-1", conversationId: DEFAULT_CONVERSATION_ID });

      // Make the graph invoke resolve immediately so the generator doesn't hang
      mockInvoke.mockResolvedValue({
        messages: [{ role: "ai", content: "Response" }],
      });

      const chunks = await collect(agent.sendMessage("hello"));

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0].chunk).toBe("");
      expect(chunks[0].isComplete).toBe(false);
      expect(chunks[0].messageId).toBe("msg-start-1");
    });

    it("should create an assistant message in the DB on start", async () => {
      mockAddMessage.mockResolvedValue({ id: "msg-created-1" });
      mockInvoke.mockResolvedValue({
        messages: [{ role: "ai", content: "Final response" }],
      });

      await collect(agent.sendMessage("hello"));

      expect(mockAddMessage).toHaveBeenCalledWith(
        DEFAULT_CONVERSATION_ID,
        "ai",
        "",
        DEFAULT_USER_ID,
        { isStreaming: true },
      );
    });

    it("should yield [Stopped] with isComplete=true when stop() is called mid-stream", async () => {
      mockAddMessage.mockResolvedValue({ id: "msg-aborted-1" });

      // Use the long-running invoke mock that waits for abort
      const gen = agent.sendMessage("hello");

      // First chunk — message ID
      const first = await gen.next();
      expect(first.value.isComplete).toBe(false);
      expect(first.value.messageId).toBe("msg-aborted-1");

      // Resume the generator — this enters the graph invoke which hangs
      const secondPromise = gen.next();

      // Call stop() while the graph invoke is pending
      agent.stop();

      // The generator should now yield [Stopped]
      const second = await secondPromise;
      expect(second.value.chunk).toBe("[Stopped]");
      expect(second.value.isComplete).toBe(true);

      // Generator should be done after the final yield
      const third = await gen.next();
      expect(third.done).toBe(true);
    });

    it("should update the assistant message with [Stopped] content in the DB on abort", async () => {
      mockAddMessage.mockResolvedValue({ id: "msg-db-update-1" });

      const gen = agent.sendMessage("hello");
      await gen.next();
      const secondPromise = gen.next();
      agent.stop();
      await secondPromise;

      expect(mockUpdateMessage).toHaveBeenCalledWith(
        "msg-db-update-1",
        expect.objectContaining({
          content: expect.stringContaining("[Stopped]"),
          isComplete: true,
          metadata: { stopped: true },
        }),
      );
    });

    it("should set abortController to null in the finally block after abort", async () => {
      mockAddMessage.mockResolvedValue({ id: "msg-cleanup-1" });

      const gen = agent.sendMessage("hello");
      await gen.next();
      const secondPromise = gen.next();
      // The abortController should be set during the graph invoke
      expect((agent as any).abortController).toBeInstanceOf(AbortController);
      agent.stop();
      await secondPromise;
      // Yield [Stopped] received — now resume one more time to exit the
      // catch block and trigger the finally block where abortController is nulled.
      await gen.next();

      // After the generator fully completes, abortController should be null
      expect((agent as any).abortController).toBeNull();
    });

    it("should handle a non-AbortError by yielding the error message", async () => {
      mockAddMessage.mockResolvedValue({ id: "msg-error-1" });

      const errorMsg = "Model API failure";
      mockInvoke.mockRejectedValue(new Error(errorMsg));

      const chunks = await collect(agent.sendMessage("hello"));

      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.chunk).toBe(`Error: ${errorMsg}`);
      expect(lastChunk.isComplete).toBe(true);

      expect(mockUpdateMessage).toHaveBeenCalledWith(
        "msg-error-1",
        expect.objectContaining({
          content: `Error: ${errorMsg}`,
          isComplete: true,
          metadata: { error: true },
        }),
      );
    });

    it("should update the assistant message with full content on successful completion", async () => {
      const fullResponse = "This is the complete AI response.";
      mockInvoke.mockResolvedValue({
        messages: [
          { role: "ai", content: "Intermediate thought" },
          { role: "ai", content: fullResponse },
        ],
      });

      await collect(agent.sendMessage("hello"));

      expect(mockUpdateMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          content: fullResponse,
          isComplete: true,
        }),
      );
    });
  });

  // ── sendMessage() — history management ──────────────────────────────────

  describe("sendMessage() — history de-duplication", () => {
    beforeEach(() => {
      mockAddMessage.mockResolvedValue({ id: "msg-history-1" });
    });

    it("should filter out empty AI messages from history", async () => {
      // Simulate history with an empty AI placeholder (from a previous streaming start)
      mockGetMessages.mockResolvedValue([
        { id: "h1", conversationId: DEFAULT_CONVERSATION_ID, userId: DEFAULT_USER_ID,
          role: "human", content: "Hello", isComplete: true, tokenCount: 0, metadata: {}, createdAt: new Date() },
        { id: "h2", conversationId: DEFAULT_CONVERSATION_ID, userId: DEFAULT_USER_ID,
          role: "ai", content: "", isComplete: false, tokenCount: 0, metadata: {}, createdAt: new Date() },
      ]);

      mockInvoke.mockResolvedValue({
        messages: [{ role: "ai", content: "Hi there!" }],
      });

      await collect(agent.sendMessage("Hello"));

      // The graph invoke should receive only 1 human message (the empty AI filtered out,
      // and the duplicate human message also handled)
      const invokeArg = mockInvoke.mock.calls[0][0] as ChatAgentState;
      const aiMessages = invokeArg.messages.filter((m: ChatStateMessage) => m.role === "ai");
      expect(aiMessages).toHaveLength(0);
    });

    it("should filter out Error: prefixed AI messages from history", async () => {
      mockGetMessages.mockResolvedValue([
        { id: "h1", conversationId: DEFAULT_CONVERSATION_ID, userId: DEFAULT_USER_ID,
          role: "human", content: "Hello", isComplete: true, tokenCount: 0, metadata: {}, createdAt: new Date() },
        { id: "h2", conversationId: DEFAULT_CONVERSATION_ID, userId: DEFAULT_USER_ID,
          role: "ai", content: "Error: Something went wrong", isComplete: true, tokenCount: 0,
          metadata: { error: true }, createdAt: new Date() },
      ]);

      mockInvoke.mockResolvedValue({
        messages: [{ role: "ai", content: "Let me try again." }],
      });

      await collect(agent.sendMessage("Hello"));

      const invokeArg = mockInvoke.mock.calls[0][0] as ChatAgentState;
      const aiMessages = invokeArg.messages.filter((m: ChatStateMessage) => m.role === "ai");
      // The Error: message should be filtered out
      expect(aiMessages).toHaveLength(0);
    });

    it("should deduplicate the last human message if it matches current content", async () => {
      // History already has a human message matching what we're sending
      mockGetMessages.mockResolvedValue([
        { id: "h1", conversationId: DEFAULT_CONVERSATION_ID, userId: DEFAULT_USER_ID,
          role: "human", content: "Hello", isComplete: true, tokenCount: 0, metadata: {}, createdAt: new Date() },
      ]);

      mockInvoke.mockResolvedValue({
        messages: [{ role: "ai", content: "Hi!" }],
      });

      await collect(agent.sendMessage("Hello"));

      const invokeArg = mockInvoke.mock.calls[0][0] as ChatAgentState;
      const humanMessages = invokeArg.messages.filter((m: ChatStateMessage) => m.role === "human");
      // Should have exactly 1 human message (the duplicate was removed)
      expect(humanMessages).toHaveLength(1);
      expect(humanMessages[0].content).toBe("Hello");
    });

    it("should keep the last human message if it differs from current content", async () => {
      mockGetMessages.mockResolvedValue([
        { id: "h1", conversationId: DEFAULT_CONVERSATION_ID, userId: DEFAULT_USER_ID,
          role: "human", content: "Previous question", isComplete: true, tokenCount: 0, metadata: {}, createdAt: new Date() },
      ]);

      mockInvoke.mockResolvedValue({
        messages: [{ role: "ai", content: "Answer to new question" }],
      });

      await collect(agent.sendMessage("New question"));

      const invokeArg = mockInvoke.mock.calls[0][0] as ChatAgentState;
      const humanMessages = invokeArg.messages.filter((m: ChatStateMessage) => m.role === "human");
      expect(humanMessages).toHaveLength(2); // previous + new
    });

    it("should preserve non-empty, non-error AI messages in history", async () => {
      mockGetMessages.mockResolvedValue([
        { id: "h1", conversationId: DEFAULT_CONVERSATION_ID, userId: DEFAULT_USER_ID,
          role: "human", content: "Hello", isComplete: true, tokenCount: 0, metadata: {}, createdAt: new Date() },
        { id: "h2", conversationId: DEFAULT_CONVERSATION_ID, userId: DEFAULT_USER_ID,
          role: "ai", content: "Valid previous response", isComplete: true, tokenCount: 0, metadata: {}, createdAt: new Date() },
      ]);

      mockInvoke.mockResolvedValue({
        messages: [{ role: "ai", content: "New response" }],
      });

      await collect(agent.sendMessage("Follow-up"));

      const invokeArg = mockInvoke.mock.calls[0][0] as ChatAgentState;
      const aiMessages = invokeArg.messages.filter((m: ChatStateMessage) => m.role === "ai");
      expect(aiMessages).toHaveLength(1);
      expect(aiMessages[0].content).toBe("Valid previous response");
    });
  });

  // ── sendMessage() — lifecycle ───────────────────────────────────────────

  describe("sendMessage() — lifecycle", () => {
    it("should invalidate the history cache on each call", async () => {
      mockAddMessage.mockResolvedValue({ id: "msg-lifecycle-1" });
      mockInvoke.mockResolvedValue({
        messages: [{ role: "ai", content: "Response" }],
      });

      const spyInvalidate = vi.spyOn(agent, "invalidateHistoryCache");

      await collect(agent.sendMessage("hello"));

      expect(spyInvalidate).toHaveBeenCalledOnce();
    });

    it("should create a new AbortController on each invocation", async () => {
      mockAddMessage.mockResolvedValue({ id: "msg-lifecycle-2" });
      mockInvoke.mockResolvedValue({
        messages: [{ role: "ai", content: "Response" }],
      });
      mockGetMessages.mockResolvedValue([]);

      const firstController = (agent as any).abortController;
      expect(firstController).toBeNull();

      await collect(agent.sendMessage("first"));

      // After completion, controller should be nulled
      expect((agent as any).abortController).toBeNull();

      // Second call creates a new controller
      await collect(agent.sendMessage("second"));
      expect((agent as any).abortController).toBeNull();
    });

    it("should be able to send another message after an abort", async () => {
      // First call — aborted mid-stream via agent.stop()
      mockAddMessage.mockResolvedValue({ id: "msg-after-abort-1" });
      mockInvoke.mockImplementation(async (_state: ChatAgentState, config: any) => {
        const { signal } = config;
        return new Promise((_resolve, reject) => {
          if (signal.aborted) { reject(abortError()); return; }
          signal.addEventListener("abort", () => reject(abortError()), { once: true });
        });
      });

      const gen1 = agent.sendMessage("first message");
      await gen1.next();
      const second1 = gen1.next();
      agent.stop();
      await second1;
      // Drain the rest of the first generator so the finally block runs
      // and abortController is nulled before starting a second message.
      await gen1.next();

      // Second call — should succeed normally.
      // Reset mockInvoke to avoid lingering old implementation.
      mockInvoke.mockReset();
      mockAddMessage.mockReset();
      mockAddMessage.mockResolvedValue({ id: "msg-after-abort-2" });
      mockInvoke.mockResolvedValue({
        messages: [{ role: "ai", content: "Response after abort" }],
      });
      mockGetMessages.mockResolvedValue([]);

      const gen2 = agent.sendMessage("second message");
      const chunks = await collect(gen2);

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.chunk).toBe("Response after abort");
      expect(lastChunk.isComplete).toBe(true);
    });

    it("should use the existing assistant message ID when provided", async () => {
      mockInvoke.mockResolvedValue({
        messages: [{ role: "ai", content: "Response with existing ID" }],
      });

      const gen = agent.sendMessage("hello", "existing-msg-id");
      const chunks = await collect(gen);

      // The first chunk should use the provided message ID
      expect(chunks[0].messageId).toBe("existing-msg-id");
      // addMessage should NOT be called since existingAssistantMessageId was provided
      expect(mockAddMessage).not.toHaveBeenCalled();
    });
  });

  // ── getHistory() ────────────────────────────────────────────────────────

  describe("getHistory()", () => {
    it("should delegate to chatService.getMessages with the conversation ID", async () => {
      const fakeMessages = [
        { id: "m1", content: "hello", role: "human" },
        { id: "m2", content: "hi", role: "ai" },
      ];
      mockGetMessages.mockResolvedValue(fakeMessages);

      const result = await agent.getHistory(10);
      expect(mockGetMessages).toHaveBeenCalledWith(DEFAULT_CONVERSATION_ID, 10);
      expect(result).toEqual(fakeMessages);
    });

    it("should use the default limit of 50 when none is provided", async () => {
      mockGetMessages.mockResolvedValue([]);

      await agent.getHistory();
      expect(mockGetMessages).toHaveBeenCalledWith(DEFAULT_CONVERSATION_ID, 50);
    });
  });

  // ── createChatAgent() factory ───────────────────────────────────────────

  describe("createChatAgent()", () => {
    it("should return a ChatAgent instance with the correct config", () => {
      const config = createMinimalConfig();
      const instance = createChatAgent(config);
      expect(instance).toBeInstanceOf(ChatAgent);
      expect((instance as any).config.conversationId).toBe(DEFAULT_CONVERSATION_ID);
      expect((instance as any).config.projectId).toBe(DEFAULT_PROJECT_ID);
    });
  });
});
