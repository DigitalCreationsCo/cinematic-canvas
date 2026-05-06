import { createBuilder } from "#shared/mocks/mock-db.js";
import { createMockProjectMetadata } from "#shared/mocks/mock-metadata.js";
import { createMockProject } from "#shared/mocks/mock-project.js";

import { db as mockedDb } from "#shared/db/index.js";
import { describe, it, expect, vi, beforeEach, type Mock, type Mocked } from "vitest";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { generateId } from "#shared/utils/id.js";
import type { Project } from "#shared/db/schema.types.js";

describe("ProjectRepository Metadata Preservation", () => {
  let repo: ProjectRepository;
  let projectId: string;
  let existingProject: Project;
  let db: Mocked<typeof mockedDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    projectId = generateId();
    db = mockedDb as Mocked<typeof mockedDb>;

    existingProject = createMockProject({
      id: projectId,
      metadata: createMockProjectMetadata({
        initialPrompt: "Test prompt",
        projectId,
        bpm: 140,
        keySignature: "G Minor",
        audioGcsUri: "gs://bucket/audio.mp3",
        audioPublicUri: "https://example.com/audio.mp3",
      }),
      storyboard: {
        scenes: [],
        characters: [],
        locations: [],
        metadata: createMockProjectMetadata({
          projectId,
          bpm: 140,
          keySignature: "G Minor",
        }),
      },
      forceRegenerateSceneIds: [],
      generationRules: [],
      generationRulesHistory: [],
      status: "pending",
      currentSceneIndex: 0,
    });

    // Wire transaction to call through to its callback so that any
    // updateProject / getProject logic wrapped in db.transaction() works.
    (db.transaction as Mock).mockImplementation((cb: (tx: typeof db) => any) => cb(db));

    // db.select returns existingProject for every call by default.
    // This covers both the main project row and any fetchProjectAssetsLite
    // sub-queries (which will just resolve to the same row — harmless).
    (db.select as Mock).mockReturnValue(createBuilder([existingProject]));

    // db.update defaults to returning the existingProject so that tests
    // which only care about preserving values don't need extra setup.
    (db.update as Mock).mockReturnValue(createBuilder([existingProject]));

    repo = new ProjectRepository();
  });

  describe("metadata update with JSONB merge", () => {
    it("should preserve existing metadata properties when updating with partial metadata", async () => {
      const mergedProject: Project = {
        ...existingProject,
        metadata: { ...existingProject.metadata, title: "Updated Title" },
      };
      (db.update as Mock).mockReturnValue(createBuilder([mergedProject]));
      repo.getProjectFullState = vi.fn().mockResolvedValue(mergedProject);

      const result = await repo.updateProject(projectId, {
        metadata: { title: "Updated Title" },
      });

      expect(result.metadata.title).toBe("Updated Title");
      expect(result.metadata.bpm).toBe(140);
      expect(result.metadata.keySignature).toBe("G Minor");
      expect(result.metadata.audioGcsUri).toBe("gs://bucket/audio.mp3");
      expect(result.metadata.audioPublicUri).toBe("https://example.com/audio.mp3");
      expect(result.metadata.initialPrompt).toBe("Test prompt");
    });

    it("should NOT overwrite existing properties with undefined values", async () => {
      const current = await repo.getProject(projectId);
      expect(current.metadata.audioGcsUri).toBe("gs://bucket/audio.mp3");

      // After stripping undefineds, Postgres JSONB merge preserves existing
      // audio / bpm fields — simulate that here.
      const mergedProject: Project = {
        ...existingProject,
        metadata: {
          ...existingProject.metadata,
          title: "Undefined Test",
        },
      };
      (db.update as Mock).mockReturnValue(createBuilder([mergedProject]));
      repo.getProjectFullState = vi.fn().mockResolvedValue(mergedProject);

      const result = await repo.updateProject(projectId, {
        metadata: {
          title: "Undefined Test",
          bpm: 0,
        },
      });

      expect(result.metadata.audioGcsUri).toBe("gs://bucket/audio.mp3");
      expect(result.metadata.audioPublicUri).toBe("https://example.com/audio.mp3");
      expect(result.metadata.bpm).toBe(140);
      expect(result.metadata.title).toBe("Undefined Test");

      // Confirm undefined / falsy values were stripped before hitting the DB.
      const [[setPayload]] = (db.update as Mock).mock.calls;
      expect(setPayload).not.toHaveProperty("metadata.audioGcsUri", undefined);
      expect(setPayload).not.toHaveProperty("metadata.bpm", undefined);
    });

    it("should properly merge nested metadata updates from storyboard generation", async () => {
      const existing = await repo.getProject(projectId);
      const { bpm: originalBpm, keySignature: originalKeySignature, audioGcsUri: originalAudioUri } = existing.metadata;

      const storyboardMetadata = { title: "New Storyboard Title", style: "noir", mood: "dark" };

      const mergedProject: Project = {
        ...existingProject,
        metadata: { ...existingProject.metadata, ...storyboardMetadata },
      };
      (db.update as Mock).mockReturnValue(createBuilder([mergedProject]));
      repo.getProjectFullState = vi.fn().mockResolvedValue(mergedProject);

      const result = await repo.updateProject(projectId, {
        metadata: { ...existing.metadata, ...storyboardMetadata },
      });

      expect(result.metadata.title).toBe("New Storyboard Title");
      expect(result.metadata.style).toBe("noir");
      expect(result.metadata.bpm).toBe(originalBpm);
      expect(result.metadata.keySignature).toBe(originalKeySignature);
      expect(result.metadata.audioGcsUri).toBe(originalAudioUri);
    });

    it("should handle undefined values in metadata updates correctly", async () => {
      const existing = await repo.getProject(projectId);

      const mergedProject: Project = {
        ...existingProject,
        metadata: {
          ...existingProject.metadata,
          title: "Updated",
        },
      };
      (db.update as Mock).mockReturnValue(createBuilder([mergedProject]));
      repo.getProjectFullState = vi.fn().mockResolvedValue(mergedProject);

      const result = await repo.updateProject(projectId, {
        metadata: {
          ...existing.metadata,
          title: "Updated",
          bpm: 0,
          keySignature: "",
          audioGcsUri: "",
        },
      });

      expect(result.metadata.bpm).toBe(existing.metadata.bpm);
      expect(result.metadata.keySignature).toBe(existing.metadata.keySignature);
      expect(result.metadata.audioGcsUri).toBe(existing.metadata.audioGcsUri);
    });
  });
});
