import { StateGraph, END, START, MemorySaver, CompiledStateGraph } from "@langchain/langgraph";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { ToolCall } from "@langchain/core/messages/tool";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { chatService } from "../services/chat-service.js";
import { ProjectRepository } from "../services/project-repository.js";
import { ToolContext } from "../lm/tools/tools.utils.js";
import { createAssistantTools } from "#shared/lm/tools/index.js";
import { IncrementAttemptHook } from "#shared/types/pipeline.types.js";
import { StructuredTool } from "@langchain/core/tools";
import { MessageRole } from "#shared/types/chat.types.js";
import { Dispatcher } from "#shared/services/dispatcher.js";

export interface ChatAgentConfig {
  conversationId: string;
  projectId: string;
  userId: string;
  storyboard?: any;
  systemPrompt?: string;
  toolContext: ToolContext<TextModelController> & {
    projectRepository: ProjectRepository;
    incrementAttempt: IncrementAttemptHook;
    dispatcher: Dispatcher;
  };
}

/** Rich message shape used inside the graph state.
 *  Extends the base { role, content } with optional fields
 *  needed to create proper LangChain ToolMessage objects. */
export interface ChatStateMessage {
  role: MessageRole;
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
}

export interface ChatAgentState {
  messages: Array<ChatStateMessage>;
  conversationId: string;
  projectId: string;
  userId: string;
  isStreaming: boolean;
  toolResults?: string[];
  /** Tool calls returned from the most recent chatNode invocation.
   *  Used by shouldUseTools and toolsNode to avoid redundant model calls. */
  rawToolCalls?: ToolCall[];
}

export type CompiledChatGraph = CompiledStateGraph<ChatAgentState, Partial<ChatAgentState>, string>;

export type ChatGraphStreamOutput = Record<string, Partial<ChatAgentState>>;

const DEFAULT_SYSTEM_PROMPT = (
  tools: StructuredTool[],
) => `You are a helpful AI assistant for Cinematic Canvas, a generative AI workspace for storytelling.
  You have read access to the project data including characters, locations, scenes, and assets.
You have access to the following tools to help users manage their cinematic projects:
${tools.map(({ name, description }) => ({ name, description }))}

When responding to users:
1. Be concise and helpful
2. Use tools when users want to create or update project entities
3. Provide context about what you're doing
4. If you don't have enough information, ask follow-up questions

`;

export class ChatAgent {
  private provider: TextModelController;
  private config: ChatAgentConfig;
  private graph: StateGraph<ChatAgentState> | null = null;
  private abortController: AbortController | null = null;
  private historyCache: Array<{ role: MessageRole; content: string }> | null = null;
  private tools: StructuredTool[] = [];

  constructor(config: ChatAgentConfig) {
    this.config = config;
    this.provider = this.config.toolContext.provider;
    this.tools = this.createTools();
  }

  private buildSystemPrompt(): string {
    const basePrompt = this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT(this.tools);

    if (!this.config.storyboard) {
      return basePrompt;
    }

    const storyboardContext = `
## Project Storyboard Context

The user's project has the following storyboard:

${JSON.stringify(this.config.storyboard, null, 2)}

Use this context to provide more informed and relevant responses about the project.`;

    return `${basePrompt}\n${storyboardContext}`;
  }

  stop(): void {
    if (this.abortController) {
      console.log({ conversationId: this.config.conversationId }, "[ChatAgent] Stop requested.");
      this.abortController.abort();
    }
  }

  private createTools(): StructuredTool[] {
    return createAssistantTools({ context: this.config.toolContext });
  }

  private createGraph(): StateGraph<ChatAgentState> {
    const graph = new StateGraph<ChatAgentState>({
      channels: {
        messages: {
          reducer: (messages: any[], update: any[]) => [...messages, ...update],
          default: () => [],
        },
        conversationId: null,
        projectId: null,
        userId: null,
        isStreaming: null,
        toolResults: null,
        rawToolCalls: {
          reducer: (_prev: any[], update: any[]) => update,
          default: () => [],
        },
      },
    });

    graph.addNode("chat", this.chatNode.bind(this));
    graph.addNode("tools", this.toolsNode.bind(this));
    graph.addEdge(START, "chat" as any);
    graph.addConditionalEdges("chat" as any, this.shouldUseTools.bind(this), {
      tools: "tools",
      end: END,
    });
    graph.addEdge("tools" as any, "chat" as any);

    return graph;
  }

