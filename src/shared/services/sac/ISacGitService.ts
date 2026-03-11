// src/shared/services/sac/ISacGitService.ts
// Abstract interface for the Scene-as-Code (SAC) git service.
// Swap SacGitServiceStub for a real provider without changing any call sites.

import { SacCommit, SacLedger } from '../../types/sac_types.js';

export interface ISacGitService {
  /**
   * Creates a new git repository for a world's SAC base ledger.
   * Returns the provider-assigned repoId and a public clone URL.
   */
  createRepo(worldId: string): Promise<{ repoId: string; repoUrl: string }>;

  /**
   * Forks the world's base ledger repo for a project.
   * The base world ledger is mounted as a git submodule inside the fork.
   */
  forkRepo(worldId: string, projectId: string): Promise<{ forkRepoId: string; forkRepoUrl: string }>;

  /**
   * Commits a full SacLedger snapshot to the repo.
   * Returns the resulting commit metadata.
   */
  commitLedger(repoId: string, sacContent: SacLedger, message: string): Promise<SacCommit>;

  /**
   * Creates a PR from a project fork back to the world base repo.
   * Backend validates licenseType before calling this — callers must enforce RBAC first.
   */
  createPR(
    fromRepoId: string,
    toRepoId: string,
    changes: Partial<SacLedger>
  ): Promise<{ prId: string; prUrl: string }>;

  /** Lists all commits in a repo in reverse chronological order. */
  listCommits(repoId: string): Promise<SacCommit[]>;

  /** Returns the full SacLedger at a specific commit sha. */
  getCommit(repoId: string, sha: string): Promise<SacLedger>;

  /** Merges an open PR (owner-only). */
  mergePR(prId: string): Promise<void>;

  /** Archives a repo (soft-delete). */
  archiveRepo(repoId: string): Promise<void>;
}

// Re-export SacCommit/SacLedger for use at the service boundary
export type { SacCommit, SacLedger };
