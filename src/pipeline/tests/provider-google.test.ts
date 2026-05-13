import { mockGoogleGenAI } from "#shared/mocks/mock-googlegenai.js"

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleProvider } from '../../shared/lm/google/provider.js';
import { buildGenerateContentParams, buildGenerateVideosParams } from "#shared/lm/google/params.js";

describe('GoogleProvider', () => {
    let provider: GoogleProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new GoogleProvider();
    });

    it("should mock genAI", async () => {
        vi.mocked(mockGoogleGenAI.models.generateContent).mockResolvedValue({
            text: "mock",
        } as any);
    });

    it('should proxy generateContent calls to the underlying model', async () => {
        vi.mocked(mockGoogleGenAI.models.generateContent).mockResolvedValue('content' as any);

        const params = { model: 'test-model', messages: [] };
        const result = await provider.generateContent(params);

        expect(result).toBe('content');
        const googleProviderParams = buildGenerateContentParams(params);
        expect(mockGoogleGenAI.models.generateContent).toHaveBeenCalledWith(
            googleProviderParams
        );
    });

    it('should proxy generateVideos calls to the underlying model', async () => {
        vi.mocked(mockGoogleGenAI.models.generateVideos).mockResolvedValue('videos' as any);

        const params = { model: 'test-model', prompt: 'test' };
        const result = await provider.generateVideos(params);

        expect(result).toBe('videos');
        const googleProviderParams = buildGenerateVideosParams(params);
        expect(mockGoogleGenAI.models.generateVideos).toHaveBeenCalledWith(googleProviderParams);
    });

    it('should proxy getVideosOperation calls to the underlying operations', async () => {
        vi.mocked(mockGoogleGenAI.operations.getVideosOperation).mockResolvedValue('operation' as any);

        const params = { operation: { name: 'ops/123' } } as any;
        const result = await provider.getVideosOperation(params);

        expect(result).toBe('operation');
        expect(mockGoogleGenAI.operations.getVideosOperation).toHaveBeenCalledWith(params);
    });

    // ========================================================================
    // generateImages — styleReferences injection
    // ========================================================================

    describe('generateImages — styleReferences injection', () => {
        // ── Gemini path ────────────────────────────────────────────────────

        it('should inject style references as StyleImage contents for Gemini models', async () => {
            vi.mocked(mockGoogleGenAI.models.generateContent).mockResolvedValue({
                candidates: [{ content: { parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }] } }],
            } as any);

            await provider.generateImages({
                model: 'gemini-2.0-flash-exp',
                prompt: 'a scenic landscape',
                styleReferences: ['gs://bucket/palette-1.jpg', 'gs://bucket/palette-2.png'],
                config: {},
            });

            const callArgs = vi.mocked(mockGoogleGenAI.models.generateContent).mock.calls[0][0];
            expect(callArgs.contents).toHaveLength(3);

            // Style ref #1 → first Content entry with fileData
            expect(callArgs.contents[0].parts[1]).toMatchObject({
                fileData: { fileUri: 'gs://bucket/palette-1.jpg' },
            });
            // Style ref #2 → second Content entry
            expect(callArgs.contents[1].parts[1]).toMatchObject({
                fileData: { fileUri: 'gs://bucket/palette-2.png' },
            });
            // Text prompt is last
            expect(callArgs.contents[2].parts[0]).toMatchObject({ text: 'a scenic landscape' });

            // Style refs carry the 'style' referenceType
            expect(callArgs.contents[0].referenceType).toBe('style');
            expect(callArgs.contents[1].referenceType).toBe('style');
        });

        it('should merge style references with caller-supplied reference images for Gemini', async () => {
            vi.mocked(mockGoogleGenAI.models.generateContent).mockResolvedValue({
                candidates: [{ content: { parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }] } }],
            } as any);

            await provider.generateImages({
                model: 'gemini-2.0-flash-exp',
                prompt: 'a portrait',
                referenceImages: {
                    subject: [
                        {
                            referenceImage: { gcsUri: 'gs://bucket/char.jpg' },
                            referenceType: 'subject',
                            config: { subjectType: 'SUBJECT_TYPE_PERSON', subjectDescription: 'Main character' },
                        },
                    ],
                },
                styleReferences: ['gs://bucket/palette-1.jpg'],
                config: {},
            });

            const callArgs = vi.mocked(mockGoogleGenAI.models.generateContent).mock.calls[0][0];

            // subject ref + style ref + prompt = 3 Content entries
            expect(callArgs.contents).toHaveLength(3);

            // Caller-supplied subject ref is first
            expect(callArgs.contents[0].parts[1]).toMatchObject({
                fileData: { fileUri: 'gs://bucket/char.jpg' },
            });
            expect(callArgs.contents[0].referenceType).toBe('subject');

            // Style ref is second (merged in)
            expect(callArgs.contents[1].parts[1]).toMatchObject({
                fileData: { fileUri: 'gs://bucket/palette-1.jpg' },
            });
            expect(callArgs.contents[1].referenceType).toBe('style');

            // Prompt is last
            expect(callArgs.contents[2].parts[0]).toMatchObject({ text: 'a portrait' });
        });

        it('should not inject style refs for Gemini when none provided', async () => {
            vi.mocked(mockGoogleGenAI.models.generateContent).mockResolvedValue({
                candidates: [{ content: { parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }] } }],
            } as any);

            await provider.generateImages({
                model: 'gemini-2.0-flash-exp',
                prompt: 'just text',
                config: {},
            });

            const callArgs = vi.mocked(mockGoogleGenAI.models.generateContent).mock.calls[0][0];
            // Only the text prompt Content
            expect(callArgs.contents).toHaveLength(1);
            expect(callArgs.contents[0].parts[0]).toMatchObject({ text: 'just text' });
        });

        // ── Imagen path (editImage with references) ─────────────────────────

        it('should inject style references as StyleReferenceImage for Imagen editImage', async () => {
            vi.mocked(mockGoogleGenAI.models.editImage).mockResolvedValue({} as any);

            await provider.generateImages({
                model: 'imagen-3.0-capability-001',
                prompt: 'a cityscape',
                styleReferences: ['gs://bucket/palette-1.jpg'],
                config: {},
            });

            const callArgs = vi.mocked(mockGoogleGenAI.models.editImage).mock.calls[0][0];
            expect(callArgs.referenceImages).toHaveLength(1);
            expect(callArgs.referenceImages[0].referenceImage.gcsUri).toBe('gs://bucket/palette-1.jpg');
            expect(callArgs.referenceImages[0].config.styleDescription).toBe('Project-wide style reference');
        });

        it('should merge style references with caller-supplied refs for Imagen editImage', async () => {
            vi.mocked(mockGoogleGenAI.models.editImage).mockResolvedValue({} as any);

            await provider.generateImages({
                model: 'imagen-3.0-capability-001',
                prompt: 'a cityscape',
                referenceImages: {
                    base: [{ referenceImage: { gcsUri: 'gs://bucket/input.jpg' }, referenceType: 'base' }],
                },
                styleReferences: ['gs://bucket/palette-1.jpg'],
                config: {},
            });

            const callArgs = vi.mocked(mockGoogleGenAI.models.editImage).mock.calls[0][0];
            expect(callArgs.referenceImages).toHaveLength(2);

            // Caller-supplied base ref comes first
            expect(callArgs.referenceImages[0].referenceImage.gcsUri).toBe('gs://bucket/input.jpg');

            // Style ref is merged second
            expect(callArgs.referenceImages[1].referenceImage.gcsUri).toBe('gs://bucket/palette-1.jpg');
            expect(callArgs.referenceImages[1].config.styleDescription).toBe('Project-wide style reference');
        });

        it('should not inject style refs for Imagen when none provided (falls through to generateImages)', async () => {
            vi.mocked(mockGoogleGenAI.models.generateImages).mockResolvedValue({} as any);

            await provider.generateImages({
                model: 'imagen-3.0-capability-001',
                prompt: 'just a simple image',
                config: {},
            });

            expect(mockGoogleGenAI.models.generateImages).toHaveBeenCalled();
            expect(mockGoogleGenAI.models.editImage).not.toHaveBeenCalled();
        });

        it('should pass through to Imagen editImage when caller refs present but no style refs', async () => {
            vi.mocked(mockGoogleGenAI.models.editImage).mockResolvedValue({} as any);

            await provider.generateImages({
                model: 'imagen-3.0-capability-001',
                prompt: 'edit this',
                referenceImages: {
                    content: [{ referenceImage: { gcsUri: 'gs://bucket/input.jpg' }, referenceType: 'content' }],
                },
                config: {},
            });

            expect(mockGoogleGenAI.models.editImage).toHaveBeenCalled();
            // Only the content ref — no style refs
            const callArgs = vi.mocked(mockGoogleGenAI.models.editImage).mock.calls[0][0];
            expect(callArgs.referenceImages).toHaveLength(1);
        });

        // ── Multipart style references ──────────────────────────────────────

        it('should inject multiple style references for Gemini', async () => {
            vi.mocked(mockGoogleGenAI.models.generateContent).mockResolvedValue({
                candidates: [{ content: { parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }] } }],
            } as any);

            await provider.generateImages({
                model: 'gemini-2.0-flash-exp',
                prompt: 'multi-style test',
                styleReferences: [
                    'gs://bucket/a.jpg',
                    'gs://bucket/b.jpg',
                    'gs://bucket/c.jpg',
                ],
                config: {},
            });

            const callArgs = vi.mocked(mockGoogleGenAI.models.generateContent).mock.calls[0][0];
            // 3 style refs + 1 prompt = 4 Content entries
            expect(callArgs.contents).toHaveLength(4);

            expect(callArgs.contents[0].parts[1]).toMatchObject({ fileData: { fileUri: 'gs://bucket/a.jpg' } });
            expect(callArgs.contents[1].parts[1]).toMatchObject({ fileData: { fileUri: 'gs://bucket/b.jpg' } });
            expect(callArgs.contents[2].parts[1]).toMatchObject({ fileData: { fileUri: 'gs://bucket/c.jpg' } });
            expect(callArgs.contents[3].parts[0]).toMatchObject({ text: 'multi-style test' });
        });

        it('should inject multiple style references for Imagen editImage', async () => {
            vi.mocked(mockGoogleGenAI.models.editImage).mockResolvedValue({} as any);

            await provider.generateImages({
                model: 'imagen-3.0-capability-001',
                prompt: 'multi-style imagen',
                styleReferences: [
                    'gs://bucket/a.jpg',
                    'gs://bucket/b.jpg',
                    'gs://bucket/c.jpg',
                ],
                config: {},
            });

            const callArgs = vi.mocked(mockGoogleGenAI.models.editImage).mock.calls[0][0];
            expect(callArgs.referenceImages).toHaveLength(3);

            expect(callArgs.referenceImages[0].referenceImage.gcsUri).toBe('gs://bucket/a.jpg');
            expect(callArgs.referenceImages[1].referenceImage.gcsUri).toBe('gs://bucket/b.jpg');
            expect(callArgs.referenceImages[2].referenceImage.gcsUri).toBe('gs://bucket/c.jpg');

            // Each carries the style description
            for (const ref of callArgs.referenceImages) {
                expect(ref.config.styleDescription).toBe('Project-wide style reference');
            }
        });
    });
});
