import {
    LocationAttributes,
    Location
} from "../types/workflow.types.js";
import {
    InsertLocation,
    LocationEntity
} from "../db/zod-db.js";
import { z } from "zod";



export function mapDbLocationToDomain(entity: LocationEntity): Location {
    return Location.parse(entity);
}

export function mapDomainLocationToInsertLocationDb(loc: z.input<typeof InsertLocation>): z.infer<typeof InsertLocation> {
    return InsertLocation.parse(loc);
};