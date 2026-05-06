import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { z } from "zod";

import { IdentityBase, InsertIdentityBase } from "#shared/types/base.types.js";
import * as schema from "../db/schema.js";

export const MessageRole = z.enum(["ai", "human", "tool", "system"]);
export type MessageRole = z.infer<typeof MessageRole>;

export const Conversation = createSelectSchema(schema.conversations, {
  ...IdentityBase.shape,
  contextSummary: z.string().nullable(),
});
export type Conversation = z.infer<typeof Conversation>;

export const InsertConversation = createInsertSchema(schema.conversations, {
  ...InsertIdentityBase.shape,
  contextSummary: z.string().nullable(),
});
export type InsertConversation = z.infer<typeof InsertConversation>;

export const Message = createSelectSchema(schema.messages, {
  id: IdentityBase.shape.id,
  conversationId: z.uuid(),
  userId: z.uuid(),
  role: MessageRole,
  content: z.string(),
  isComplete: z.boolean(),
  tokenCount: z.number(),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: IdentityBase.shape.createdAt,
});
export type Message = z.infer<typeof Message>;

export const InsertMessage = createInsertSchema(schema.messages, {
  id: InsertIdentityBase.shape.id,
  conversationId: z.uuid(),
  userId: z.uuid(),
  role: MessageRole,
  content: z.string(),
  isComplete: z.boolean(),
  tokenCount: z.number(),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: IdentityBase.shape.createdAt,
});
export type InsertMessage = z.infer<typeof InsertMessage>;
