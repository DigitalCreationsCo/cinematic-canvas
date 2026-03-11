// src/shared/services/canvasLayoutService.ts
// OCC-guarded batch upsert for canvas_node_layouts.
// This is the ONLY write path to canvas_node_layouts in the entire application.
//
// OCC (Optimistic Concurrency Control) mechanism:
//   - Each row has an idxVersion integer.
//   - On upsert, WHERE clause checks idxVersion === current client version.
//   - If the WHERE clause filters out the row (version mismatch), no rows are returned.
//   - Zero returned rows → throw Error so the client knows to re-fetch the latest layout.
//   - This prevents silent last-write-wins races between multiple collaborators.

import { db } from '../db/index.js';
import { canvasNodeLayouts } from '../db/schema.js';
import { sql, eq } from 'drizzle-orm';

export interface LayoutNodeInput {
  idContextTarget: string;
  contextTypeTarget: 'project' | 'world';
  idEntityTarget: string;
  nodeTypeTarget: string;
  valPosXTarget: number;
  valPosYTarget: number;
  valWidthTarget?: number;
  valHeightTarget?: number;
  jsonUiMetadataTarget?: Record<string, unknown>;
  idxVersionCurrent: number;
}

/**
 * OCC-guarded batch upsert of canvas node layouts.
 *
 * All nodes are written in a single DB transaction. If any node has a version
 * conflict (another writer updated it since the client last fetched), the entire
 * transaction is rolled back and an Error is thrown with the conflicting entityId.
 *
 * @throws {Error} If any node's OCC version check fails.
 */
export async function upsertBatchCanvasLayouts(
  listNodes: LayoutNodeInput[]
): Promise<void> {
  if (!listNodes.length) {
    console.debug('[canvasLayoutService] upsertBatchCanvasLayouts: empty input, skipping');
    return;
  }

  console.debug(`[canvasLayoutService] upsertBatchCanvasLayouts: ${listNodes.length} nodes`);

  await db.transaction(async (tx) => {
    for (const node of listNodes) {
      const result = await tx
        .insert(canvasNodeLayouts)
        .values({
          idContext:       node.idContextTarget,
          contextType:     node.contextTypeTarget,
          idEntity:        node.idEntityTarget,
          nodeType:        node.nodeTypeTarget,
          valPosX:         node.valPosXTarget,
          valPosY:         node.valPosYTarget,
          valWidth:        node.valWidthTarget,
          valHeight:       node.valHeightTarget,
          jsonUiMetadata:  node.jsonUiMetadataTarget ?? {},
          idxVersion:      node.idxVersionCurrent + 1,
        })
        .onConflictDoUpdate({
          target: [canvasNodeLayouts.idContext, canvasNodeLayouts.idEntity],
          set: {
            valPosX:        sql`EXCLUDED.val_pos_x`,
            valPosY:        sql`EXCLUDED.val_pos_y`,
            valWidth:       sql`EXCLUDED.val_width`,
            valHeight:      sql`EXCLUDED.val_height`,
            jsonUiMetadata: sql`EXCLUDED.json_ui_metadata`,
            nodeType:       sql`EXCLUDED.node_type`,
            idxVersion:     sql`EXCLUDED.idx_version`,
            tsUpdated:      sql`NOW()`,
          },
          where: eq(canvasNodeLayouts.idxVersion, node.idxVersionCurrent),
        })
        .returning({ id: canvasNodeLayouts.idLayout });

      if (result.length === 0) {
        // OCC conflict: the row was updated by another writer since our last fetch.
        // The transaction will be rolled back automatically by the throw.
        throw new Error(
          `[canvasLayoutService] OCC conflict for entity: ${node.idEntityTarget}. ` +
          `Expected version ${node.idxVersionCurrent} but it was already updated.`
        );
      }

      console.debug(
        `[canvasLayoutService] Upserted entity=${node.idEntityTarget} ` +
        `version=${node.idxVersionCurrent} → ${node.idxVersionCurrent + 1}`
      );
    }
  });
}

/**
 * Fetches all canvas node layouts for a given context (project or world).
 * Returns an empty array if no layouts exist (triggers legacy migration on client).
 */
export async function fetchCanvasLayouts(
  contextId: string,
): Promise<typeof canvasNodeLayouts.$inferSelect[]> {
  const rows = await db
    .select()
    .from(canvasNodeLayouts)
    .where(eq(canvasNodeLayouts.idContext, contextId));

  console.debug(`[canvasLayoutService] fetchCanvasLayouts: contextId=${contextId} → ${rows.length} rows`);
  return rows;
}

/**
 * Deletes a single canvas node layout row for a specific entity in a context.
 * Called when a node is deleted from the canvas.
 */
export async function deleteCanvasLayout(
  contextId: string,
  entityId: string,
): Promise<void> {
  const result = await db
    .delete(canvasNodeLayouts)
    .where(
      sql`${canvasNodeLayouts.idContext} = ${contextId} AND ${canvasNodeLayouts.idEntity} = ${entityId}`
    )
    .returning({ id: canvasNodeLayouts.idLayout });

  console.debug(
    `[canvasLayoutService] deleteCanvasLayout: contextId=${contextId} entityId=${entityId} ` +
    `deleted=${result.length} rows`
  );
}
