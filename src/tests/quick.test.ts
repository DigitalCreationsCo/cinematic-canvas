import { describe, it, expect, vi } from "vitest";

vi.mock("@langchain/langgraph", () => ({}));
vi.mock("@langchain/core/messages", () => ({}));
vi.mock("#shared/lm/tools/index.js", () => ({}));

describe("ChatAgent Quick Test", async () => {
  const { ChatAgent } = await import("#shared/services/chat-agent.js");
  it("should exist", () => {
    expect(ChatAgent).toBeDefined();
  });
});
