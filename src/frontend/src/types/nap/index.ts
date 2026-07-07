/**
 * Types for the Narrative Addressing Protocol (NAP) integration.
 *
 * These mirror the backend protocol types and are used by the napStore,
 * query hooks, and UI components (ConflictResolutionModal, GenericNode
 * dirty indicator, etc.).
 */

import type { FolderType } from "../../pages/MainPage/entities";

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

// ─── Repository types ────────────────────────────────────────────────

export type NapRepositoryType = "local" | "remote";

export type CreateNapRepoRequest = {
  folder_id: string;
  name: string;
  repo_type: NapRepositoryType;
  remote_url?: string | null;
};

export type NapRepositoryRead = {
  id: string;
  name: string;
  nap_uri: string | null;
  repo_type: NapRepositoryType;
  remote_url: string | null;
  entity_count: number;
  last_commit_hash: string | null;
  status: string;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type EntitySummary = {
  uri: string;
  entity_type: string;
  entity_id: string;
  commit_hash: string | null;
  updated_at: number | null;
};

export type CommitSummary = {
  uri: string;
  entity_type: string;
  entity_id: string;
  commit_hash: string;
  updated_at: number | null;
};

export type NapRepositoryDetail = NapRepositoryRead & {
  entities: EntitySummary[];
  recent_commits: CommitSummary[];
};

export type CloneNapRepoRequest = {
  repo_id: string;
  remote_url: string;
};

export type PushNapRepoRequest = {
  repo_id: string;
  remote_url: string;
};

// ─── Combined project creation ────────────────────────────────────────

export type RepositorySelection = {
  mode: "existing" | "new";
  /** Whether to link to an existing repository or create a new one. */
  repository_id?: string;
  /** The ID of an existing repository (required when mode='existing'). */
  name?: string;
  /** The name for a new repository (required when mode='new'). */
  tag?: string;
  /** Tag to pin the project to (defaults to "latest" on the backend).
   * Ignored when mode='new'. */
  branch?: string;
  /** Branch to pin the project to when mode='existing'. If specified,
   * takes precedence over tag. Defaults to None for tag-based pinning.
   * Ignored when mode='new'. */
};

export type CreateProjectWithRepoRequest = {
  name: string;
  /** The project name (also used to derive the NAP universe slug). */
  description?: string;
  /** Optional project description. */
  repository: RepositorySelection;
  /** Repository selection: link to existing or create new. */
};

export type CreateProjectWithRepoResponse = {
  folder: FolderType;
  /** The newly created Portals project folder. */
  repository: NapRepositoryRead;
  /** The NapRepository record linking to the lore-server universe. */
  mode: "created" | "existing";
  /** ``"created"`` if a new lore-server universe was initialised,
      ``"existing"`` if a universe with the same slug already existed. */
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
