/**
 * Domain types for the Platform abstraction layer.
 *
 * These mirror the Rust structs in `desktop/src-tauri/src/commands/`
 * and are the canonical types used across all platform implementations
 * (desktop, web, test).  No platform-specific code should escape this
 * layer — consumers see only these types.
 */

// ─── Repository ───────────────────────────────────────────────────────

export interface RepoInfo {
  path: string;
  universe: string;
  current_branch: string;
  head: string;
}

export interface EntitySummary {
  uri: string;
  name: string;
  entity_type: string;
  version: number;
}

export interface Entity {
  uri: string;
  name: string;
  entity_type: string;
  version: number;
  properties: Record<string, unknown>;
  references: Record<string, unknown>;
  representations: Record<string, unknown>;
  head: string | null;
}

export interface PullResult {
  commit_hash: string;
  changes: Change[];
}

export interface Change {
  path: string;
  action: string;
}

export interface RepoStatus {
  current_branch: string;
  head: string;
  branches: string[];
  tags: string[];
}

// ─── Assets ───────────────────────────────────────────────────────────

export interface AssetImportResult {
  blake3: string;
  size_bytes: number;
}

// ─── Runtime detection ────────────────────────────────────────────────

export type Runtime = "web" | "desktop" | "test";
