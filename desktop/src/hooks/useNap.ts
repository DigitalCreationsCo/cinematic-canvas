/**
 * Typed React hooks for Portals desktop Tauri commands.
 *
 * Every function wraps `invoke()` with the correct command name and
 * TypeScript return type. Call these from React components instead of
 * calling `invoke()` directly — this is the sole translation layer
 * between the React UI and the Tauri Rust command surface.
 *
 * Migration path to web:
 *   Replace `invoke(...)` bodies with `fetch('/api/v1/...')` calls.
 *   The hook signatures stay the same; only the implementation changes.
 */

import { invoke } from "@tauri-apps/api/core";

// ─── Types (matching Rust structs in commands/repo.rs and commands/asset.rs) ───

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

export interface AssetImportResult {
  blake3: string;
  size_bytes: number;
}

export interface PullResult {
  commit_hash: string;
  changes: Array<{ path: string; action: string }>;
}

export interface RepoStatus {
  current_branch: string;
  head: string;
  branches: string[];
  tags: string[];
}

// ─── Hook ───

/**
 * Primary hook for interacting with the Portals desktop backend.
 *
 * Example:
 * ```tsx
 * const nap = useNap();
 * const entities = await nap.listEntities("/path/to/repo", "starwars");
 * ```
 */
export function useNap() {
  return {
    // ── Repository ──

    /** Initialise a new NAP repository for the given universe. */
    initRepo: (repoRoot: string, universe: string): Promise<RepoInfo> =>
      invoke("nap_init_repo", { repo_root: repoRoot, universe }),

    /** Open an existing NAP repository. */
    openRepo: (repoRoot: string, universe: string): Promise<RepoInfo> =>
      invoke("nap_open_repo", { repo_root: repoRoot, universe }),

    /** List all entities in a universe, optionally filtered by entity_type. */
    listEntities: (
      repoRoot: string,
      universe: string,
      entityType?: string,
    ): Promise<EntitySummary[]> =>
      invoke("nap_list_entities", {
        repo_root: repoRoot,
        universe,
        entity_type: entityType ?? null,
      }),

    /** Read a single entity by its nap:// URI. */
    readEntity: (uri: string): Promise<Entity> =>
      invoke("nap_read_entity", { uri }),

    /** Write (create or update) an entity manifest. Changes remain uncommitted until commit(). */
    writeEntity: (
      repoRoot: string,
      universe: string,
      entity: Entity,
    ): Promise<void> =>
      invoke("nap_write_entity", { repo_root: repoRoot, universe, entity }),

    /** Commit all working-tree changes. Returns the BLAKE3 commit hash. */
    commit: (repoRoot: string, message: string): Promise<string> =>
      invoke("nap_commit", { repo_root: repoRoot, message }),

    /** Pull content objects from lore-server. */
    pull: (repoRoot: string): Promise<PullResult> =>
      invoke("nap_pull", { repo_root: repoRoot }),

    /** Push local content objects to lore-server. */
    push: (repoRoot: string): Promise<string> =>
      invoke("nap_push", { repo_root: repoRoot }),

    /** Show repository status — current branch, HEAD, branches, tags. */
    status: (repoRoot: string): Promise<RepoStatus> =>
      invoke("nap_status", { repo_root: repoRoot }),

    // ── Assets ──

    /** Import a local file into lore-server's content-addressed store. Returns the BLAKE3 hash. */
    importAsset: (repoRoot: string, sourcePath: string): Promise<AssetImportResult> =>
      invoke("nap_import_asset", { repo_root: repoRoot, source_path: sourcePath }),

    /** Resolve an asset hash to a local file path. Use with convertFileSrc() for WebView rendering. */
    resolveAsset: (repoRoot: string, hash: string): Promise<string> =>
      invoke("nap_resolve_asset", { repo_root: repoRoot, hash }),
  };
}
