import { coerceDate, IdentityBase, ProjectRef } from '#shared/types/base.types.js';
import { z } from 'zod';
import { BaseNarrativeBlock, BaseNarrativeLore } from "narrative-engine"
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { blocks, lore } from '#shared/db/schema.js';
export { blocks, lore };

/**
 * A narrative block is a narrative unit, used by Cinematic Canvas to create scenes and develop narrative arcs.
 */
export const BlockAttributes = z.object({
  index: z.number().describe("Index of the narrative block"),
  title: z.string().describe("Title of the narrative block"),
  content: z.string().describe("Readable content of the narrative block"),
  dialogue: z.string().describe("Dialogue for the narrative block"),
  happenedAt: coerceDate.transform((date) => date.getTime()),
  isNotable: z.boolean().default(false).describe("Whether the narrative block significantly impacts the story. Only include for major plot points, discoveries, character changes, or significant story developments. Omit if it's just filler or minor events."),
});
export type BlockAttributes = z.infer<typeof BlockAttributes>;

export const BlockParseResult = z.array(BlockAttributes);
export type BlockParseResult = z.infer<typeof BlockParseResult>;

export const Block: z.ZodType<BaseNarrativeBlock> = createSelectSchema(blocks, {
  id: IdentityBase.shape.id,
  createdAt: IdentityBase.shape.createdAt,
  projectId: ProjectRef.shape.projectId,
}).extend(BlockAttributes.shape);
export type Block = z.infer<typeof Block>;

export const InsertBlock = createInsertSchema(blocks);
export type InsertBlock = z.infer<typeof InsertBlock>;



/**
 * A narrative lore is a piece of lore that informs the world backstory and narrative arcs.
 */
export const LoreAttributes = createSelectSchema(lore, {
  content: z.string().describe("Content of the narrative lore"),
  happenedAt: coerceDate.transform((date) => date.getTime()),
  isActive: z.boolean().default(false).describe("Whether this piece of lore is actively shaping the story"),
});
export type LoreAttributes = z.infer<typeof LoreAttributes>;

export const Lore: z.ZodType<BaseNarrativeLore> = createSelectSchema(lore, {
  id: IdentityBase.shape.id,
  createdAt: IdentityBase.shape.createdAt,
  projectId: ProjectRef.shape.projectId,
}).extend(LoreAttributes.shape);
export type Lore = z.infer<typeof Lore>;

export const InsertLore = createInsertSchema(lore).omit({ id: true, createdAt: true });
export type InsertLore = z.infer<typeof InsertLore>;
