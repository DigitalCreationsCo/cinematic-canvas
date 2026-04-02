// @ts-nocheck
import { CharacterWithAssets, CharacterState, AssetKey, Character, AssetVersion, AssetHistory } from "../../types/index.js";
import { generateId } from "#shared/utils/id.js";
import { AssetRegistry } from "../../types/index.js";
import { createMockAssetVersion, createEmptyHistory } from "../mock-assets.js";

type CharacterWithAssetKV = Omit<CharacterWithAssets, 'assets'> & {
    assets?: Partial<Record<AssetKey, string>>;
};

export const createMockCharacter = (overrides?: Partial<CharacterWithAssetKV>): CharacterWithAssets => {
    const projectId = overrides?.projectId ?? generateId();
    const timestamp = new Date();

    const mappedAssets = overrides?.assets
        ? Object.entries(overrides.assets).reduce((acc, [key, value]) => {

            acc[key as AssetKey] = {
                ...createEmptyHistory(),
                versions: [
                    createMockAssetVersion({
                        data: value,
                    })
                ]
            };
            return acc;
        }, {} as Partial<Record<AssetKey, AssetHistory>>)
        : AssetRegistry.parse({});


    return {
        // IdentityBase
        id: overrides?.id ?? generateId(),
        createdAt: overrides?.createdAt ?? timestamp,
        updatedAt: overrides?.updatedAt ?? timestamp,
        // ProjectRef
        projectId,
        // CharacterAttributes
        referenceId: overrides?.referenceId ?? `char-${Math.random().toString(36).slice(2, 8)}`,
        name: overrides?.name ?? "Test Character",
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