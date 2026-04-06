// src/shared/types/mention.types.ts
// TypeScript interfaces and Zod schemas for Entity Mention System

import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const EntityTypeSchema = z.enum(['character', 'location', 'prop']);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const MentionScopeSchema = z.enum(['project', 'world']);
export type MentionScope = z.infer<typeof MentionScopeSchema>;

// =============================================================================
// CORE SCHEMAS
// =============================================================================

/**
 * Represents an entity mention span in HTML (rendered as <span>)
 */
export const MentionSpanSchema = z.object({
  handle: z.string().min(1).max(64, 'Handle must be 64 characters or less'),
  entityId: z.string().uuid('Entity ID must be a valid UUID'),
  entityType: EntityTypeSchema,
});
export type MentionSpan = z.infer<typeof MentionSpanSchema>;

/**
 * Tag registry entry stored in database
 */
export const TagRegistryEntrySchema = z.object({
  handle: z.string().min(1).max(64),
  characterId: z.uuid().optional(),
  locationId: z.uuid().optional(),
  propId: z.uuid().optional(),
  entityType: EntityTypeSchema,
  worldId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});
export type TagRegistryEntry = z.infer<typeof TagRegistryEntrySchema>;

/**
 * Input for registering a new handle
 */
export const RegisterHandleInputSchema = z.object({
  handle: z.string()
    .min(1, 'Handle cannot be empty')
    .max(64, 'Handle must be 64 characters or less')
    .regex(/^@?[a-zA-Z0-9_]+$/, 'Handle can only contain alphanumeric characters and underscores'),
  entityId: z.string().uuid(),
  entityType: EntityTypeSchema,
  worldId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
});
export type RegisterHandleInput = z.infer<typeof RegisterHandleInputSchema>;

// =============================================================================
// API REQUEST/RESPONSE SCHEMAS
// =============================================================================

/**
 * Request payload for mention resolution API (hydration)
 */
export const ResolveMentionsRequestSchema = z.object({
  htmlInput: z.string().describe('Raw HTML from Tiptap editor with mention spans'),
  projectId: z.string().uuid().describe('Current project context'),
  options: z.object({
    includeUnauthorized: z.boolean().default(false),
  }).optional(),
});
export type ResolveMentionsRequest = z.infer<typeof ResolveMentionsRequestSchema>;

/**
 * Response from mention resolution (KBHydrator output)
 */
export const ResolveMentionsResponseSchema = z.object({
  success: z.boolean(),
  prompt: z.string().nullable().describe('Hydrated LLM-ready prompt'),
  unauthorizedHandles: z.array(z.string()).describe('Fair Use handles (no RAG injection)'),
  errors: z.array(z.string()).describe('Resolution failures'),
  metadata: z.object({
    resolvedCount: z.number().describe('Number of successfully resolved handles'),
    unauthorizedCount: z.number().describe('Number of unauthorized handles'),
    processingTimeMs: z.number().describe('Server-side processing time'),
  }),
});
export type ResolveMentionsResponse = z.infer<typeof ResolveMentionsResponseSchema>;

/**
 * Request for autocomplete suggestions
 */
export const SuggestMentionsRequestSchema = z.object({
  query: z.string().min(0).max(64),
  projectId: z.uuid(),
  limit: z.coerce.number().int().positive().max(50).default(10),
});
export type SuggestMentionsRequest = z.infer<typeof SuggestMentionsRequestSchema>;

/**
 * Suggestion item for mention popover (client-side display)
 */
export const MentionSuggestionSchema = z.object({
  handle: z.string().describe('The @handle with or without @ prefix'),
  displayName: z.string().describe('Human-readable name for display'),
  entityType: EntityTypeSchema,
  avatarUrl: z.string().url().optional().describe('Visual seed image URL'),
  scope: MentionScopeSchema.describe('project or world-scoped entity'),
  isOrphaned: z.boolean().default(false).describe('Entity was deleted but mention remains'),
});
export type MentionSuggestion = z.infer<typeof MentionSuggestionSchema>;

/**
 * Response for autocomplete suggestions
 */
export const SuggestMentionsResponseSchema = z.object({
  suggestions: z.array(MentionSuggestionSchema),
  totalAvailable: z.number().describe('Total entities available in scope'),
});
export type SuggestMentionsResponse = z.infer<typeof SuggestMentionsResponseSchema>;

// =============================================================================
// HYDRATION PAYLOADS (Internal)
// =============================================================================

/**
 * Hydration payload returned by repository for authorized entities
 * Used by KBHydrator to build the knowledge block
 */
export interface HydrationPayload {
  readonly handle: string;
  readonly name: string;
  readonly description: string | null;
  readonly traits: Record<string, unknown> | null;
  readonly state: Record<string, unknown> | null;
  readonly visualSeedData: string | null;
  readonly entityType: EntityType;
}

/**
 * Internal resolution result with both authorized and unauthorized handles
 */
export interface MentionsResolutionResult {
  readonly authorizedHandles: readonly string[];
  readonly unauthorizedHandles: readonly string[];
  readonly payloads: readonly HydrationPayload[];
  readonly missingPayloads: readonly string[];
}

// =============================================================================
// WORLD ACCESS (RBAC)
// =============================================================================

export type RbacRole = 'owner' | 'editor' | 'collaborator' | 'viewer' | 'licensed_creator';

export interface WorldAccessContext {
  readonly userId: string;
  readonly projectId: string;
  readonly worldId?: string;
  readonly userRole: RbacRole;
  readonly licenseType?: string;
}
