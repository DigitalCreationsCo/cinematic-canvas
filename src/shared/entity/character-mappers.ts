import {
    InsertCharacter,
    Scene,
    SceneToCharacterJoin,
    CharacterWithAssets,
    CharacterAttributes,
    Character,
    SceneEntity,
    CharacterBase,
    SceneWithAssets,
} from "../types/index.js";
import { z } from "zod";
import { hydrateEntity } from "../utils/entity.utils.js";

export function mapCharacterWithAssetsToDomainCharacter(entity: CharacterWithAssets): CharacterWithAssets {
    const parsed = JSON.parse(JSON.stringify(entity));
    return CharacterWithAssets.parse(parsed);
}

export function mapDomainCharacterToInsertCharacter(char: z.input<typeof InsertCharacter>): z.infer<typeof InsertCharacter> {
    return InsertCharacter.parse(char);
}

export function mapCharacterWithAssetsToCharacterAttributes(char: CharacterWithAssets): CharacterAttributes {
    return CharacterAttributes.parse(hydrateEntity(char, char.assets));
}

export function mapCharacterWithAssetsToCharacterBase(char: CharacterBase): CharacterBase {
    return CharacterBase.parse(char);
}

/**
 * Extracts scene-to-character join records from scene patches.
 * Ensures the character reference list is flattened into a format 
 * compatible with the scenesToCharacters join table.
 */
export function extractCharacterJoins(scenePatches: SceneWithAssets[]): SceneToCharacterJoin[] {
    return scenePatches.flatMap((patch) => {
        if (!patch.id || !Array.isArray(patch.characterIds) || patch.characterIds.length === 0) {
            return [];
        }

        return patch.characterIds
            .filter((charId): charId is string => typeof charId === 'string' && charId.length > 0)
            .map((charId) => ({
                sceneId: patch.id,
                characterId: charId,
            }));
    });
}