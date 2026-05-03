import { CharacterWithAssets } from "../../types/workflow.types.js";
import { CharacterState } from "../../types/character.types.js";
import { generateId } from "#shared/utils/id.js";
import { AssetRegistry } from "../../types/assets.types.js";
import { buildAssetRegistryFromMockKV, KVAssetsMap } from "#shared/mocks/mock.utils.js";

type CharacterWithAssetKV = Omit<CharacterWithAssets, 'assets'> & {
    assets?: KVAssetsMap;
    description?: string;
};

export const createMockCharacter = (overrides?: Partial<CharacterWithAssetKV>): CharacterWithAssets => {
    const projectId = overrides?.projectId ?? generateId();
    const timestamp = new Date();

    const mappedAssets = overrides?.assets
        ? buildAssetRegistryFromMockKV(overrides.assets)
        : AssetRegistry.parse({});


    return {
        // IdentityBase
        id: overrides?.id ?? generateId(),
        createdAt: overrides?.createdAt ?? timestamp,
        updatedAt: overrides?.updatedAt ?? timestamp,

        // ProjectRef
        projectId,
        worldId: overrides?.worldId ?? generateId(),

        // CharacterAttributes
        referenceId: overrides?.referenceId ?? `char-${Math.random().toString(36).slice(2, 8)}`,
        name: overrides?.name ?? "Test Character",
        description: overrides?.description ?? "",
        aliases: overrides?.aliases ?? [],
        physicalTraits: {
            gender: "male",
            age: "30s",
            hair: "short dark hair",
            clothing: ["casual t-shirt", "jeans"],
            accessories: [],
            distinctiveFeatures: [],
            build: "average",
            ethnicity: "",
            appearanceNotes: [],
            ...overrides?.physicalTraits
        },
        state: {
            ...CharacterState.parse({}),
            ...overrides?.state
        },
        // AssetRegistry
        assets: mappedAssets,
    };
};
