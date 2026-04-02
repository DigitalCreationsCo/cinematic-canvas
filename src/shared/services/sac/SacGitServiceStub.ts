// src/shared/services/sac/SacGitServiceStub.ts
// No-op stub implementation of ISacGitService.
// All methods log to console and return deterministic mock data.
// Wire to real provider by swapping the factory function return.

import { ISacGitService } from './ISacGitService.js';
import { SacCommit, SacLedger } from '../../types/sac.types.js';
import { generateId } from "#shared/utils/id.js";

export class SacGitServiceStub implements ISacGitService {
  async createRepo(worldId: string): Promise<{ repoId: string; repoUrl: string }> {
    const repoId = `stub-repo-${worldId}`;
    console.log(`[SacGitServiceStub] createRepo worldId=${worldId} → repoId=${repoId}`);
    return { repoId, repoUrl: `https://git.example.com/worlds/${worldId}.git` };
  }

  async forkRepo(worldId: string, projectId: string): Promise<{ forkRepoId: string; forkRepoUrl: string }> {
    const forkRepoId = `stub-fork-${projectId}`;
    console.log(`[SacGitServiceStub] forkRepo worldId=${worldId} projectId=${projectId} → forkRepoId=${forkRepoId}`);
    return {
      forkRepoId,
      forkRepoUrl: `https://git.example.com/projects/${projectId}.git`,
    };
  }

  async commitLedger(repoId: string, sacContent: SacLedger, message: string): Promise<SacCommit> {
    const sha = generateId().replace(/-/g, '').substring(0, 40);
    const commit: SacCommit = {
      sha,
      message,
      timestamp: new Date().toISOString(),
      author: 'stub-author',
    };
    console.log(
      `[SacGitServiceStub] commitLedger repoId=${repoId} sha=${sha} message="${message}"`,
      { versionCommitted: sacContent.version }
    );
    return commit;
  }

  async createPR(
    fromRepoId: string,
    toRepoId: string,
    changes: Partial<SacLedger>
  ): Promise<{ prId: string; prUrl: string }> {
    const prId = `stub-pr-${generateId()}`;
    console.log(
      `[SacGitServiceStub] createPR from=${fromRepoId} to=${toRepoId} prId=${prId}`,
      { changedKeys: Object.keys(changes) }
    );
    return { prId, prUrl: `https://git.example.com/pr/${prId}` };
  }

  async listCommits(repoId: string): Promise<SacCommit[]> {
    console.log(`[SacGitServiceStub] listCommits repoId=${repoId} → []`);
    return [];
  }

  async getCommit(repoId: string, sha: string): Promise<SacLedger> {
    console.log(`[SacGitServiceStub] getCommit repoId=${repoId} sha=${sha}`);
    return {
      version: '1.0.0',
      worldMetadata: { title: 'stub', logline: '', style: '', mood: '', colorPalette: [], tags: [] },
      creatorInfo: { ownerId: '', ownerName: '', teamId: '' },
      licenseDefinitions: [],
      characterLedgers: [],
      locationLedgers: [],
      propLedgers: [],
      generationRules: [],
    };
  }

  async mergePR(prId: string): Promise<void> {
    console.log(`[SacGitServiceStub] mergePR prId=${prId}`);
  }

  async archiveRepo(repoId: string): Promise<void> {
    console.log(`[SacGitServiceStub] archiveRepo repoId=${repoId}`);
  }
}

/**
 * Factory function for the SAC git service.
 * Swap the return value to use a real git provider (GitHub, GitLab, etc.)
 * without changing any call sites.
 */
export function getSacGitService(): ISacGitService {
  return new SacGitServiceStub();
}
