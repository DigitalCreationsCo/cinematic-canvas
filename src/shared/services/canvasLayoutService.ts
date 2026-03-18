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
import { sql, eq, and, inArray } from 'drizzle-orm';
import { AssetVersionManager } from './asset-version-manager.js';
import { ProjectRepository } from './project-repository.js';
import { extractPatchContent, getBestAsset } from '../utils/assets-utils.js';
import { EntityPatch } from '../types/editable.types.js';
import { AssetKey, PendingChange } from '../types/index.js';

export interface LayoutNodeInput {
  idContextTarget: string;
  contextTypeTarget: 'project' | 'world';
  idEntityTarget: string;
  nodeTypeTarget: string;
  valPosXTarget: number;
  valPosYTarget: number;
  valWidthTarget?: number;
  valHeightTarget?: number;
  jsonUiMetadata?: Record<string, unknown>;
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
          idContext: node.idContextTarget,
          contextType: node.contextTypeTarget,
          idEntity: node.idEntityTarget,
          nodeType: node.nodeTypeTarget,
          valPosX: node.valPosXTarget,
          valPosY: node.valPosYTarget,
          valWidth: node.valWidthTarget,
          valHeight: node.valHeightTarget,
          jsonUiMetadata: node.jsonUiMetadata ?? {},
          idxVersion: node.idxVersionCurrent + 1,
        })
        .onConflictDoUpdate({
          target: [canvasNodeLayouts.idContext, canvasNodeLayouts.idEntity],
          set: {
            valPosX: sql`EXCLUDED.val_pos_x`,
            valPosY: sql`EXCLUDED.val_pos_y`,
            valWidth: sql`EXCLUDED.val_width`,
            valHeight: sql`EXCLUDED.val_height`,
            jsonUiMetadata: sql`EXCLUDED.json_ui_metadata`,
            nodeType: sql`EXCLUDED.node_type`,
            idxVersion: sql`EXCLUDED.idx_version`,
            tsUpdated: sql`NOW()`,
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

/**
 * Atomic transaction to commit canvas interaction changes.
 * Consolidates UI metadata updates with underlying entity relationship persistence.
 */
export async function confirmCanvasChanges(
  projectId: string,
  updates: EntityPatch[],
  pendingChanges: PendingChange[]
): Promise<void> {
  const repoProject = new ProjectRepository();
  const managerAssetVersion = new AssetVersionManager(repoProject);

  await db.transaction(async (tx) => {
    // 1. Persist Entity Relationships (Characters, Locations, etc.)
    for (const update of updates) {
      if (update.entityType === 'scene') {
        await repoProject.updateScenes([{ id: update.entityId, projectId, ...update.patch }], tx);
      }
    }

    // 2. Handle Narrative Continuity (Asset Versioning)
    const listEdgesFrameInput = pendingChanges.filter(
      (c) => c.changeType === 'add' && c.edgeType === 'frame_input'
    );

    for (const edge of listEdgesFrameInput) {
      const isBidirectionalSceneLink = edge.sourceType === 'scene' && edge.targetType === 'scene';
      const stringDragDirection = edge.jsonUiMetadata?.dragDirection || 'forward';

      let idEntityMaster: string;
      let keyAssetMaster: AssetKey;
      let idEntityTargetToUpdate: string;
      let keyAssetTargetToUpdate: AssetKey;

      // ── Determine Master vs Target Context ─────────────────────────────
      if (isBidirectionalSceneLink && stringDragDirection === 'backward') {
        // Pulling from Target back to Source
        idEntityMaster = edge.targetId;
        keyAssetMaster = 'scene_start_frame' as const;
        idEntityTargetToUpdate = edge.sourceId;
        keyAssetTargetToUpdate = 'scene_end_frame';
      } else {
        // Standard Forward Push (Source to Target)
        idEntityMaster = edge.sourceId;
        keyAssetMaster = edge.sourceType === 'scene' ? 'scene_end_frame' as const : 'image_file' as const;
        idEntityTargetToUpdate = edge.targetId;
        keyAssetTargetToUpdate = 'scene_start_frame';
      }

      console.debug(`[confirmCanvasChanges] Resolving frame link for edge ${edge.edgeId}. Master: ${idEntityMaster} (${keyAssetMaster}) -> Target: ${idEntityTargetToUpdate} (${keyAssetTargetToUpdate})`);

      // ── Fetch Master Frame URI ─────────────────────────────────────────
      let uriDataMaster: string | undefined;

      if (edge.sourceType === 'image' && stringDragDirection === 'forward') {
        const historyAssetImage = await managerAssetVersion.getAssetRegistryForEntity(idEntityMaster, "image");
        uriDataMaster = getBestAsset(historyAssetImage, 'image_file')?.data;
      } else {
        const historyAssetScene = await managerAssetVersion.getAssetRegistryForEntity(idEntityMaster, "scene");
        uriDataMaster = getBestAsset(historyAssetScene, keyAssetMaster)?.data;
      }

      if (!uriDataMaster) {
        console.warn(`[confirmCanvasChanges] Could not resolve master frame URI for entity ${idEntityMaster}. Skipping version creation for edge ${edge.edgeId}.`);
        continue; // Skip this edge to prevent crashing the batch, allow others to succeed
      }

      // ── Commit the Narrative Version ───────────────────────────────────
      await managerAssetVersion.createVersionedAssets(
        { projectId, sceneIds: [idEntityTargetToUpdate] },
        [keyAssetTargetToUpdate],
        "image",
        [uriDataMaster],
        [
          // {
          // derivation: 'canvas_edge_link',
          // initiatorId: edge.jsonUiMetadata?.initiatorId,
          // dragDirection: stringDragDirection
          // }
        ],
      );
    }

    // 3. Reset UI Metadata (Clear pending badges/counts)
    const listAffectedEntityIds = Array.from(new Set([
      ...pendingChanges.map(c => c.sourceId),
      ...pendingChanges.map(c => c.targetId)
    ]));

    if (listAffectedEntityIds.length > 0) {
      await tx
        .update(canvasNodeLayouts)
        .set({
          jsonUiMetadata: sql`jsonb_set(
            COALESCE(${canvasNodeLayouts.jsonUiMetadata}, '{}'::jsonb), 
            '{pendingChangeCount}', 
            '0'::jsonb
          )`,
          idxVersion: sql`${canvasNodeLayouts.idxVersion} + 1`
        })
        .where(
          and(
            eq(canvasNodeLayouts.idContext, projectId),
            inArray(canvasNodeLayouts.idEntity, listAffectedEntityIds)
          )
        );
    }
  });
};