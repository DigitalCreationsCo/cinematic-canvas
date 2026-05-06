import { createMockTagRegistry } from '#shared/mocks/mock-tag-registry.js';

import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest';
import { KBHydrator } from '#shared/services/sac/KBHydrator.js';
import { TagRegistryService } from '#shared/services/tag-registry.js';
import { generateId } from '#shared/utils/id.js';

describe('KBHydrator End-to-End', () => {
    let hydrator: KBHydrator;
    let registry: Mocked<TagRegistryService>;

    const MOCK_USER_ID = generateId();
    const MOCK_PROJECT_ID = generateId();

    beforeEach(() => {
        registry = createMockTagRegistry();
        hydrator = new KBHydrator(registry);
    });

    it('should successfully hydrate a mix of project and world entities', async () => {
        // Setup: One project entity, one world entity
        const input = `<span data-type="mention" data-handle="LocalHero">@LocalHero</span> meets <span data-type="mention" data-handle="LukeSkywalker">@LukeSkywalker</span>.`;

        registry.verifyHandleAccessBulk.mockResolvedValue(['LocalHero', 'LukeSkywalker']);
        registry.getHydrationPayloadsBulk.mockResolvedValue([
            { entityType: 'character', data: { referenceId: 'LocalHero', name: 'The Protagonist', description: "Description A", assets: { "character_image": 'gs://assets/luke.png' } } as any },
            { entityType: 'character', data: { referenceId: 'LukeSkywalker', name: 'Luke Skywalker', description: "Description B", assets: { "character_image": 'gs://assets/luke.png' } } as any }
        ]);

        const result = await hydrator.execute({
            userId: MOCK_USER_ID,
            projectId: MOCK_PROJECT_ID,
            htmlInput: input
        });

        expect(result.success).toBe(true);
        expect(result.prompt).toContain('LocalHero meets LukeSkywalker');
        expect(result.prompt).toContain('### ENTITY KNOWLEDGE BASE ###');
        expect(result.prompt).toContain('The Protagonist');
        expect(result.prompt).toContain('gs://assets/luke.png');
    });

    it('should handle unauthorized handles as "Fair Use" (No RAG injection)', async () => {
        const input = `<span data-type="mention" data-handle="UnauthorizedIP">@UnauthorizedIP</span>`;

        // Mock: User is NOT authorized for this handle
        registry.verifyHandleAccessBulk.mockResolvedValue([]);
        registry.getHydrationPayloadsBulk.mockResolvedValue([]);

        const result = await hydrator.execute({
            userId: MOCK_USER_ID,
            projectId: MOCK_PROJECT_ID,
            htmlInput: input
        });

        expect(result.success).toBe(true);
        expect(result.prompt).toBe('UnauthorizedIP');
        expect(result.prompt).not.toContain('### ENTITY KNOWLEDGE BASE ###');
    });

    it('should sanitize malicious markup and stray tags', async () => {
        const input = `
      <script>alert('pwned')</script>
      <span data-type="mention" data-handle="Safe">@Safe</span>
      <iframe src="malicious.com"></iframe>
    `;

        registry.verifyHandleAccessBulk.mockResolvedValue(['Safe']);
        registry.getHydrationPayloadsBulk.mockResolvedValue([{ entityType: 'character', data: { referenceId: 'Safe', name: 'Safe Entity' } } as any]);

        const result = await hydrator.execute({
            userId: MOCK_USER_ID,
            projectId: MOCK_PROJECT_ID,
            htmlInput: input
        });

        expect(result.prompt).not.toContain('<script>');
        expect(result.prompt).not.toContain('<iframe>');
        expect(result.prompt).toContain('Safe');
    });

    it('should ignore email addresses and stray @ symbols', async () => {
        // Note: Tiptap doesn't wrap these in <span>, so hydrator should ignore them
        const input = `Contact luke@jedi.com or follow @TwitterHandle.`;

        const result = await hydrator.execute({
            userId: MOCK_USER_ID,
            projectId: MOCK_PROJECT_ID,
            htmlInput: input
        });

        expect(result.prompt).toBe('Contact luke@jedi.com or follow @TwitterHandle.');
        expect(registry.verifyHandleAccessBulk).not.toHaveBeenCalled();
    });

    it('should return descriptive errors if authorized entities are missing data', async () => {
        const input = `<span data-type="mention" data-handle="Ghost">@Ghost</span>`;

        // Mock: Authorized, but the second query (payload) returns nothing (DB Corruption)
        registry.verifyHandleAccessBulk.mockResolvedValue(['Ghost']);
        registry.getHydrationPayloadsBulk.mockResolvedValue([]);

        const result = await hydrator.execute({
            userId: MOCK_USER_ID,
            projectId: MOCK_PROJECT_ID,
            htmlInput: input
        });

        expect(result.success).toBe(false);
        expect(result.errors[0]).toContain("@Ghost exists in registry but data is missing");
    });

    it('should catch and log unexpected system exceptions', async () => {
        registry.verifyHandleAccessBulk.mockRejectedValue(new Error('DB_DOWN'));

        const input = `<span data-type="mention" data-handle="Ghost">@Ghost</span>`;
        const result = await hydrator.execute({
            userId: MOCK_USER_ID,
            projectId: MOCK_PROJECT_ID,
            htmlInput: input
        });

        expect(result.success).toBe(false);
        expect(result.errors[0]).toBe('Internal Hydration Error');
    });

    it('should return true and bypass unexpected system exceptions if there is no input match', async () => {
        registry.verifyHandleAccessBulk.mockRejectedValue(new Error('DB_DOWN'));

        const result = await hydrator.execute({
            userId: MOCK_USER_ID,
            projectId: MOCK_PROJECT_ID,
            htmlInput: "input"
        });

        expect(result.success).toBe(true);
        expect(result.errors[0]).toBe(undefined);
    });
});