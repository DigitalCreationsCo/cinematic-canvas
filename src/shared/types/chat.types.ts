import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { z } from "zod";

import { IdentityBase } from "#shared/types/base.types.js";
import * as schema from "../db/schema.js";

export const Conversation = createSelectSchema(schema.conversations, {
    ...IdentityBase.shape,
    contextSummary: z.string().optional(),
});
export type Conversation = z.infer<typeof Conversation>;

export const InsertConversation = createInsertSchema(schema.conversations, {
    ...IdentityBase.shape,
    contextSummary: z.string().optional(),
});
export type InsertConversation = z.infer<typeof InsertConversation>;

export const Message = createSelectSchema(schema.messages, {
    id: IdentityBase.shape.id,
    createdAt: IdentityBase.shape.createdAt,
    metadata: z.record(z.string(), z.any()).optional(),
});
export type Message = z.infer<typeof Message>;

export const InsertMessage = createInsertSchema(schema.messages, {
    id: IdentityBase.shape.id,
    createdAt: IdentityBase.shape.createdAt,
    metadata: z.record(z.string(), z.any()).optional(),
});
export type InsertMessage = z.infer<typeof InsertMessage>;