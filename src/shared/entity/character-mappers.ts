import {
    InsertCharacter,
    Scene,
    SceneToCharacterJoin,
    CharacterWithAssets,
} from "../types/index.js";
import { z } from "zod";

export function mapDbCharacterToDomain(entity: CharacterWithAssets): CharacterWithAssets {
    const parsed = JSON.parse(JSON.stringify(entity));
    return CharacterWithAssets.parse(parsed);
}

export function mapDomainCharacterToInsertCharacterDb(char: z.input<typeof InsertCharacter>): z.infer<typeof InsertCharacter> {
    return InsertCharacter.parse(char);
}

/**
 * Extracts scene-to-character join records from scene drafts.
 * Ensures the character reference list is flattened into a format 
 * compatible with the scenesToCharacters join table.
 */
export function extractCharacterJoins(sceneDrafts: Scene[]): SceneToCharacterJoin[] {
    return sceneDrafts.flatMap((draft) => {
        if (!draft.id || !Array.isArray(draft.characterIds) || draft.characterIds.length === 0) {
            return [];
        }

        return draft.characterIds
            .filter((charId): charId is string => typeof charId === 'string' && charId.length > 0)
            .map((charId) => ({
                sceneId: draft.id,
                characterId: charId,
            }));
    });
}