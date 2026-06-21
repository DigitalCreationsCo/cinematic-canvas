/**
 * Types for the Narrative Addressing Protocol (NAP) integration.
 *
 * These mirror the backend protocol types and are used by the napStore,
 * query hooks, and UI components (ConflictResolutionModal, GenericNode
 * dirty indicator, etc.).
 */

// ─── Entity creation ──────────────────────────────────────────────────

export type CreateEntityRequest = {
  entity_type: string;
  project_id: string;
  initial_data?: Record<string, unknown> | null;
};

export type CreateEntityResponse = {
  uri: string;
  commit_hash: string;
  entity_id: string;
};

// ─── Merge / Publish ──────────────────────────────────────────────────

export type ConflictItem = {
  path: string;
  base: unknown;
  current: unknown;
  proposed: unknown;
};

export type MergePreviewRequest = {
  uri: string;
  base_commit_hash: string;
  proposed_manifest: Record<string, unknown>;
};

export type MergePreviewResponse = {
  merged_manifest: Record<string, unknown>;
  conflicts: ConflictItem[];
};

export type PublishRequest = {
  uri: string;
  base_commit_hash: string;
  resolved_manifest: Record<string, unknown>;
};

export type PublishSuccessResponse = {
  commit_hash: string;
};

export type PublishConflictResponse = {
  detail: string;
  conflicts: ConflictItem[];
};

// ─── Diff ─────────────────────────────────────────────────────────────

export type DiffRequest = {
  uri?: string | null;
  from_commit?: string | null;
  to_commit?: string | null;
  from_manifest?: Record<string, unknown> | null;
  to_manifest?: Record<string, unknown> | null;
};

export type DiffChangeItem = {
  path: string;
  kind: "added" | "modified" | "removed";
  before: unknown;
  after: unknown;
};

export type DiffResponse = {
  changes: DiffChangeItem[];
};

// ─── Media upload ────────────────────────────────────────────────────

export type UploadMediaResponse = {
  hash: string;
};

// ─── Node-level NAP state ─────────────────────────────────────────────

/**
 * NAP-related metadata attached to each narrative node in the flow.
 * Stored alongside the core `NodeDataType` fields.
 */
export type NapNodeMeta = {
  /** The nap URI (nap://project_id/entity_type/uuid). */
  nap_uri?: string | null;
  /** The commit hash of the latest published revision. */
  nap_commit_hash?: string | null;
};

// ─── MergePreview (frontend-only state) ───────────────────────────────

export type MergePreviewState = {
  /** The URI being merged */
  uri: string;
  /** The commit hash the preview was generated against */
  baseCommitHash: string;
  /** The auto-merged manifest */
  mergedManifest: Record<string, unknown>;
  /** Fields that need user resolution */
  conflicts: ConflictItem[];
  /** Resolved choices from the user {path: value} */
  resolutions: Record<string, unknown>;
};
