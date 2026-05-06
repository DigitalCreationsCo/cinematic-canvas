// src/shared/services/tests/mention-resolution.test.ts
// Integration tests for mention resolution flow
import { createMockTagRegistry } from '#shared/mocks/mock-tag-registry.js';

import { describe, it, expect, vi, beforeEach, afterEach, Mocked } from 'vitest';
import { KBHydrator } from '#shared/services/sac/KBHydrator.js';
import { TagRegistryService } from '#shared/services/tag-registry.js';
import { generateId } from '#shared/utils/id.js';

describe('Mention Resolution Integration', () => {
  let hydrator: KBHydrator;
  let registry: Mocked<TagRegistryService>;

  beforeEach(() => {
    registry = createMockTagRegistry();
    hydrator = new KBHydrator(registry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('end-to-end resolution flow', () => {
    it('should resolve mentions with full metadata in response', async () => {
      const input = `
        <span data-type="mention" data-handle="Hero">@Hero</span> meets <span data-type="mention" data-handle="Villain">@Villain</span>.
      `;

      registry.verifyHandleAccessBulk.mockResolvedValue(['Hero', 'Villain']);
      registry.getHydrationPayloadsBulk.mockResolvedValue([
        {
          data: {
            referenceId: 'Hero',
            name: 'The Hero',
            description: 'A brave protagonist',
            traits: { alignment: 'good' },
            state: { mood: 'determined' },
            visualSeedData: null,
          } as any,
          entityType: 'character',
        },
        {
          data: {
            referenceId: 'Villain',
            name: 'The Villain',
            description: 'A cunning antagonist',
            traits: { alignment: 'evil' },
            state: { mood: 'scheming' },
            visualSeedData: 'gs://villain.png',
          } as any,
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
      expect(result.prompt).toContain('Hero meets Villain');
      expect(result.prompt).toContain('### ENTITY KNOWLEDGE BASE ###');
    });

    it('should handle mixed authorized and unauthorized handles', async () => {
      const input = `
        <span data-type="mention" data-handle="Hero">@Hero</span>
        meets <span data-type="mention" data-handle="CopyrightCharacter">@CopyrightCharacter</span>.
      `;

      registry.verifyHandleAccessBulk.mockResolvedValue(['Hero']);
      registry.getHydrationPayloadsBulk.mockResolvedValue([
        {
          data:
            {
              referenceId: 'Hero',
              name: 'The Hero',
              description: null,
              traits: null,
              state: null,
              visualSeedData: null
            } as any,
          entityType: 'character',
        }
      ]);

      const result = await hydrator.execute({
        userId: 'user-123',
        projectId: 'project-456',
        htmlInput: input,
      });

      expect(result.success).toBe(true);
      expect(result.metadata.resolvedCount).toBe(1);
      expect(result.metadata.unauthorizedCount).toBe(1);
      expect(result.unauthorizedHandles).toContain('CopyrightCharacter');
      expect(result.prompt).toContain('Hero');
      expect(result.prompt).toContain('CopyrightCharacter');
      expect(result.prompt).not.toContain('CopyrightCharacter description');
    });

    it('should preserve user content when entity is orphaned', async () => {
      const input = `
        <span data-type="mention" data-handle="DeletedCharacter">@DeletedCharacter</span> was once a hero.
      `;

      registry.verifyHandleAccessBulk.mockResolvedValue(['DeletedCharacter']);
      registry.getHydrationPayloadsBulk.mockResolvedValue([]);

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
      expect(registry.verifyHandleAccessBulk).not.toHaveBeenCalled();
    });

    it('should handle duplicate mentions efficiently', async () => {
      const input = `
        <span data-type="mention" data-handle="Hero">@Hero</span> is great.
        <span data-type="mention" data-handle="Hero">@Hero</span> is amazing.
        <span data-type="mention" data-handle="Hero">@Hero</span> is legendary.
      `;

      registry.verifyHandleAccessBulk.mockResolvedValue(['Hero']);
      registry.getHydrationPayloadsBulk.mockResolvedValue([
        {
          data: {
            referenceId: 'Hero',
            name: 'The Hero',
            description: 'A brave protagonist',
            traits: null,
            state: null,
            visualSeedData: null
          } as any,
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
      expect(registry.verifyHandleAccessBulk).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      registry.verifyHandleAccessBulk.mockRejectedValue(new Error('Connection refused'));

      const result = await hydrator.execute({
        userId: 'user-123',
        projectId: 'project-456',
        htmlInput: '<span data-type="mention" data-handle="Test">@Test</span>',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Internal Hydration Error');
      expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle malformed HTML gracefully', async () => {
      const input = '<span data-type="mention">@Broken</span>';

      registry.verifyHandleAccessBulk.mockResolvedValue(['Broken']);
      registry.getHydrationPayloadsBulk.mockResolvedValue([
        {
          data: {
            referenceId: 'Broken',
            name: 'Broken Entity',
            description: null,
            traits: null,
            state: null,
            visualSeedData: null
          } as any,
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
        <span data-type="mention" data-handle="Safe">@Safe</span>
      `;

      registry.verifyHandleAccessBulk.mockResolvedValue(['Safe']);
      registry.getHydrationPayloadsBulk.mockResolvedValue([
        {
          data: {
            name: 'Safe Entity',
            referenceId: 'Safe',
            description: null,
            traits: null,
            state: null,
            visualSeedData: null
          } as any,
          entityType: 'character',
        },
      ]);

      const result = await hydrator.execute({
        userId: generateId(),
        projectId: generateId(),
        htmlInput: input,
      });

      expect(result.success).toBe(true);
      expect(result.prompt).not.toContain('<script>');
      expect(result.prompt).not.toContain('document.location');
      expect(result.prompt).toContain('Safe');
    });
  });
});
