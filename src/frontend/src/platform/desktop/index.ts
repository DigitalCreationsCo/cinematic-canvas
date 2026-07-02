/**
 * Desktop (Tauri) platform implementation.
 *
 * Every method maps directly to a Tauri `invoke()` call.  This is the
 * only module in `src/frontend/` that imports from `@tauri-apps/api`.
 *
 * ⚠️  This module is only ever loaded when `detectRuntime()` returns
 *     `"desktop"` — it is never imported eagerly during web builds.
 *     The `@tauri-apps/api` dependency is only resolved at runtime
 *     inside a Tauri webview.
 */

import { invoke } from "@tauri-apps/api/core";
import { PlatformError } from "../errors";
import type { Platform } from "../interface";
import type {
  AssetImportResult,
  Entity,
  EntitySummary,
  PullResult,
  RepoInfo,
  RepoStatus,
} from "../types";

/**
 * Translates raw Tauri error strings into `PlatformError` instances.
 *
 * Tauri serialises `CommandError` as a plain string (see `error.rs`),
 * so we pattern-match on the prefix to recover the error category.
 */
function translateError(err: unknown): never {
  const message =
    err instanceof Error
      ? err.message
      : err != null
        ? String(err)
        : "Unknown error";

  if (message.startsWith("Repository error:")) {
    throw PlatformError.repo(message.replace("Repository error: ", "").trim());
  }
  if (message.startsWith("Asset error:")) {
    throw PlatformError.asset(message.replace("Asset error: ", "").trim());
  }
  if (message.startsWith("VCS error:")) {
    throw PlatformError.vcs(message.replace("VCS error: ", "").trim());
  }
  if (message.startsWith("Not found:")) {
    throw PlatformError.notFound(message.replace("Not found: ", "").trim());
  }
  if (message.startsWith("Conflict:")) {
    throw PlatformError.conflict(message.replace("Conflict: ", "").trim());
  }
  if (message.startsWith("I/O error:")) {
    throw PlatformError.io(message.replace("I/O error: ", "").trim());
  }
  if (message.startsWith("Network error:")) {
    throw PlatformError.network(message.replace("Network error: ", "").trim());
  }

  throw PlatformError.other(message);
}

/**
 * Create a desktop platform adapter backed by Tauri invoke().
 *
 * Each method wraps the corresponding Tauri command, translating Rust
 * `CommandError` to `PlatformError` via `translateError`.
 */
export function createDesktopPlatform(): Platform {
  return {
    runtime: "desktop" as const,

    // ── Repository ────────────────────────────────────────────────

    initRepository: (repoRoot, universe) =>
      invoke<RepoInfo>("nap_init_repo", {
        repo_root: repoRoot,
        universe,
      }).catch(translateError),

    openRepository: (repoRoot, universe) =>
      invoke<RepoInfo>("nap_open_repo", {
        repo_root: repoRoot,
        universe,
      }).catch(translateError),

    // ── Entities ──────────────────────────────────────────────────

    listEntities: (repoRoot, universe, entityType) =>
      invoke<EntitySummary[]>("nap_list_entities", {
        repo_root: repoRoot,
        universe,
        entity_type: entityType ?? null,
      }).catch(translateError),

    readEntity: (uri) =>
      invoke<Entity>("nap_read_entity", { uri }).catch(translateError),

    writeEntity: (repoRoot, universe, entity) =>
      invoke<void>("nap_write_entity", {
        repo_root: repoRoot,
        universe,
        entity,
      }).catch(translateError),

    // ── VCS ───────────────────────────────────────────────────────

    commit: (repoRoot, message) =>
      invoke<string>("nap_commit", { repo_root: repoRoot, message }).catch(
        translateError,
      ),

    pull: (repoRoot) =>
      invoke<PullResult>("nap_pull", { repo_root: repoRoot }).catch(
        translateError,
      ),

    push: (repoRoot) =>
      invoke<string>("nap_push", { repo_root: repoRoot }).catch(translateError),

    status: (repoRoot) =>
      invoke<RepoStatus>("nap_status", { repo_root: repoRoot }).catch(
        translateError,
      ),

    // ── Assets ────────────────────────────────────────────────────

    importAsset: (repoRoot, sourcePath) =>
      invoke<AssetImportResult>("nap_import_asset", {
        repo_root: repoRoot,
        source_path: sourcePath,
      }).catch(translateError),

    resolveAsset: (repoRoot, hash) =>
      invoke<string>("nap_resolve_asset", {
        repo_root: repoRoot,
        hash,
      }).catch(translateError),
  };
}