  private async shouldUseTools(state: ChatAgentState): Promise<"tools" | "end"> {
    // Instead of re-invoking the model (which was already called with tools in
    // chatNode), check the state for tool calls captured from the chatNode response.
    // This avoids a redundant API call with no system prompt context.
    if (state.rawToolCalls && state.rawToolCalls.length > 0) {
      return "tools";
    }
    // Return "end" (matching the mapping key on line 131) instead of the END
    // constant ("__end__") so LangGraph can resolve the conditional edge.
    return "end";
  }

  /**
   * Maps a state message role to the correct LangChain message type.
   * Explicitly handles every MessageRole so the Google message converter
   * emits the correct parts (functionResponse for tool results, text for
   * human messages, etc.).
   */
  private toLangChainMessage(m: ChatStateMessage): HumanMessage | AIMessage | SystemMessage | ToolMessage {
    switch (m.role) {
      case "human":
        return new HumanMessage(m.content);
      case "ai":
        return new AIMessage({
          content: m.content,
          tool_calls: m.tool_calls,
        });
      case "system":
        return new SystemMessage(m.content);
      case "tool":
        // Tool messages must return as ToolMessage so the Google converter
        // emits functionResponse parts (not text parts). The tool_call_id
        // links this result to the original tool call from the AI turn.
        return new ToolMessage({
          content: m.content,
          tool_call_id: m.tool_call_id ?? "",
          name: m.name,
        });
      default:
        console.warn(`[ChatAgent] Unknown message role "${m.role}" — defaulting to HumanMessage`);
        return new HumanMessage(m.content);
    }
  }

  private async chatNode(state: ChatAgentState) {
    // Map messages using explicit role handling (not a binary human/non-human check)
    const messages = state.messages.map((m) => this.toLangChainMessage(m));

    const systemMessage = new SystemMessage(this.buildSystemPrompt());
    const modelWithTools = this.provider.bindTools(this.tools);

    const response = await modelWithTools.invoke([systemMessage, ...messages]);

    const responseContent = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

    // Capture tool calls from the model response so shouldUseTools and toolsNode
    // can use them without re-invoking the model.
    const toolCalls = response.tool_calls ?? [];

    const newMessages = state.messages.concat({
      role: "ai",
      content: responseContent,
      tool_calls: toolCalls,
    });

    return {
      messages: [newMessages[newMessages.length - 1]],
      rawToolCalls: toolCalls,
    };
  }

  private async toolsNode(state: ChatAgentState) {
    // Use the tool calls captured from chatNode's model response instead of
    // re-invoking the model — avoids a redundant API call with no context.
    const toolCalls = state.rawToolCalls ?? [];

    // Build tool result messages that the next chatNode invocation will see
    // as ToolMessage objects (via toLangChainMessage). Without these in the
    // message list, the model has no tool output context to consume and
    // produces empty/confused responses.
    const toolResultMessages: ChatStateMessage[] = [];
    for (const toolCall of toolCalls) {
      const tool = this.tools.find((t) => t.name === toolCall.name);
      if (tool) {
        const result = await tool.invoke(toolCall.args);
        toolResultMessages.push({
          role: "tool",
          content: result,
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });
      }
    }

    return {
      messages: toolResultMessages,
      toolResults: toolResultMessages.map((m) => m.content),
    };
  }

  /** Load past messages from the DB to build conversation history for the graph. */
  private async loadHistory(): Promise<Array<{ role: MessageRole; content: string }>> {
    if (this.historyCache) return this.historyCache;
    const history = await chatService.getMessages(this.config.conversationId, 50);
    this.historyCache = history.map((m) => ({
      role: m.role as MessageRole,
      content: m.content,
    }));
    return this.historyCache;
  }

