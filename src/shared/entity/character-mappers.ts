import { InsertCharacter, SceneToCharacterJoin } from "#shared/types/schema.types.js";
import { CharacterWithAssets, CharacterBase, Character } from "#shared/types/workflow.types.js";
import { CharacterAttributes } from "#shared/types/character.types.js";
import { SceneWithAssets } from "#shared/types/workflow.types.js";
import { AssetRegistry } from "#shared/types/assets.types.js";
import { z } from "zod";
import { hydrateEntity } from "#shared/utils/entity.utils.js";
import { characters } from "#shared/db/schema.js";
import { CharacterCondensed } from "#shared/types/storyboard.types.js";

export function mapCharacterHydrationPayloadToCharacter(payload: Character): Character {
  return Character.parse(payload);
}

export function mapCharacterWithAssetsToDomainCharacter(
  entity: typeof characters.$inferInsert & { assets: AssetRegistry },
): CharacterWithAssets {
  const parsed = JSON.parse(JSON.stringify(entity));
  return CharacterWithAssets.parse(parsed);
}

export function mapDomainCharacterToInsertCharacter(
  char: z.input<typeof InsertCharacter>,
): z.infer<typeof InsertCharacter> {
  return InsertCharacter.parse(char);
}

export function mapCharacterWithAssetsToCharacterAttributes(char: CharacterWithAssets): CharacterAttributes {
  return CharacterAttributes.parse(hydrateEntity(char, char.assets));
}

export function mapCharacterWithAssetsToCharacterBase(char: CharacterBase): CharacterBase {
  return CharacterBase.parse(char);
}

export function condenseCharacter(character: {
  id: string;
  referenceId: string;
  name: string;
  description: string;
}): CharacterCondensed {
  return CharacterCondensed.parse(character);
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
      .filter((charId): charId is string => typeof charId === "string" && charId.length > 0)
      .map((charId) => ({
        sceneId: patch.id,
        characterId: charId,
      }));
  });
}
