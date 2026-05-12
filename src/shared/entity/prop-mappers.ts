import { PropWithAssets, PropBase, Prop } from "../types/workflow.types.js";
import { InsertProp } from "../types/schema.types.js";
import { AssetRegistry } from "../types/assets.types.js";
import { z } from "zod";
import { props } from "../db/schema.js";
import { PropCondensed } from "#shared/types/storyboard.types.js";
import { getAllBestAssets } from "#shared/utils/assets.utils.js";

export function mapPropHydrationPayloadToProp(payload: Prop): Prop {
  return Prop.parse(payload);
}

export function mapPropWithAssetsToDomainProp(
  entity: typeof props.$inferInsert & { assets: AssetRegistry },
): PropWithAssets {
  const cleaned = entity.worldId === null ? { ...entity, worldId: undefined } : entity;
  return PropWithAssets.parse(JSON.parse(JSON.stringify(cleaned)));
}

export function mapDomainPropToInsertProp(prop: z.input<typeof InsertProp>): z.infer<typeof InsertProp> {
  return InsertProp.parse(prop);
}

export function mapPropWithAssetsToPropBase(prop: PropBase): PropBase {
  return PropBase.parse(prop);
}

/**
 * Transforms a scene into a condensed scene, used for the storyboard view.
 * Description is intentionally sourced from the best versioned asset rather
 * than a column value, because descriptions for all entity types are stored as
 * versioned assets (see schema). CharacterWithAssets / LocationWithAssets /
 * SceneWithAssets omit the description column for exactly this reason.
 */
export function condenseProp(prop: PropWithAssets): PropCondensed {
  const description = getAllBestAssets(prop.assets)["description"]?.data ?? "";
  return PropCondensed.parse({ ...prop, description });
}
