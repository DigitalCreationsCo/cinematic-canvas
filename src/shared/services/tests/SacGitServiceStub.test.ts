import { describe, it, expect } from 'vitest';
import { getSacGitService } from '../sac/SacGitServiceStub.js';

describe('SacGitServiceStub', () => {
  it('implements factory correctly', () => {
    const service = getSacGitService();
    expect(service).toBeDefined();
    expect(typeof service.createRepo).toBe('function');
  });

  it('createRepo returns deterministic mock structure', async () => {
    const service = getSacGitService();
    const result = await service.createRepo('world-123');
    
    expect(result.repoId).toContain('stub-repo-world-123');
    expect(result.repoUrl).toContain('https://git.example.com/worlds/world-123.git');
  });

  it('commitLedger returns valid SacCommit', async () => {
    const service = getSacGitService();
    const result = await service.commitLedger('repo-1', {}, 'Initial commit');
    
    expect(result.sha).toHaveLength(32);
    expect(result.message).toBe('Initial commit');
    expect(result.author).toBe('stub-author');
  });
});
