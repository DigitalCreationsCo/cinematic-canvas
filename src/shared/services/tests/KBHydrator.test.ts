import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KBHydrator } from '../sac/KBHydrator.js';
import { WorldRepository } from '../world-repository.js';

describe('KBHydrator End-to-End', () => {
    let hydrator: KBHydrator;
    let mockRepo: any;

    const MOCK_USER_ID = 'user-123';
    const MOCK_PROJECT_ID = 'project-abc';

    beforeEach(() => {
        // 1. Initialize Mock Repository
        mockRepo = {
            verifyHandleAccessBulk: vi.fn(),
            getHydrationPayloadsBulk: vi.fn(),
        };
        hydrator = new KBHydrator(mockRepo as unknown as WorldRepository);
    });

    it('should successfully hydrate a mix of project and world entities', async () => {
        // Setup: One project entity, one world entity
        const input = `
      <span data-type="mention" data-handle="LocalHero">@LocalHero</span> 
      meets <span data-type="mention" data-handle="LukeSkywalker">@LukeSkywalker</span>.
    `;

        mockRepo.verifyHandleAccessBulk.mockResolvedValue(['LocalHero', 'LukeSkywalker']);
        mockRepo.getHydrationPayloadsBulk.mockResolvedValue([
            { handle: 'LocalHero', name: 'The Protagonist', traits: { build: 'lean' } },
            { handle: 'LukeSkywalker', name: 'Luke', visualSeedData: 'gs://assets/luke.png' }
        ]);

        const result = await hydrator.execute({
            userId: MOCK_USER_ID,
            projectId: MOCK_PROJECT_ID,
            htmlInput: input
        });

        expect(result.success).toBe(true);
        expect(result.prompt).toContain('@LocalHero meets @LukeSkywalker');
        expect(result.prompt).toContain('### REFERENCE KNOWLEDGE BASE ###');
        expect(result.prompt).toContain('The Protagonist');
        expect(result.prompt).toContain('gs://assets/luke.png');
    });

    it('should handle unauthorized handles as "Fair Use" (No RAG injection)', async () => {
        const input = `<span data-type="mention" data-handle="UnauthorizedIP">@UnauthorizedIP</span>`;

        // Mock: User is NOT authorized for this handle
        mockRepo.verifyHandleAccessBulk.mockResolvedValue([]);
        mockRepo.getHydrationPayloadsBulk.mockResolvedValue([]);

        const result = await hydrator.execute({
            userId: MOCK_USER_ID,
            projectId: MOCK_PROJECT_ID,
            htmlInput: input
        });

        expect(result.success).toBe(true);
        expect(result.prompt).toBe('@UnauthorizedIP');
        expect(result.prompt).not.toContain('### REFERENCE KNOWLEDGE BASE ###');
    });

    it('should sanitize malicious markup and stray tags', async () => {
        const input = `
      <script>alert('pwned')</script>
      <span data-type="mention" data-handle="Safe">@Safe</span>
      <iframe src="malicious.com"></iframe>
    `;

        mockRepo.verifyHandleAccessBulk.mockResolvedValue(['Safe']);
        mockRepo.getHydrationPayloadsBulk.mockResolvedValue([{ handle: 'Safe', name: 'Safe Entity' }]);

        const result = await hydrator.execute({
            userId: MOCK_USER_ID,
            projectId: MOCK_PROJECT_ID,
            htmlInput: input
        });

        expect(result.prompt).not.toContain('<script>');
        expect(result.prompt).not.toContain('<iframe>');
        expect(result.prompt).toContain('@Safe');
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
        expect(mockRepo.verifyHandleAccessBulk).not.toHaveBeenCalled();
    });

    it('should return descriptive errors if authorized entities are missing data', async () => {
        const input = `<span data-type="mention" data-handle="Ghost">@Ghost</span>`;

        // Mock: Authorized, but the second query (payload) returns nothing (DB Corruption)
        mockRepo.verifyHandleAccessBulk.mockResolvedValue(['Ghost']);
        mockRepo.getHydrationPayloadsBulk.mockResolvedValue([]);

        const result = await hydrator.execute({
            userId: MOCK_USER_ID,
            projectId: MOCK_PROJECT_ID,
            htmlInput: input
        });

        expect(result.success).toBe(false);
        expect(result.errors[0]).toContain("Entity '@Ghost' was not found");
    });

    it('should catch and log unexpected system exceptions', async () => {
        mockRepo.verifyHandleAccessBulk.mockRejectedValue(new Error('DB_DOWN'));

        const result = await hydrator.execute({
            userId: MOCK_USER_ID,
            projectId: MOCK_PROJECT_ID,
            htmlInput: 'any input'
        });

        expect(result.success).toBe(false);
        expect(result.errors[0]).toBe('System Error: Hydration pipeline failed unexpectedly.');
    });
});