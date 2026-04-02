import { describe, it, expect } from 'vitest';
import { getAllBestAssets } from '../assets-utils.js';
import type { AssetRegistry, AssetHistory, AssetVersion } from '../../types/assets.types.js';
import { extractPatchContent, hydrateProject, hydrateEntity, dehydrateEntityPatch } from "../entity.utils.js";
import { EntityPatch } from '../../types/editable.types.js';
import { createMockCharacter } from '../../mocks/index.js';



describe('extractPatchContent', () => {

  it('should process multiple entity types in a single batch', () => {
    const patches: EntityPatch[] = [
      {
        entityId: 'sc_1',
        entityType: 'scene',
        patch: { name: 'Intro', scene_video: 'vid_01' }
      },
      {
        entityId: 'ch_1',
        entityType: 'character',
        patch: { name: 'Hero', character_image: 'img_01' }
      }
    ];

    const results = extractPatchContent(patches);

    expect(results).toHaveLength(2);
    expect(results[0].assetUpdates).toHaveProperty('scene_video');
    expect(results[1].propertyUpdates).toHaveProperty('name');
  });
});

describe('hydrateProject', () => {

});

describe('hydrateEntity', () => {

  it('should hydrate entity with all asset properties', () => {
    const character = createMockCharacter({ assets: { description: "a character" } })
    expect(character.assets?.description?.versions[0].data).toBe("a character")

    const hydratedCharacter = hydrateEntity(character, character.assets)
    expect(hydratedCharacter.description).toBe("a character")
  });

  it('should handle null and undefined assets', () => {
    expect(getAllBestAssets(null)).toEqual({});
    expect(getAllBestAssets(undefined)).toEqual({});
  });
});

describe('dehydrateEntityPatch', () => {

  it('should correctly dehydrate an entity', () => {
    const patches: EntityPatch[] = [
      {
        entityId: 'sc_1',
        entityType: 'scene',
        patch: { name: 'Intro', scene_video: 'vid_01' }
      },
      {
        entityId: 'ch_1',
        entityType: 'character',
        patch: { name: 'Hero', character_image: 'img_01' }
      }
    ];

    const results = patches.map(patch => dehydrateEntityPatch(patch.entityType, patch.patch));

    expect(results).toHaveLength(2);
    expect(results[0].assetUpdates).toHaveProperty('scene_video');
    expect(results[1].entityUpdates).toHaveProperty('name');
  });
});