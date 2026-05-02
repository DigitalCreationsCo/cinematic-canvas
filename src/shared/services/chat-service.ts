import { db } from "../db/index.js";
import { conversations, messages } from "../db/schema.js";
import { Conversation, Message, MessageRole } from "#shared/types/chat.types.js";
import { eq, desc, sql, asc } from "drizzle-orm";

export class ChatService {
  async createConversation(projectId: string, userId: string, title?: string): Promise<Conversation> {
    const [conversation] = await db
      .insert(conversations)
      .values({
        projectId,
        userId: userId,
        title: title || "New Conversation",
      })
      .returning();

    return Conversation.parse(conversation);
  }

  async getConversation(conversationId: string): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);

    return Conversation.parse(conversation);
  }

  async getConversationsForProject(projectId: string, limit = 50): Promise<Conversation[]> {
    const conversationsRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.projectId, projectId))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);

    return conversationsRows.map((c) => Conversation.parse(c));
  }

  async updateConversation(
    conversationId: string,
    updates: Partial<Pick<Conversation, "title" | "contextSummary" | "tokenCount">>,
  ): Promise<Conversation | undefined> {
    const [updated] = await db
      .update(conversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId))
      .returning();

    return Conversation.parse(updated);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await db.delete(conversations).where(eq(conversations.id, conversationId));
  }

  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    userId: string,
    metadata?: Record<string, unknown>,
  ): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values({
        conversationId,
        userId,
        role,
        content,
        isComplete: role !== "ai",
        tokenCount: 0,
        metadata: metadata || {},
      })
      .returning();

    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));

    return Message.parse(message);
  }

  async updateMessage(
    messageId: string,
    updates: Partial<Pick<Message, "content" | "isComplete" | "tokenCount" | "metadata">>,
  ): Promise<Message | undefined> {
    const [updated] = await db.update(messages).set(updates).where(eq(messages.id, messageId)).returning();

    return Message.parse(updated);
  }

  async getMessages(conversationId: string, limit = 100): Promise<Message[]> {
    const messagesRows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
      .limit(limit);

    return messagesRows.map((m) => Message.parse(m));
  }

  async getLatestMessage(conversationId: string): Promise<Message | undefined> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(1);

    return Message.parse(message);
  }

  async incrementTokenCount(conversationId: string, tokenCount: number): Promise<void> {
    await db
      .update(conversations)
      .set({
        tokenCount: sql`${conversations.tokenCount} + ${tokenCount}`,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));
  }

  async getProjectTotalTokens(projectId: string): Promise<number> {
    const result = await db
      .select({ total: conversations.tokenCount })
      .from(conversations)
      .where(eq(conversations.projectId, projectId));
    return result.reduce((sum, c) => sum + c.total, 0);
  }
}

export const chatService = new ChatService();
