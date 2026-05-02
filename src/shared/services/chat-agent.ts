import {
  StateGraph,
  END,
  START,
  MemorySaver,
  CompiledStateGraph,
} from "@langchain/langgraph";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { chatService } from "../services/chat-service.js";
import { ProjectRepository } from "../services/project-repository.js";
import { ToolContext } from "../lm/tools/tools.utils.js";
import { createAssistantTools } from "#shared/lm/tools/index.js";
import { IncrementAttemptHook } from "#shared/types/pipeline.types.js";
import { StructuredTool } from "@langchain/core/tools";
import { MessageRole } from "#shared/types/chat.types.js";

export interface ChatAgentConfig {
  conversationId: string;
  projectId: string;
  userId: string;
  storyboard?: any;
  systemPrompt?: string;
  toolContext: ToolContext<TextModelController> & {
    projectRepository: ProjectRepository;
    incrementAttempt: IncrementAttemptHook;
  };
}

export interface ChatAgentState {
  messages: Array<{ role: MessageRole; content: string }>;
  conversationId: string;
  projectId: string;
  userId: string;
  isStreaming: boolean;
  toolResults?: string[];
}

export type CompiledChatGraph = CompiledStateGraph<
  ChatAgentState,
  Partial<ChatAgentState>,
  string
>;

export type ChatGraphStreamOutput = Record<string, Partial<ChatAgentState>>;

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant for Cinematic Canvas, a generative AI workspace for storytelling.

You have access to tools that can help users manage their cinematic projects:
- insert_entities: Save character, location, prop, and scene information to the project database

When responding to users:
1. Be concise and helpful
2. Use tools when users want to create or update project entities
3. Provide context about what you're doing
4. If you don't have enough information, ask follow-up questions

You have read access to the project data including characters, locations, scenes, and assets.`;

export class ChatAgent {
  private provider: TextModelController;
  private config: ChatAgentConfig;
  private graph: StateGraph<ChatAgentState> | null = null;
  private abortController: AbortController | null = null;

  constructor(config: ChatAgentConfig) {
    this.config = config;
    this.provider = this.config.toolContext.provider;
  }

  private buildSystemPrompt(): string {
    const basePrompt = this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT;

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
      console.log(
        { conversationId: this.config.conversationId },
        "[ChatAgent] Stop requested.",
      );
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
      },
    });

    graph.addNode("chat", this.chatNode.bind(this));
    graph.addNode("tools", this.toolsNode.bind(this));
    graph.addEdge(START, "chat" as any);
    graph.addConditionalEdges("chat" as any, this.shouldUseTools.bind(this), {
      tools: "tools",
      end: END,
    } as any);
    graph.addEdge("tools" as any, "chat" as any);

    return graph;
  }

  private async shouldUseTools(
    state: ChatAgentState,
  ): Promise<"tools" | "end"> {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage) return "end";

    const modelWithTools = this.provider.bindTools(this.createTools());
    const response = await modelWithTools.invoke([
      new HumanMessage(lastMessage.content),
    ]);

    const hasToolCall = response.tool_calls && response.tool_calls.length > 0;
    return hasToolCall ? "tools" : "end";
  }

  private async chatNode(state: ChatAgentState) {
    const messages = state.messages.map((m) =>
      m.role === "human"
        ? new HumanMessage(m.content)
        : new AIMessage(m.content),
    );

    const systemMessage = new SystemMessage(this.buildSystemPrompt());
    const modelWithTools = this.provider.bindTools(this.createTools());

    const response = await modelWithTools.invoke([systemMessage, ...messages]);

    const newMessages = state.messages.concat({
      role: "ai",
      content:
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content),
    });

    return { messages: [newMessages[newMessages.length - 1]] };
  }

  private async toolsNode(state: ChatAgentState) {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage) return { toolResults: [] };

    const modelWithTools = this.provider.bindTools(this.createTools());
    const response = await modelWithTools.invoke([
      new HumanMessage(lastMessage.content),
    ]);

    let toolResults: string[] = [];
    if (response.tool_calls) {
      for (const toolCall of response.tool_calls) {
        const tool = this.createTools().find((t) => t.name === toolCall.name);
        if (tool) {
          const result = await tool.invoke(toolCall.args);
          toolResults.push(result);
        }
      }
    }

    return { toolResults };
  }

  async *sendMessage(
    content: string,
    existingAssistantMessageId?: string,
  ): AsyncGenerator<{
    chunk: string;
    isComplete: boolean;
    messageId?: string;
  }> {
    const userMessage = await chatService.addMessage(
      this.config.conversationId,
      "human",
      content,
      this.config.userId,
    );

    await chatService.updateMessage(userMessage.id, { isComplete: true });

    let assistantMessageId = existingAssistantMessageId;
    if (!assistantMessageId) {
      const assistantMessage = await chatService.addMessage(
        this.config.conversationId,
        "ai",
        "",
        this.config.userId,
        {
          isStreaming: true,
        },
      );
      assistantMessageId = assistantMessage.id;
    }

    yield { chunk: "", isComplete: false, messageId: assistantMessageId };

    this.abortController = new AbortController();
    const graph = this.createGraph();
    const checkpointer = new MemorySaver();
    const compiledGraph = graph.compile({ checkpointer });

    let fullResponse = "";

    try {
      const stream = await compiledGraph.stream(
        {
          messages: [{ role: "user", content }],
          conversationId: this.config.conversationId,
          projectId: this.config.projectId,
          userId: this.config.userId,
          isStreaming: true,
        },
        {
          configurable: { thread_id: this.config.conversationId },
          signal: this.abortController.signal,
        },
      );

      for await (const chunk of stream) {
        const nodeUpdate = chunk as ChatGraphStreamOutput;
        if (nodeUpdate.chat?.messages) {
          const lastMsg =
            nodeUpdate.chat.messages[nodeUpdate.chat.messages.length - 1];
          if (lastMsg) {
            const newContent = lastMsg.content || "";
            if (newContent.startsWith(fullResponse)) {
              const delta = newContent.slice(fullResponse.length);
              fullResponse = newContent;
              yield {
                chunk: delta,
                isComplete: false,
                messageId: assistantMessageId,
              };
            }
          }
        }
      }

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
        console.log(
          { conversationId: this.config.conversationId },
          "[ChatAgent] Stream aborted by user.",
        );
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
        await chatService.updateMessage(assistantMessageId, {
          content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          isComplete: true,
          metadata: { error: true },
        });
        yield { chunk: "", isComplete: true, messageId: assistantMessageId };
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
