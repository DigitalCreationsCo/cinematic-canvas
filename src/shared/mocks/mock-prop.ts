import { buildAssetRegistryFromMockKV, KVAssetsMap } from "#shared/mocks/mock.utils.js";
import { PropWithAssets } from "#shared/types/workflow.types.js";
import { generateId } from "#shared/utils/id.js";
import { AssetRegistry } from "#shared/types/assets.types.js";

type PropWithAssetsKV = Omit<PropWithAssets, "assets"> & {
  assets?: KVAssetsMap;
};

export const createMockProp = (overrides?: Partial<PropWithAssetsKV>): PropWithAssets => {
  const projectId = overrides?.projectId ?? generateId();
  const timestamp = new Date();

  return {
    id: overrides?.id ?? generateId(),
    createdAt: overrides?.createdAt ?? timestamp,
    updatedAt: overrides?.updatedAt ?? timestamp,

    projectId,
    worldId: overrides?.worldId ?? generateId(),

    referenceId: overrides?.referenceId ?? `loc-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides?.name ?? "Test Location",
    type: overrides?.type ?? "interior",
    assets: overrides?.assets ? buildAssetRegistryFromMockKV(overrides.assets) : AssetRegistry.parse({}),
  };
};
