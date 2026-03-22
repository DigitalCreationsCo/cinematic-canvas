// src/shared/services/tests/mention-resolution.test.ts
// Integration tests for mention resolution flow

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KBHydrator } from '../sac/KBHydrator.js';
import { WorldRepository } from '../world-repository.js';

vi.mock('../world-repository.js');

describe('Mention Resolution Integration', () => {
  let hydrator: KBHydrator;
  let mockRepo: {
    verifyHandleAccessBulk: ReturnType<typeof vi.fn>;
    getHydrationPayloadsBulk: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRepo = {
      verifyHandleAccessBulk: vi.fn(),
      getHydrationPayloadsBulk: vi.fn(),
    };
    hydrator = new KBHydrator(mockRepo as unknown as WorldRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('end-to-end resolution flow', () => {
    it('should resolve mentions with full metadata in response', async () => {
      const input = `
        <span data-type="mention" data-handle="@Hero">@Hero</span>
        meets <span data-type="mention" data-handle="@Villain">@Villain</span>.
      `;

      mockRepo.verifyHandleAccessBulk.mockResolvedValue(['@Hero', '@Villain']);
      mockRepo.getHydrationPayloadsBulk.mockResolvedValue([
        {
          handle: '@Hero',
          name: 'The Hero',
          description: 'A brave protagonist',
          traits: { alignment: 'good' },
          state: { mood: 'determined' },
          visualSeedData: null,
          entityType: 'character',
        },
        {
          handle: '@Villain',
          name: 'The Villain',
          description: 'A cunning antagonist',
          traits: { alignment: 'evil' },
          state: { mood: 'scheming' },
          visualSeedData: 'gs://villain.png',
          entityType: 'character',
        },
      ]);

      const result = await hydrator.execute({
        userId: 'user-123',
        projectId: 'project-456',
        htmlInput: input,
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata.resolvedCount).toBe(2);
      expect(result.metadata.unauthorizedCount).toBe(0);
      expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.unauthorizedHandles).toHaveLength(0);
      expect(result.prompt).toContain('@Hero meets @Villain');
      expect(result.prompt).toContain('### ENTITY KNOWLEDGE BASE ###');
    });

    it('should handle mixed authorized and unauthorized handles', async () => {
      const input = `
        <span data-type="mention" data-handle="@Hero">@Hero</span>
        meets <span data-type="mention" data-handle="@CopyrightCharacter">@CopyrightCharacter</span>.
      `;

      mockRepo.verifyHandleAccessBulk.mockResolvedValue(['@Hero']);
      mockRepo.getHydrationPayloadsBulk.mockResolvedValue([
        {
          handle: '@Hero',
          name: 'The Hero',
          description: null,
          traits: null,
          state: null,
          visualSeedData: null,
          entityType: 'character',
        },
      ]);

      const result = await hydrator.execute({
        userId: 'user-123',
        projectId: 'project-456',
        htmlInput: input,
      });

      expect(result.success).toBe(true);
      expect(result.metadata.resolvedCount).toBe(1);
      expect(result.metadata.unauthorizedCount).toBe(1);
      expect(result.unauthorizedHandles).toContain('@CopyrightCharacter');
      expect(result.prompt).toContain('@Hero');
      expect(result.prompt).toContain('@CopyrightCharacter');
      expect(result.prompt).not.toContain('CopyrightCharacter description');
    });

    it('should preserve user content when entity is orphaned', async () => {
      const input = `
        <span data-type="mention" data-handle="@DeletedCharacter">@DeletedCharacter</span> was once a hero.
      `;

      mockRepo.verifyHandleAccessBulk.mockResolvedValue(['@DeletedCharacter']);
      mockRepo.getHydrationPayloadsBulk.mockResolvedValue([]);

      const result = await hydrator.execute({
        userId: 'user-123',
        projectId: 'project-456',
        htmlInput: input,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        "Resolution Error: @DeletedCharacter exists in registry but data is missing."
      );
      expect(result.prompt).toBe('');
    });

    it('should handle empty input gracefully', async () => {
      const input = 'This is just plain text with no mentions.';

      const result = await hydrator.execute({
        userId: 'user-123',
        projectId: 'project-456',
        htmlInput: input,
      });

      expect(result.success).toBe(true);
      expect(result.metadata.resolvedCount).toBe(0);
      expect(result.metadata.unauthorizedCount).toBe(0);
      expect(result.prompt).toBe(input);
      expect(mockRepo.verifyHandleAccessBulk).not.toHaveBeenCalled();
    });

    it('should handle duplicate mentions efficiently', async () => {
      const input = `
        <span data-type="mention" data-handle="@Hero">@Hero</span> is great.
        <span data-type="mention" data-handle="@Hero">@Hero</span> is amazing.
        <span data-type="mention" data-handle="@Hero">@Hero</span> is legendary.
      `;

      mockRepo.verifyHandleAccessBulk.mockResolvedValue(['@Hero']);
      mockRepo.getHydrationPayloadsBulk.mockResolvedValue([
        {
          handle: '@Hero',
          name: 'The Hero',
          description: 'A brave protagonist',
          traits: null,
          state: null,
          visualSeedData: null,
          entityType: 'character',
        },
      ]);

      const result = await hydrator.execute({
        userId: 'user-123',
        projectId: 'project-456',
        htmlInput: input,
      });

      expect(result.success).toBe(true);
      expect(result.metadata.resolvedCount).toBe(1);
      expect(mockRepo.verifyHandleAccessBulk).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockRepo.verifyHandleAccessBulk.mockRejectedValue(new Error('Connection refused'));

      const result = await hydrator.execute({
        userId: 'user-123',
        projectId: 'project-456',
        htmlInput: '<span data-type="mention" data-handle="@Test">@Test</span>',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Internal Hydration Error');
      expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle malformed HTML gracefully', async () => {
      const input = '<span data-type="mention">@Broken</span>';

      mockRepo.verifyHandleAccessBulk.mockResolvedValue(['@Broken']);
      mockRepo.getHydrationPayloadsBulk.mockResolvedValue([
        {
          handle: '@Broken',
          name: 'Broken Entity',
          description: null,
          traits: null,
          state: null,
          visualSeedData: null,
          entityType: 'character',
        },
      ]);

      const result = await hydrator.execute({
        userId: 'user-123',
        projectId: 'project-456',
        htmlInput: input,
      });

      expect(result.success).toBe(true);
    });

    it('should strip script injection attempts', async () => {
      const input = `
        <script>document.location='evil.com'</script>
        <span data-type="mention" data-handle="@Safe">@Safe</span>
      `;

      mockRepo.verifyHandleAccessBulk.mockResolvedValue(['@Safe']);
      mockRepo.getHydrationPayloadsBulk.mockResolvedValue([
        {
          handle: '@Safe',
          name: 'Safe Entity',
          description: null,
          traits: null,
          state: null,
          visualSeedData: null,
          entityType: 'character',
        },
      ]);

      const result = await hydrator.execute({
        userId: 'user-123',
        projectId: 'project-456',
        htmlInput: input,
      });

      expect(result.success).toBe(true);
      expect(result.prompt).not.toContain('<script>');
      expect(result.prompt).not.toContain('document.location');
      expect(result.prompt).toContain('@Safe');
    });
  });
});
