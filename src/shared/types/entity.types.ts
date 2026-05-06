// shared/types/entity.types.ts
import { z } from "zod";
import { CharacterBase, CharacterWithAssets, LocationBase, LocationWithAssets, PropBase, PropWithAssets, SceneBase, SceneWithAssets } from "#shared/types/workflow.types.js";

export const EntityPrimitiveType = z.enum(['character', 'location', 'project', 'prop', 'scene', 'file']);
export type EntityPrimitiveType = z.infer<typeof EntityPrimitiveType>;

export const EntityCreatableType = z.enum(['character', 'location', 'prop', 'scene']);
export type EntityCreatableType = z.infer<typeof EntityCreatableType>;

export const EntityMentionableType = z.enum(['character', 'location', 'prop']);
export type EntityMentionableType = z.infer<typeof EntityMentionableType>;

export const EntityImageType = z.enum(['character', 'location', 'prop', 'image']);
export type EntityImageType = z.infer<typeof EntityImageType>;
// | 'style_ref'
// | 'scene_frame'
// | 'asset';

export const EntityUnion = z.discriminatedUnion("entityType", [
  CharacterWithAssets,
  LocationWithAssets,
  SceneWithAssets,
  PropWithAssets,
]);
export type EntityUnion = z.infer<typeof EntityUnion>;

export const EntityInsertUnion = z.discriminatedUnion("entityType", [
  CharacterBase,
  LocationBase,
  SceneBase,
  PropBase,
]);
export type EntityInsertUnion = z.infer<typeof EntityInsertUnion>;

// ============================================================================
// GENERATION RULES
// ============================================================================

export const GenerationRules = z.array(z.string()).default([]).describe("Generation rule guidelines");
export type GenerationRules = z.infer<typeof GenerationRules>;
