// src/shared/types/mention.types.ts
// TypeScript interfaces and Zod schemas for Entity Mention System
import { EntityMentionableType } from "#shared/types/entity.types.js";
import { z } from "zod";

export const MentionScope = z.enum(["project", "world"]);
export type MentionScope = z.infer<typeof MentionScope>;

/**
 * Represents an entity mention span in HTML (rendered as <span>)
 */
export const MentionSpan = z.object({
  handle: z.string().min(1).max(64, "Handle must be 64 characters or less"),
  entityId: z.string().uuid("Entity ID must be a valid UUID"),
  entityType: EntityMentionableType,
});
export type MentionSpan = z.infer<typeof MentionSpan>;

/**
 * Tag registry entry stored in database
 */
export const TagRegistryEntry = z.object({
  handle: z.string().min(1).max(64),
  characterId: z.uuid().optional(),
  locationId: z.uuid().optional(),
  propId: z.uuid().optional(),
  entityType: EntityMentionableType,
  worldId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});
export type TagRegistryEntry = z.infer<typeof TagRegistryEntry>;

/**
 * Input for registering a new handle
 */
export const RegisterHandleInput = z.object({
  handle: z
    .string()
    .min(1, "Handle cannot be empty")
    .max(64, "Handle must be 64 characters or less")
    .regex(/^@?[a-zA-Z0-9_]+$/, "Handle can only contain alphanumeric characters and underscores"),
  entityId: z.uuid(),
  entityType: EntityMentionableType,
  worldId: z.uuid().optional(),
  projectId: z.uuid().optional(),
});
export type RegisterHandleInput = z.infer<typeof RegisterHandleInput>;

// =============================================================================
// API REQUEST/RESPONSE SCHEMAS
// =============================================================================

/**
 * Request payload for mention resolution API (hydration)
 */
export const ResolveMentionsRequest = z.object({
  htmlInput: z.string().describe("Raw HTML from Tiptap editor with mention spans"),
  projectId: z.uuid().describe("Current project context"),
  options: z
    .object({
      includeUnauthorized: z.boolean().default(false),
    })
    .optional(),
});
export type ResolveMentionsRequest = z.infer<typeof ResolveMentionsRequest>;

/**
 * Response from mention resolution (KBHydrator output)
 */
export const ResolveMentionsResponse = z.object({
  success: z.boolean(),
  prompt: z.string().nullable().describe("Hydrated LLM-ready prompt"),
  unauthorizedHandles: z.array(z.string()).describe("Fair Use handles (no RAG injection)"),
  errors: z.array(z.string()).describe("Resolution failures"),
  metadata: z.object({
    resolvedCount: z.number().describe("Number of successfully resolved handles"),
    unauthorizedCount: z.number().describe("Number of unauthorized handles"),
    processingTimeMs: z.number().describe("Server-side processing time"),
  }),
});
export type ResolveMentionsResponse = z.infer<typeof ResolveMentionsResponse>;

/**
 * Request for autocomplete suggestions
 */
export const SuggestMentionsRequest = z.object({
  query: z.string().min(0).max(64),
  projectId: z.uuid(),
  limit: z.coerce.number().int().positive().max(50).default(10),
});
export type SuggestMentionsRequest = z.infer<typeof SuggestMentionsRequest>;

/**
 * Suggestion item for mention popover (client-side display)
 */
export const MentionSuggestion = z.object({
  handle: z.string().describe("The @handle with or without @ prefix"),
  displayName: z.string().describe("Human-readable name for display"),
  entityType: EntityMentionableType,
  avatarUrl: z.url().optional().describe("Visual seed image URL"),
  scope: MentionScope.describe("project or world-scoped entity"),
  isOrphaned: z.boolean().default(false).describe("Entity was deleted but mention remains"),
});
export type MentionSuggestion = z.infer<typeof MentionSuggestion>;

/**
 * Response for autocomplete suggestions
 */
export const SuggestMentionsResponse = z.object({
  suggestions: z.array(MentionSuggestion),
  totalAvailable: z.number().describe("Total entities available in scope"),
});
export type SuggestMentionsResponse = z.infer<typeof SuggestMentionsResponse>;

// =============================================================================
// WORLD ACCESS (RBAC)
// =============================================================================

export type RbacRole = "owner" | "editor" | "collaborator" | "viewer" | "licensed_creator";

export interface WorldAccessContext {
  readonly userId: string;
  readonly projectId: string;
  readonly worldId?: string;
  readonly userRole: RbacRole;
  readonly licenseType?: string;
}
