/**
 * Web (browser) platform implementation.
 *
 * Runs in a standard browser context against the Portals backend API.
 * Local filesystem operations (repository init, local commits, etc.)
 * are not available — they throw `PlatformError(UNSUPPORTED)`.
 *
 * The browser can only interact with the backend via HTTP, using the
 * existing Axios `api` client (see `controllers/API/api.tsx`).
 *
 * @remarks
 * Currently all methods throw UNSUPPORTED.  As the web backend gains
 * NAP HTTP endpoints, individual methods should be migrated to make
 * real HTTP calls via `import { api } from "@/controllers/API/api"`.
 */

import { PlatformError } from "../errors";
import type { Platform } from "../interface";

/**
 * Create a web (browser) platform adapter backed by HTTP calls.
 *
 * Filesystem-level operations throw `UNSUPPORTED` with a message
 * directing users to use the desktop app or configure the server
 * to provide the missing capability.
 */
export function createWebPlatform(): Platform {
  return {
    runtime: "web" as const,

    // ── Repository ────────────────────────────────────────────────
    // Local repo management is not available in the browser.
    // The server manages its own repository internally.

    initRepository: () =>
      Promise.reject(
        PlatformError.unsupported("initRepository", {
          hint: "Use the desktop app or configure the backend to auto-initialise a repository.",
        }),
      ),

    openRepository: () =>
      Promise.reject(
        PlatformError.unsupported("openRepository", {
          hint: "Repository access is only available in the desktop app.",
        }),
      ),

    // ── Entities ──────────────────────────────────────────────────
    // These are handled via the existing reactive NAP query hooks
    // (usePostCreateEntity, usePostMergePreview, usePostPublish).
    // The Platform interface exposes these for parity; they may be
    // partially supported on web via HTTP.

    listEntities: () =>
      Promise.reject(
        PlatformError.unsupported("listEntities", {
          hint: "Use the desktop app or the project's entity browser API.",
        }),
      ),

    readEntity: () =>
      Promise.reject(
        PlatformError.unsupported("readEntity", {
          hint: "Entity reading is only available in the desktop app.",
        }),
      ),

    writeEntity: () =>
      Promise.reject(
        PlatformError.unsupported("writeEntity", {
          hint: "Entity writing is only available in the desktop app. Use the publish API instead.",
        }),
      ),

    // ── VCS ───────────────────────────────────────────────────────
    // Local VCS operations are desktop-only.

    commit: () =>
      Promise.reject(
        PlatformError.unsupported("commit", {
          hint: "Local commits are only available in the desktop app. Changes are saved via the publish API.",
        }),
      ),

    pull: () =>
      Promise.reject(
        PlatformError.unsupported("pull", {
          hint: "Pull operations are only available in the desktop app.",
        }),
      ),

    push: () =>
      Promise.reject(
        PlatformError.unsupported("push", {
          hint: "Push operations are only available in the desktop app.",
        }),
      ),

    status: () =>
      Promise.reject(
        PlatformError.unsupported("status", {
          hint: "Repository status is only available in the desktop app.",
        }),
      ),

    // ── Assets ────────────────────────────────────────────────────
    // Asset import requires local file access (desktop-only).
    // Asset resolution may work via backend HTTP.

    importAsset: () =>
      Promise.reject(
        PlatformError.unsupported("importAsset", {
          hint: "File import is only available in the desktop app. Use the media upload API instead.",
        }),
      ),

    resolveAsset: () =>
      Promise.reject(
        PlatformError.unsupported("resolveAsset", {
          hint: "Asset resolution is only available in the desktop app.",
        }),
      ),
  };
}
