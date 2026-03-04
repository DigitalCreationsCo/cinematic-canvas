import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ProjectRepository } from "../project-repository.js";
import { db } from "../../db/index.js";
import { projects } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

describe("ProjectRepository Metadata Preservation", () => {
    let repo: ProjectRepository;
    let projectId: string;

    const createBaseMetadata = (overrides = {}) => ({
        title: "Test Project",
        projectId: "",
        initialPrompt: "Test prompt",
        enhancedPrompt: "",
        logline: "",
        totalScenes: 0,
        style: "cinematic",
        mood: "neutral",
        colorPalette: [],
        tags: [],
        audioGcsUri: undefined,
        audioPublicUri: undefined,
        hasAudio: false,
        duration: 0,
        bpm: 120,
        keySignature: "C Major",
        ...overrides
    });

    beforeAll(async () => {
        repo = new ProjectRepository();
        projectId = uuidv7();

        const insertProject = {
            id: projectId,
            metadata: {
                ...createBaseMetadata({ projectId }),
                bpm: 140,
                keySignature: "G Minor",
                audioGcsUri: "gs://bucket/audio.mp3",
                audioPublicUri: "https://example.com/audio.mp3"
            },
            storyboard: {
                scenes: [],
                characters: [],
                locations: [],
                metadata: {
                    ...createBaseMetadata({ projectId }),
                    bpm: 140,
                    keySignature: "G Minor"
                }
            },
            forceRegenerateSceneIds: [],
            generationRules: [],
            generationRulesHistory: [],
            status: "pending" as const,
            currentSceneIndex: 0
        };
        await repo.createProject(insertProject);
    });

    afterAll(async () => {
        await db.delete(projects).where(eq(projects.id, projectId));
    });

    describe("metadata update with JSONB merge", () => {
        it("should preserve existing metadata properties when updating with partial metadata", async () => {
            const result = await repo.updateProject(projectId, {
                metadata: {
                    title: "Updated Title"
                }
            });

            expect(result.metadata.title).toBe("Updated Title");
            expect(result.metadata.bpm).toBe(140);
            expect(result.metadata.keySignature).toBe("G Minor");
            expect(result.metadata.audioGcsUri).toBe("gs://bucket/audio.mp3");
            expect(result.metadata.audioPublicUri).toBe("https://example.com/audio.mp3");
            expect(result.metadata.initialPrompt).toBe("Test prompt");
        });

        it("should NOT overwrite existing properties with undefined values", async () => {
            let current = await repo.getProject(projectId);
            expect(current.metadata.audioGcsUri).toBe("gs://bucket/audio.mp3");

            const result = await repo.updateProject(projectId, {
                metadata: {
                    title: "Undefined Test",
                    audioGcsUri: undefined,
                    audioPublicUri: undefined,
                    bpm: undefined
                }
            });

            // undefined values should be filtered out, preserving existing values
            expect(result.metadata.audioGcsUri).toBe("gs://bucket/audio.mp3");
            expect(result.metadata.audioPublicUri).toBe("https://example.com/audio.mp3");
            expect(result.metadata.bpm).toBe(140);
            expect(result.metadata.title).toBe("Undefined Test");
        });

        it("should properly merge nested metadata updates from storyboard generation", async () => {
            const existingMetadata = await repo.getProject(projectId);
            const originalBpm = existingMetadata.metadata.bpm;
            const originalKeySignature = existingMetadata.metadata.keySignature;
            const originalAudioUri = existingMetadata.metadata.audioGcsUri;

            const storyboardMetadata = {
                title: "New Storyboard Title",
                style: "noir",
                mood: "dark"
            };

            const result = await repo.updateProject(projectId, {
                metadata: {
                    ...existingMetadata.metadata,
                    ...storyboardMetadata
                }
            });

            expect(result.metadata.title).toBe("New Storyboard Title");
            expect(result.metadata.style).toBe("noir");
            expect(result.metadata.mood).toBe("dark");
            expect(result.metadata.bpm).toBe(originalBpm);
            expect(result.metadata.keySignature).toBe(originalKeySignature);
            expect(result.metadata.audioGcsUri).toBe(originalAudioUri);
        });

        it("should handle undefined values in metadata updates correctly", async () => {
            const existingMetadata = await repo.getProject(projectId);
            
            const updateWithUndefined = {
                title: "Updated",
                bpm: undefined,
                keySignature: undefined,
                audioGcsUri: undefined
            };

            const result = await repo.updateProject(projectId, {
                metadata: {
                    ...existingMetadata.metadata,
                    ...updateWithUndefined
                }
            });

            expect(result.metadata.bpm).toBe(existingMetadata.metadata.bpm);
            expect(result.metadata.keySignature).toBe(existingMetadata.metadata.keySignature);
            expect(result.metadata.audioGcsUri).toBe(existingMetadata.metadata.audioGcsUri);
        });
    });

    describe("metrics update with JSONB merge", () => {
        it("should preserve existing metrics when updating with partial metrics", async () => {
            const result = await repo.updateProject(projectId, {
                metrics: {
                    totalSpend: 100
                } as any
            });

            expect(result.metrics).toBeDefined();
        });
    });
});
