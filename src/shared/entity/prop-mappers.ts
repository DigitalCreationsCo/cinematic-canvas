import {
    PropWithAssets,
    InsertProp,
    Prop,
    PropBase,
} from "../types/index.js";
import { z } from "zod";



export function mapPropHydrationPayloadToProp(payload: Prop): Prop {
    return Prop.parse(payload);
}

export function mapPropWithAssetsToDomainProp(entity: PropWithAssets): PropWithAssets {
    const cleaned = entity.worldId === null ? { ...entity, worldId: undefined } : entity;
    return PropWithAssets.parse(JSON.parse(JSON.stringify(cleaned)));
};

export function mapDomainPropToInsertProp(prop: z.input<typeof InsertProp>): z.infer<typeof InsertProp> {
    return InsertProp.parse(prop);
}

export function mapPropWithAssetsToPropBase(prop: PropBase): PropBase {
    return PropBase.parse(prop);
}

