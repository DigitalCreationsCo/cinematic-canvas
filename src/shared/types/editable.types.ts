// shared/types/editable.types.ts
// Defines the editable field sets for each entity type.
// Used by PATCH /api/entities and the client debounce layer.
import { z } from "zod";
import { SceneAttributes, SceneStatus } from "#shared/types/scene.types.js";
import { CharacterAttributes } from "#shared/types/character.types.js";
import { LocationAttributes } from "#shared/types/location.types.js";
import { AssetKey } from "#shared/types/assets.types.js";
import { IdentityBase, UploadResult } from "#shared/types/base.types.js";
import { EntityCreatableType, EntityPrimitiveType } from "#shared/types/entity.types.js";
import { PropAttributes } from "#shared/types/workflow.types.js";
import { InsertCharacter, InsertLocation, InsertProp, InsertScene } from "#shared/types/schema.types.js";

export const SCENE_APPLICABLE_ASSET_KEYS: AssetKey[] = [
  "scene_video",
  "scene_start_frame",
  "scene_end_frame",
  "description",
];

export const CHARACTER_APPLICABLE_ASSET_KEYS: AssetKey[] = ["character_image", "description"];

export const LOCATION_APPLICABLE_ASSET_KEYS: AssetKey[] = ["location_image", "description"];

export const PROP_APPLICABLE_ASSET_KEYS: AssetKey[] = ["image_file", "description"];

export type EditableSceneFields = Partial<
  z.infer<typeof SceneAttributes> &
    z.infer<typeof SceneStatus> & {
      locationId: string | null;
      startFrameSceneId: string | null;
    } & Record<(typeof SCENE_APPLICABLE_ASSET_KEYS)[number], string>
>;

export type EditableCharacterFields = Partial<
  z.infer<typeof CharacterAttributes> & Record<(typeof CHARACTER_APPLICABLE_ASSET_KEYS)[number], string>
>;

export type EditableLocationFields = Partial<
  z.infer<typeof LocationAttributes> & Record<(typeof LOCATION_APPLICABLE_ASSET_KEYS)[number], string>
>;

export type EditablePropFields = Partial<
  z.infer<typeof PropAttributes> & Record<(typeof PROP_APPLICABLE_ASSET_KEYS)[number], string>
>;

// ============================================================================
// ENTITY PATCH — discriminated union for type-safe batch updates
// ============================================================================

export type GenerateCharacterEntity = {
  entityType: "character";
  data: Partial<CharacterAttributes> & { id: string };
  images?: UploadResult[];
};

export type GenerateLocationEntity = {
  entityType: "location";
  data: Partial<LocationAttributes> & { id: string };
  images?: UploadResult[];
};

export type GenerateSceneEntity = {
  entityType: "scene";
  data: Partial<SceneAttributes> & { id: string };
  images?: UploadResult[];
};

export type GeneratePropEntity = {
  entityType: "prop";
  data: Partial<PropAttributes> & { id: string };
  images?: UploadResult[];
};

export type GenerateFileEntity = {
  entityType: "file";
  data: Partial<PropAttributes> & { id: string };
  images?: UploadResult[];
};

export type GenerateEntity<T extends EntityCreatableType> =
  | GenerateSceneEntity
  | GenerateCharacterEntity
  | GenerateLocationEntity
  | GeneratePropEntity
  | GenerateFileEntity;

export type GenerateEntitiesPayload = (
  | {
      entityType: "scene";
      data: Partial<SceneAttributes> & { id: string };
      images?: UploadResult[];
    }
  | {
      entityType: "character";
      data: Partial<CharacterAttributes> & { id: string };
      images?: UploadResult[];
    }
  | {
      entityType: "location";
      data: Partial<LocationAttributes> & { id: string };
      images?: UploadResult[];
    }
  | {
      entityType: "prop";
      data: Partial<PropAttributes> & { id: string };
      images?: UploadResult[];
    }
  | {
      entityType: "file";
      data: Partial<PropAttributes> & { id: string };
      images?: UploadResult[];
    }
)[];

export const CreateSceneWithEntitiesInput = z
  .object({
    id: IdentityBase.shape.id,
    charactersTextInput: z.array(z.string()).optional(),
    locationTextInput: z.string().optional(),
  })
  .and(SceneAttributes.partial());
export type CreateSceneWithEntitiesInput = z.infer<typeof CreateSceneWithEntitiesInput>;

export const SceneInsertEntityInput = z.object({
  entityType: z.literal("scene"),
  data: InsertScene,
  images: z.array(UploadResult).optional(),
});
export type SceneInsertEntityInput = z.infer<typeof SceneInsertEntityInput>;

export const CharacterInsertEntityInput = z.object({
  entityType: z.literal("character"),
  data: InsertCharacter,
  images: z.array(UploadResult).optional(),
});
export type CharacterInsertEntityInput = z.infer<typeof CharacterInsertEntityInput>;

export const LocationInsertEntityInput = z.object({
  entityType: z.literal("location"),
  data: InsertLocation,
  images: z.array(UploadResult).optional(),
});
export type LocationInsertEntityInput = z.infer<typeof LocationInsertEntityInput>;

export const PropInsertEntityInput = z.object({
  entityType: z.literal("prop"),
  data: InsertProp,
  images: z.array(UploadResult).optional(),
});
export type PropInsertEntityInput = z.infer<typeof PropInsertEntityInput>;

export const FileInsertEntityInput = z.object({
  entityType: z.literal("file"),
  data: InsertProp,
  images: z.array(UploadResult).optional(),
});
export type FileInsertEntityInput = z.infer<typeof FileInsertEntityInput>;

export const GetEntitiesInput = z.array(
  z.object({
    entityId: z.string(),
    entityType: EntityCreatableType,
  }),
);
export type GetEntitiesInput = z.infer<typeof GetEntitiesInput>;

export const InsertEntitiesInput = z.array(
  z.union([
    SceneInsertEntityInput,
    CharacterInsertEntityInput,
    LocationInsertEntityInput,
    PropInsertEntityInput,
    FileInsertEntityInput,
  ]),
);
export type InsertEntitiesInput = z.infer<typeof InsertEntitiesInput>;

export type EntityPatch =
  | { entityId: string; entityType: "scene"; patch: EditableSceneFields }
  | { entityId: string; entityType: "character"; patch: EditableCharacterFields }
  | { entityId: string; entityType: "location"; patch: EditableLocationFields }
  | { entityId: string; entityType: "prop"; patch: EditablePropFields };

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
