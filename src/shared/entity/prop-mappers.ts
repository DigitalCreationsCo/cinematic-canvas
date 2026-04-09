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
    const parsed = JSON.parse(JSON.stringify(entity));
    return PropWithAssets.parse(parsed);
}

export function mapDomainPropToInsertProp(prop: z.input<typeof InsertProp>): z.infer<typeof InsertProp> {
    return InsertProp.parse(prop);
};

export function mapPropWithAssetsToPropBase(prop: PropBase): PropBase {
    return PropBase.parse(prop);
}