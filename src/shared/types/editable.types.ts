// shared/types/editable.types.ts
// Defines the editable field sets for each entity type.
// Used by PATCH /api/entities and the client debounce layer.

import { z } from 'zod';
import { SceneAttributes, SceneStatus } from './scene.types.js';
import { CharacterAttributes } from './character.types.js';
import { LocationAttributes } from './location.types.js';
import { AssetKey } from './assets.types.js';
import { InsertCharacter, InsertLocation, InsertScene } from '#shared/types/entity.types.js';

export const SCENE_APPLICABLE_ASSET_KEYS: AssetKey[] = [
  'scene_video',
  'scene_start_frame',
  'scene_end_frame',
  'description',
];

export const CHARACTER_APPLICABLE_ASSET_KEYS: AssetKey[] = [
  'character_image',
  'description',
];

export const LOCATION_APPLICABLE_ASSET_KEYS: AssetKey[] = [
  'location_image',
  'description',
];

export type EditableSceneFields = Partial<
  z.infer<typeof SceneAttributes> & z.infer<typeof SceneStatus> & {
    locationId: string | null;
    startFrameSceneId: string | null;
  } & Record<typeof SCENE_APPLICABLE_ASSET_KEYS[number], string>
>;

export type EditableCharacterFields = Partial<
  z.infer<typeof CharacterAttributes> & Record<typeof CHARACTER_APPLICABLE_ASSET_KEYS[number], string>
>;

export type EditableLocationFields = Partial<
  z.infer<typeof LocationAttributes> & Record<typeof LOCATION_APPLICABLE_ASSET_KEYS[number], string>
>;

// ============================================================================
// ENTITY PATCH — discriminated union for type-safe batch updates
// ============================================================================

export type EntityCreate =
  | { entityId: string; entityType: 'scene'; data: SceneAttributes }
  | { entityId: string; entityType: 'character'; data: CharacterAttributes }
  | { entityId: string; entityType: 'location'; data: LocationAttributes };

export type EntityPatch =
  | { entityId: string; entityType: 'scene'; patch: EditableSceneFields }
  | { entityId: string; entityType: 'character'; patch: EditableCharacterFields }
  | { entityId: string; entityType: 'location'; patch: EditableLocationFields };

// ============================================================================
// BATCH REQUEST BODY — sent to PATCH /api/entities
// ============================================================================

export interface BatchEntityCreateRequest {
  projectId: string;
  inserts: EntityCreate[];
}

export interface BatchEntityUpdateRequest {
  projectId: string;
  updates: EntityPatch[];
}
