import { assetEntries, assetVersions } from "../db/schema.js";
import { sql } from "drizzle-orm";

/**
 * Fragment for joining the "Best" version data directly onto an entity query
 */
export const bestAssetJoin = (table: any) => sql`
    LEFT JOIN ${assetEntries} ae ON ae.${table.id} = ${table.id}
    LEFT JOIN ${assetVersions} av ON av.asset_entry_id = ae.id AND av.version = ae.best_version_number
`;