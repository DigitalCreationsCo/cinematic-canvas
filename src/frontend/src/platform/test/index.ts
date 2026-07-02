/**
 * Test platform implementation — keeps everything in memory.
 *
 * Used by unit tests and Storybook stories so they never need a real
 * Tauri webview or backend server.
 *
 * ⚠️  This is a **fake**, not a mock.  It maintains internal state
 *     that behaves like a real repository would, so integration tests
 *     can exercise real flows without side effects.
 */

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

// ─── In-memory state ──────────────────────────────────────────────────

interface TestRepo {
  path: string;
  universe: string;
  currentBranch: string;
  headHash: string;
  entities: Map<string, Entity>;
  assets: Map<string, Uint8Array>;
  commits: Array<{ hash: string; message: string }>;
  tags: string[];
  branches: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────

const repos = new Map<string, TestRepo>();

function getRepo(repoRoot: string): TestRepo {
  const repo = repos.get(repoRoot);
  if (!repo) {
    throw PlatformError.notFound(`Repository not found: ${repoRoot}`);
  }
  return repo;
}

function fakeHash(): string {
  const hex = Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
  return hex;
}

// ─── Factory ──────────────────────────────────────────────────────────

/**
 * Create a test platform adapter backed by in-memory state.
 *
 * Call `resetTestPlatform()` between tests to clear all state.
 */
export function createTestPlatform(): Platform {
  return {
    runtime: "test" as const,

    // ── Repository ────────────────────────────────────────────────

    initRepository: async (repoRoot, universe): Promise<RepoInfo> => {
      const hash = fakeHash();
      const repo: TestRepo = {
        path: repoRoot,
        universe,
        currentBranch: "main",
        headHash: hash,
        entities: new Map(),
        assets: new Map(),
        commits: [{ hash, message: "Initial commit" }],
        tags: [],
        branches: ["main"],
      };
      repos.set(repoRoot, repo);
      return {
        path: repoRoot,
        universe,
        current_branch: "main",
        head: hash,
      };
    },

    openRepository: async (repoRoot, universe): Promise<RepoInfo> => {
      const repo = getRepo(repoRoot);
      if (repo.universe !== universe) {
        throw PlatformError.notFound(
          `Universe '${universe}' not found at '${repoRoot}'`,
        );
      }
      return {
        path: repo.path,
        universe: repo.universe,
        current_branch: repo.currentBranch,
        head: repo.headHash,
      };
    },

    // ── Entities ──────────────────────────────────────────────────

    listEntities: async (
      _repoRoot,
      _universe,
      _entityType?,
    ): Promise<EntitySummary[]> => {
      // No filter by entity type in this simple test adapter
      const repo = _repoRoot ? repos.get(_repoRoot) : undefined;
      if (!repo) return [];

      const summaries: EntitySummary[] = [];
      repo.entities.forEach((entity) => {
        summaries.push({
          uri: entity.uri,
          name: entity.name,
          entity_type: entity.entity_type,
          version: entity.version,
        });
      });
      return summaries;
    },

    readEntity: async (uri): Promise<Entity> => {
      const repoList = Array.from(repos.values());
      for (const repo of repoList) {
        const entityList = Array.from(repo.entities.values());
        for (const entity of entityList) {
          if (entity.uri === uri) return entity;
        }
      }
      throw PlatformError.notFound(`Entity not found: ${uri}`);
    },

    writeEntity: async (repoRoot, _universe, entity): Promise<void> => {
      const repo = getRepo(repoRoot);
      repo.entities.set(entity.uri, { ...entity });
    },

    // ── VCS ───────────────────────────────────────────────────────

    commit: async (repoRoot, message): Promise<string> => {
      const repo = getRepo(repoRoot);
      const hash = fakeHash();
      repo.commits.push({ hash, message });
      repo.headHash = hash;
      return hash;
    },

    pull: async (repoRoot): Promise<PullResult> => {
      getRepo(repoRoot); // ensure exists
      return { commit_hash: fakeHash(), changes: [] };
    },

    push: async (repoRoot): Promise<string> => {
      getRepo(repoRoot); // ensure exists
      return "pushed";
    },

    status: async (repoRoot): Promise<RepoStatus> => {
      const repo = getRepo(repoRoot);
      return {
        current_branch: repo.currentBranch,
        head: repo.headHash,
        branches: [...repo.branches],
        tags: [...repo.tags],
      };
    },

    // ── Assets ────────────────────────────────────────────────────

    importAsset: async (repoRoot, sourcePath): Promise<AssetImportResult> => {
      const repo = getRepo(repoRoot);
      const hash = fakeHash();
      repo.assets.set(hash, new Uint8Array(0));
      return { blake3: hash, size_bytes: 0 };
    },

    resolveAsset: async (repoRoot, hash): Promise<string> => {
      getRepo(repoRoot); // ensure exists
      return `/mock/assets/${hash}`;
    },
  };
}

/**
 * Reset all in-memory repositories — call between tests.
 */
export function resetTestPlatform(): void {
  repos.clear();
}
