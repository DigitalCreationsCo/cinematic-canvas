import { PropWithAssets, PropBase, Prop } from "../types/workflow.types.js";
import { InsertProp } from "../types/schema.types.js";
import { AssetRegistry } from "../types/assets.types.js";
import { z } from "zod";
import { props } from "../db/schema.js";


export function mapPropHydrationPayloadToProp(payload: Prop): Prop {
    return Prop.parse(payload);
}

export function mapPropWithAssetsToDomainProp(entity: typeof props.$inferInsert & { assets: AssetRegistry }): PropWithAssets {
    const cleaned = entity.worldId === null ? { ...entity, worldId: undefined } : entity;
    return PropWithAssets.parse(JSON.parse(JSON.stringify(cleaned)));
};

export function mapDomainPropToInsertProp(prop: z.input<typeof InsertProp>): z.infer<typeof InsertProp> {
    return InsertProp.parse(prop);
}

export function mapPropWithAssetsToPropBase(prop: PropBase): PropBase {
    return PropBase.parse(prop);
}

