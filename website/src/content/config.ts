import { defineCollection, z } from 'astro:content';

const updatesCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.union([z.string(), z.date()]),
    coverImage: z.string().optional(),
    authors: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
  }),
});

const docsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    order: z.number().optional(),
  }),
});

export const collections = {
  updates: updatesCollection,
  docs: docsCollection,
};