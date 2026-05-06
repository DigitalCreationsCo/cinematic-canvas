import { generateId } from "#shared/utils/id.js";
import type { Project } from "#shared/types/schema.types.js";
import { createMockScene } from "#shared/mocks/mock-scene.js";
import { createMockCharacter } from "#shared/mocks/mock-character.js";
import { createMockLocation } from "#shared/mocks/mock-location.js";
import { createMockProjectMetadata } from "#shared/mocks/mock-metadata.js";
import { AssetRegistry } from "#shared/types/assets.types.js";
import { buildAssetRegistryFromMockKV, KVAssetsMap } from "#shared/mocks/mock.utils.js";
import { ProjectMetadata } from "#shared/types/metadata.types.js";
import { hydrateEntity } from "#shared/utils/entity.utils.js";

type ProjectKV = Omit<Project, "metadata" | "assets"> & {
  metadata: Partial<ProjectMetadata>;
  assets?: KVAssetsMap;
};

export const createMockProject = (overrides?: Partial<ProjectKV>): Project => {
  const projectId = overrides?.id ?? generateId();
  const timestamp = new Date();
  const scenes = overrides?.scenes ?? [
    createMockScene({ projectId, sceneIndex: 0, name: "Opening Scene", assets: { description: "Scene description" } }),
    createMockScene({ projectId, sceneIndex: 1, name: "Middle Scene", assets: { description: "Scene description" } }),
  ];
  const characters = overrides?.characters ?? [
    createMockCharacter({ projectId, name: "Protagonist", assets: { description: "Character description" } }),
  ];
  const locations = overrides?.locations ?? [
    createMockLocation({ projectId, name: "Main Location", assets: { description: "Location description" } }),
  ];

  const metadata = createMockProjectMetadata({ ...overrides?.metadata });
  return {
    id: projectId,
    teamId: overrides?.teamId ?? generateId(),
    worldId: overrides?.worldId ?? generateId(),
    guidanceLevel: overrides?.guidanceLevel ?? 1,
    sacForkRepoId: overrides?.sacForkRepoId ?? generateId(),
    sacForkRepoUrl: overrides?.sacForkRepoUrl ?? "https://github.com/example/repo",
    createdAt: overrides?.createdAt ?? timestamp,
    updatedAt: overrides?.updatedAt ?? timestamp,

    metadata,

    storyboard: {
      metadata,
      scenes: scenes.map((s) => hydrateEntity(s, s.assets)),
      characters: characters.map((c) => hydrateEntity(c, c.assets)),
      locations: locations.map((l) => hydrateEntity(l, l.assets)),
      ...overrides?.storyboard,
    },
    audioAnalysis: overrides?.audioAnalysis ?? null,
    generationRules: overrides?.generationRules ?? [],
    generationRulesHistory: overrides?.generationRulesHistory ?? [],
    currentSceneIndex: overrides?.currentSceneIndex ?? 0,
    status: overrides?.status ?? "pending",
    forceRegenerateSceneIds: overrides?.forceRegenerateSceneIds ?? [],

    scenes,
    characters,
    locations,

    assets: overrides?.assets ? buildAssetRegistryFromMockKV(overrides.assets) : AssetRegistry.parse({}),
  };
};
