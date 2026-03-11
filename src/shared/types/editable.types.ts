// shared/types/editable.types.ts
// Defines the editable field sets for each entity type.
// Used by PATCH /api/entities and the client debounce layer.

import { z } from 'zod';
import { SceneAttributes, SceneStatus } from './scene.types.js';
import { CharacterAttributes } from './character.types.js';
import { LocationAttributes } from './location.types.js';
import { AssetKey } from './assets.types.js';

// ============================================================================
// EDITABLE FIELD TYPES
// All fields are editable — use exclude by property name if restrictions needed later.
// Applicable asset keys are annotated per entity type.
// ============================================================================

export const SCENE_APPLICABLE_ASSET_KEYS: AssetKey[] = [
  'scene_video',
  'scene_start_frame',
  'scene_end_frame',
  'scene_description',
  'scene_prompt',
  'start_frame_prompt',
  'end_frame_prompt',
];

export const CHARACTER_APPLICABLE_ASSET_KEYS: AssetKey[] = [
  'character_image',
  'character_description',
  'character_prompt',
];

export const LOCATION_APPLICABLE_ASSET_KEYS: AssetKey[] = [
  'location_image',
  'location_description',
  'location_prompt',
];

// Editable fields for each entity — all fields from domain types are included.
export type EditableSceneFields = Partial<
  z.infer<typeof SceneAttributes> & z.infer<typeof SceneStatus>
>;

export type EditableCharacterFields = Partial<
  z.infer<typeof CharacterAttributes>
>;

export type EditableLocationFields = Partial<
  z.infer<typeof LocationAttributes>
>;

// ============================================================================
// ENTITY PATCH — discriminated union for type-safe batch updates
// ============================================================================

export type EntityPatch =
  | { entityId: string; entityType: 'scene';     patch: EditableSceneFields }
  | { entityId: string; entityType: 'character'; patch: EditableCharacterFields }
  | { entityId: string; entityType: 'location';  patch: EditableLocationFields };

// ============================================================================
// BATCH REQUEST BODY — sent to PATCH /api/entities
// ============================================================================

export interface BatchEntityUpdateRequest {
  projectId: string;
  updates: EntityPatch[];
}
