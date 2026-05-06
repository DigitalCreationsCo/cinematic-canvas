import "#shared/mocks/mock-db.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { Mocked, vi } from "vitest";

const { _mockProjectRepository } = await vi.hoisted(async () => {
  const { createMockProject } = await import("#shared/mocks/mock-project.js");
  const _create = (overrides: Partial<Mocked<ProjectRepository>> = {}): Mocked<ProjectRepository> =>
    ({
      getProject: vi.fn().mockResolvedValue(createMockProject()),
      getProjectScenes: vi.fn().mockResolvedValue([]),
      getProjectCharacters: vi.fn().mockResolvedValue([]),
      getProjectLocations: vi.fn().mockResolvedValue([]),
      getScenesByIds: vi.fn().mockResolvedValue([]),
      getCharactersByIds: vi.fn().mockResolvedValue([]),
      getLocationsByIds: vi.fn().mockResolvedValue([]),
      getProjectFullState: vi.fn().mockResolvedValue(createMockProject()),
      isEntityActive: vi.fn().mockResolvedValue(false),
      getProjects: vi.fn().mockResolvedValue([]),
      getProjectsForUser: vi.fn().mockResolvedValue([]),
      getProjectManifest: vi.fn().mockResolvedValue({}),
      buildInitialProject: vi.fn().mockResolvedValue({}),
      createProject: vi.fn().mockResolvedValue({}),
      updateProject: vi.fn().mockResolvedValue({}),
      deleteProject: vi.fn().mockResolvedValue({}),
      deleteSceneAndAssets: vi.fn().mockResolvedValue({}),
      createScenes: vi.fn().mockResolvedValue([]),
      upsertScenes: vi.fn().mockResolvedValue([]),
      updateScenes: vi.fn().mockResolvedValue([]),
      deleteScenes: vi.fn().mockResolvedValue([]),
      createCharacters: vi.fn().mockResolvedValue([]),
      upsertCharacters: vi.fn().mockResolvedValue([]),
      createLocations: vi.fn().mockResolvedValue([]),
      upsertLocations: vi.fn().mockResolvedValue([]),
      updateCharacters: vi.fn().mockResolvedValue([]),
      createProps: vi.fn().mockResolvedValue([]),
      upsertProps: vi.fn().mockResolvedValue([]),
      updateProps: vi.fn().mockResolvedValue([]),
      getProjectProps: vi.fn().mockResolvedValue([]),
      getPropsByIds: vi.fn().mockResolvedValue([]),
      getLocationsByReferenceIds: vi.fn().mockResolvedValue([]),
      updateLocations: vi.fn().mockResolvedValue([]),
      appendProjectForceRegenerateSceneIds: vi.fn().mockResolvedValue({}),
      createEntities: vi.fn().mockResolvedValue([]),
      patchEntities: vi.fn().mockResolvedValue([]),
      deleteEntity: vi.fn().mockResolvedValue({}),
      fetchProjectAssetsLite: vi.fn().mockResolvedValue([]),
      fetchProjectAssetsFull: vi.fn().mockResolvedValue({}),
      fetchSceneAssetsFull: vi.fn().mockResolvedValue({}),
      fetchCharacterAssetsFull: vi.fn().mockResolvedValue({}),
      fetchPropAssetsFull: vi.fn().mockResolvedValue({}),
      fetchLocationAssetsFull: vi.fn().mockResolvedValue({}),
      buildRegistryFromResults: vi.fn().mockResolvedValue({}),
      getEntities: vi.fn(),
      ...overrides,
    }) as unknown as Mocked<ProjectRepository>;

  return { _mockProjectRepository: _create() };
});

vi.mock("#shared/services/project-repository.js", () => {
  return {
    ProjectRepository: class {
      constructor() {
        return _mockProjectRepository;
      }
    },
  };
});

export function createMockProjectRepository() {
  return _mockProjectRepository;
}

export const mockProjectRepository = createMockProjectRepository();