  invalidateHistoryCache(): void {
    this.historyCache = null;
  }

  async *sendMessage(
    content: string,
    existingAssistantMessageId?: string,
  ): AsyncGenerator<{
    chunk: string;
    isComplete: boolean;
    messageId?: string;
  }> {
    // The caller (pipeline handler) has already saved the human message to the DB
    // via chat-router.ts — we DO NOT save it again here to avoid duplicates.
    // We just need to load the full conversation history so the graph has context.

    let assistantMessageId = existingAssistantMessageId;
    if (!assistantMessageId) {
      const assistantMessage = await chatService.addMessage(this.config.conversationId, "ai", "", this.config.userId, {
        isStreaming: true,
      });
      assistantMessageId = assistantMessage.id;
    }

    yield { chunk: "", isComplete: false, messageId: assistantMessageId };

    this.abortController = new AbortController();
    this.invalidateHistoryCache();

    // Load conversation history from DB to give the model full context
    const history = await this.loadHistory();

    const graph = this.createGraph();
    const checkpointer = new MemorySaver();
    const compiledGraph = graph.compile({ checkpointer });

    let fullResponse = "";

    try {
      // Build the initial messages from history + the new user message.
      // The tRPC router already saved the current message to the DB, so we
      // must avoid duplicating it.
      //
      // Step 1: Remove any AI messages with empty content or error content —
      // Empty messages are streaming placeholders (created by sendMessage
      // itself or by the pipeline handler) that would otherwise create gaps
      // in the conversation history and confuse the model.
      // Error messages (starting with "Error:") come from previous failed
      // graph invocations and should not be re-fed to the model.
      const cleanedHistory = history.filter(
        (m) => !(m.role === "ai" && (m.content === "" || m.content.startsWith("Error:"))),
      );

      // Step 2: If the last (non-placeholder) history entry is a human
      // message matching the current content, drop it — the explicit
      // `{ role: "human", content }` below replaces it.
      const lastHistoryEntry = cleanedHistory[cleanedHistory.length - 1];
      const historyWithoutDuplicate =
        lastHistoryEntry?.role === "human" && lastHistoryEntry.content === content
          ? cleanedHistory.slice(0, -1)
          : cleanedHistory;

      const initialMessages = [...historyWithoutDuplicate, { role: "human" as const, content }];

      const finalState: ChatAgentState = (await compiledGraph.invoke(
        {
          messages: initialMessages,
          conversationId: this.config.conversationId,
          projectId: this.config.projectId,
          userId: this.config.userId,
          isStreaming: true,
        },
        {
          configurable: { thread_id: this.config.conversationId },
          signal: this.abortController.signal,
        },
      )) as unknown as ChatAgentState;

      const aiMessages = finalState.messages.filter((m: ChatStateMessage) => m.role === "ai");
      const lastAIMsg = aiMessages[aiMessages.length - 1];
      fullResponse = lastAIMsg ? lastAIMsg.content : "";

      await chatService.updateMessage(assistantMessageId, {
        content: fullResponse,
        isComplete: true,
      });

      yield {
        chunk: fullResponse,
        isComplete: true,
        messageId: assistantMessageId,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log({ conversationId: this.config.conversationId }, "[ChatAgent] Stream aborted by user.");
        await chatService.updateMessage(assistantMessageId, {
          content: fullResponse + " [Stopped]",
          isComplete: true,
          metadata: { stopped: true },
        });
        yield {
          chunk: "[Stopped]",
          isComplete: true,
          messageId: assistantMessageId,
        };
      } else {
        const errorContent = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
        await chatService.updateMessage(assistantMessageId, {
          content: errorContent,
          isComplete: true,
          metadata: { error: true },
        });
        yield { chunk: errorContent, isComplete: true, messageId: assistantMessageId };
      }
    } finally {
      this.abortController = null;
    }
  }

  async getHistory(limit = 50) {
    return chatService.getMessages(this.config.conversationId, limit);
  }
}

export function createChatAgent(config: ChatAgentConfig): ChatAgent {
  return new ChatAgent(config);
}
