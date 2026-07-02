/**
 * Platform interface — the single abstraction over all runtime environments.
 *
 * Every platform implementation (desktop, web, test) writes its own
 * adapter that fulfils this contract.  React components interact with
 * the platform exclusively through this interface, never directly
 * with Tauri, fetch(), or mock infrastructure.
 *
 * Method signatures map 1:1 to the 11 Tauri commands in
 * `desktop/src-tauri/src/commands/`:
 *   - 9 repository/entity commands (repo.rs)
 *   - 2 asset commands (asset.rs)
 *
 * ⚠️  Desktop-only features (e.g. local file access) throw
 *     `PlatformError(UNSUPPORTED, ...)` on web.
 */

import type {
  AssetImportResult,
  Entity,
  EntitySummary,
  PullResult,
  RepoInfo,
  RepoStatus,
  Runtime,
} from "./types";

export interface Platform {
  /** Identifies the current runtime environment. */
  readonly runtime: Runtime;

  // ── Repository lifecycle ────────────────────────────────────────

  /** Initialise a new NAP repository for the given universe. */
  initRepository(repoRoot: string, universe: string): Promise<RepoInfo>;

  /** Open an existing NAP repository. */
  openRepository(repoRoot: string, universe: string): Promise<RepoInfo>;

  // ── Entity operations ───────────────────────────────────────────

  /** List all entities in a universe, optionally filtered by entity_type. */
  listEntities(
    repoRoot: string,
    universe: string,
    entityType?: string,
  ): Promise<EntitySummary[]>;

  /** Read a single entity by its nap:// URI. */
  readEntity(uri: string): Promise<Entity>;

  /**
   * Write (create or update) an entity manifest in the working tree.
   * Changes remain uncommitted until `commit()` is called.
   */
  writeEntity(
    repoRoot: string,
    universe: string,
    entity: Entity,
  ): Promise<void>;

  // ── Version control ─────────────────────────────────────────────

  /** Commit all working-tree changes. Returns the BLAKE3 commit hash. */
  commit(repoRoot: string, message: string): Promise<string>;

  /** Pull content objects from lore-server. */
  pull(repoRoot: string): Promise<PullResult>;

  /** Push local content objects to lore-server. */
  push(repoRoot: string): Promise<string>;

  /** Show repository status — current branch, HEAD, branches, tags. */
  status(repoRoot: string): Promise<RepoStatus>;

  // ── Assets (content-addressed store) ────────────────────────────

  /**
   * Import a local file into lore-server's content-addressed store.
   * Returns the BLAKE3 hash and size.
   *
   * ⚠️  On web: requires a server endpoint that can read the file.
   *     If the web server does not expose it, this throws UNSUPPORTED.
   */
  importAsset(repoRoot: string, sourcePath: string): Promise<AssetImportResult>;

  /**
   * Resolve an asset hash to a local file path.
   *
   * ⚠️  On web: returns a URL to the asset served by the backend,
   *     not a local filesystem path.
   */
  resolveAsset(repoRoot: string, hash: string): Promise<string>;
}
