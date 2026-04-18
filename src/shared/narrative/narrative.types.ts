import { coerceDate } from '#shared/types/base.types.js';
import { z } from 'zod';
import { BaseNarrativeBlock, BaseNarrativeLore } from "narrative-engine"

/**
 * A narrative block is a narrative unit, used by Cinematic Canvas to create scenes and develop narrative arcs.
 */
export const NarrativeBlockAttributes = z.object({
  dialogue: z.string().describe("Dialogue for the narrative block"),
  content: z.string().describe("Content of the narrative block"),
  happenedAt: coerceDate.transform((date) => date.getTime()),
  isNotable: z.boolean().default(false).describe("Whether the narrative block significantly impacts the story. Only include for major plot points, discoveries, character changes, or significant story developments. Omit if it's just filler or minor events."),
});
export type NarrativeBlockAttributes = z.infer<typeof NarrativeBlockAttributes>;

export const NarrativeBlockParseResult = z.array(NarrativeBlockAttributes);
export type NarrativeBlockParseResult = z.infer<typeof NarrativeBlockParseResult>;

export const NarrativeBlock: z.ZodType<BaseNarrativeBlock> = NarrativeBlockAttributes.extend({
  id: z.string().describe("Unique identifier for the narrative block"),
  index: z.number().describe("Index of the narrative block"),
});
export type NarrativeBlock = z.infer<typeof NarrativeBlock>;

/**
 * A narrative lore is a piece of lore that informs the world backstory and narrative arcs.
 */
export const NarrativeLoreAttributes = z.object({
  content: z.string().describe("Content of the narrative lore"),
  happenedAt: coerceDate.transform((date) => date.getTime()),
  isActive: z.boolean().default(false).describe("Whether this piece of lore is actively shaping the story"),
});
export type NarrativeLoreAttributes = z.infer<typeof NarrativeLoreAttributes>;

export const NarrativeLore: z.ZodType<BaseNarrativeLore> = NarrativeLoreAttributes.extend({
  id: z.string().describe("Unique identifier for the narrative lore"),
  index: z.number().describe("Index of the narrative lore"),
})
