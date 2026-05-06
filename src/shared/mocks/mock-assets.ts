import { AssetEntry } from "#shared/types/schema.types.js";
import { generateId } from "#shared/utils/id.js";
import { AssetHistory, AssetVersion, Scope } from "#shared/types/assets.types.js";

export const createMockAssetEntry = (overrides: Partial<AssetEntry> = {}): AssetEntry => {
  const defaults: AssetEntry = {
    id: generateId(),
    head: 0,
    best: 0,
    bestLockedByFeedback: false,
    projectId: generateId(),
    assetKey: "audio_analysis",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { ...defaults, ...overrides };
};

export const createMockAssetMetadata = (): AssetVersion["metadata"] => ({
  evaluation: null,
  model: "test-model",
  jobId: "job-1",
});

export const createMockAssetVersion = (overrides?: Partial<AssetVersion>): AssetVersion => ({
  version: overrides?.version ?? 0,
  type: overrides?.type ?? "image",
  data: overrides?.data ?? `test-data`,
  metadata: createMockAssetMetadata(),
  startedAt: new Date(),
  createdAt: new Date(),
  ...overrides,
});

export const createEmptyHistory = (): AssetHistory => ({
  head: 0,
  best: 0,
  versions: [],
});

export const createHistoryWithVersions = (count: number): AssetHistory => {
  const versions: AssetVersion[] = [];
  for (let i = 1; i <= count; i++) {
    versions.push({
      version: i,
      type: "image",
      data: `data:image/png;base64,test${i}`,
      metadata: createMockAssetMetadata(),
      startedAt: new Date(),
      createdAt: new Date(`2024-01-${i.toString().padStart(2, "0")}`),
    });
  }
  return {
    head: count,
    best: count,
    versions,
  };
};

export const createProjectScope = (projectId: string): Scope => ({
  projectId,
});

export const createSceneScope = (projectId: string, sceneIds: string[]): Scope => ({
  projectId,
  sceneIds,
});

export const createCharacterScope = (projectId: string, characterIds: string[]): Scope => ({
  projectId,
  characterIds,
});

export const createLocationScope = (projectId: string, locationIds: string[]): Scope => ({
  projectId,
  locationIds,
});
