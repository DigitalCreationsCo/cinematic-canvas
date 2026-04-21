// shared/types/editable.types.ts
// Defines the editable field sets for each entity type.
// Used by PATCH /api/entities and the client debounce layer.

import { z } from 'zod';
import { SceneAttributes, SceneStatus } from './scene.types.js';
import { CharacterAttributes } from './character.types.js';
import { LocationAttributes } from './location.types.js';
import { AssetKey, EntityInsertUnion, EntityType } from './assets.types.js';
import { CharacterBase, LocationBase, PropAttributes, PropBase, SceneBase, UploadResult } from '#shared/types/index.js';

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

export type AnyGenerateEntity =
  | CharacterEntity
  | LocationEntity
  | SceneEntity
  | PropEntity
  | FileEntity;

export type CharacterEntity = {
  entityType: 'character';
  data: Partial<CharacterAttributes> & { id: string };
  images?: UploadResult[];
};

export type LocationEntity = {
  entityType: 'location';
  data: Partial<LocationAttributes> & { id: string };
  images?: UploadResult[];
};

export type SceneEntity = {
  entityType: 'scene';
  data: Partial<SceneAttributes> & { id: string };
  images?: UploadResult[];
};

export type PropEntity = {
  entityType: 'prop';
  data: Partial<PropAttributes> & { id: string };
  images?: UploadResult[];
};

export type FileEntity = {
  entityType: 'file';
  data: Partial<PropAttributes> & { id: string };
  images?: UploadResult[];
};

export type GenerateEntity<T> =
  | {
    entityType: 'scene';
    data: Partial<T> & { id: string };
    images?: UploadResult[];
  }
  | {
    entityType: 'character';
    data: Partial<T> & { id: string };
    images?: UploadResult[];
  }
  | {
    entityType: 'location';
    data: Partial<T> & { id: string };
    images?: UploadResult[];
  }
  | {
    entityType: 'prop';
    data: Partial<T> & { id: string };
    images?: UploadResult[];
  }
  | {
    entityType: 'file';
    data: Partial<T> & { id: string };
    images?: UploadResult[];
  };

export const SceneInsertEntityInput = z.object({
  entityType: z.literal('scene'),
  data: SceneBase,
  images: z.array(UploadResult)
});
export type SceneInsertEntityInput = z.infer<typeof SceneInsertEntityInput>;

export const CharacterInsertEntityInput = z.object({
  entityType: z.literal('character'),
  data: CharacterBase,
  images: z.array(UploadResult)
});
export type CharacterInsertEntityInput = z.infer<typeof CharacterInsertEntityInput>;

export const LocationInsertEntityInput = z.object({
  entityType: z.literal('location'),
  data: LocationBase,
  images: z.array(UploadResult)
});
export type LocationInsertEntityInput = z.infer<typeof LocationInsertEntityInput>;

export const PropInsertEntityInput = z.object({
  entityType: z.literal('prop'),
  data: PropBase,
  images: z.array(UploadResult)
});
export type PropInsertEntityInput = z.infer<typeof PropInsertEntityInput>;

export const FileInsertEntityInput = z.object({
  entityType: z.literal('file'),
  data: PropBase,
  images: z.array(UploadResult)
});
export type FileInsertEntityInput = z.infer<typeof FileInsertEntityInput>;

export const InsertEntitiesInput = z.array(z.union([
  SceneInsertEntityInput,
  CharacterInsertEntityInput,
  LocationInsertEntityInput,
  PropInsertEntityInput,
  FileInsertEntityInput,
]));
export type InsertEntitiesInput = z.infer<typeof InsertEntitiesInput>;

export type EntityPatch =
  | { entityId: string; entityType: 'scene'; patch: EditableSceneFields }
  | { entityId: string; entityType: 'character'; patch: EditableCharacterFields }
  | { entityId: string; entityType: 'location'; patch: EditableLocationFields };

// ============================================================================
// BATCH REQUEST BODY — sent to PATCH /api/entities
// ============================================================================

export interface BatchEntityInsertRequest {
  projectId: string;
  inserts: InsertEntitiesInput;
}

export interface BatchEntityUpdateRequest {
  projectId: string;
  updates: EntityPatch[];
}
