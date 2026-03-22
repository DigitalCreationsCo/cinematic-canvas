// src/shared/services/canvasLayoutService.ts
// OCC-guarded batch upsert for canvas_node_layouts.
// This is the ONLY write path to canvas_node_layouts in the entire application.

import { db } from '../db/index.js';
import { canvasNodeLayouts, scenesToCharacters } from '../db/schema.js';
import { sql, eq, and, inArray } from 'drizzle-orm';
import { AssetVersionManager } from './asset-version-manager.js';
import { ProjectRepository } from './project-repository.js';
import { getBestAsset } from '../utils/assets-utils.js';
import { EntityPatch } from '../types/editable.types.js';
import { AssetKey, PendingChange } from '../types/index.js';
import { SceneToCharacterJoinInsert } from '../types/entities.types.js';

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
 * For NEW nodes (idxVersionCurrent = 1 and no existing row), the insert proceeds.
 * For existing nodes, the version is checked before update.
 *
 * @throws {Error} If any node's OCC version check fails.
 */
export async function upsertBatchCanvasLayouts(
  listNodes: LayoutNodeInput[]
): Promise<{ [entityId: string]: number }> {
  const newVersions: { [entityId: string]: number } = {};

  if (!listNodes.length) {
    console.debug('[canvasLayoutService] upsertBatchCanvasLayouts: empty input, skipping');
    return newVersions;
  }

  console.debug(`[canvasLayoutService] upsertBatchCanvasLayouts: ${listNodes.length} nodes`);

  await db.transaction(async (tx) => {
    for (const node of listNodes) {
      const newVersion = node.idxVersionCurrent + 1;

      if (node.idxVersionCurrent === 1) {
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
            idxVersion: newVersion,
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
          })
          .returning({ id: canvasNodeLayouts.idLayout });

        if (result.length === 0) {
          throw new Error(
            `[canvasLayoutService] Failed to insert new layout for entity: ${node.idEntityTarget}`
          );
        }

        newVersions[node.idEntityTarget] = newVersion;
        console.debug(
          `[canvasLayoutService] Inserted new entity=${node.idEntityTarget} version=1 → ${newVersion}`
        );
      } else {
        const result = await tx
          .update(canvasNodeLayouts)
          .set({
            valPosX: node.valPosXTarget,
            valPosY: node.valPosYTarget,
            valWidth: node.valWidthTarget,
            valHeight: node.valHeightTarget,
            jsonUiMetadata: node.jsonUiMetadata ?? {},
            nodeType: node.nodeTypeTarget,
            idxVersion: newVersion,
            tsUpdated: sql`NOW()`,
          })
          .where(
            and(
              eq(canvasNodeLayouts.idContext, node.idContextTarget),
              eq(canvasNodeLayouts.idEntity, node.idEntityTarget),
              eq(canvasNodeLayouts.idxVersion, node.idxVersionCurrent)
            )
          )
          .returning({ id: canvasNodeLayouts.idLayout });

        if (result.length === 0) {
          throw new Error(
            `[canvasLayoutService] OCC conflict for entity: ${node.idEntityTarget}. ` +
            `Expected version ${node.idxVersionCurrent} but it was already updated.`
          );
        }

        newVersions[node.idEntityTarget] = newVersion;
        console.debug(
          `[canvasLayoutService] Updated entity=${node.idEntityTarget} ` +
          `version=${node.idxVersionCurrent} → ${newVersion}`
        );
      }
    }
  });

  return newVersions;
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
    const characterJoinsToAdd: SceneToCharacterJoinInsert[] = [];
    const characterJoinsToRemove: { sceneId: string; characterId: string }[] = [];

    const sceneUpdates: { id: string; projectId: string; locationId?: string | null }[] = [];

    for (const change of pendingChanges) {
      if (change.edgeType === 'character_in_scene') {
        if (change.changeType === 'add') {
          characterJoinsToAdd.push({
            sceneId: change.targetId,
            characterId: change.sourceId,
          });
        } else {
          characterJoinsToRemove.push({
            sceneId: change.targetId,
            characterId: change.sourceId,
          });
        }
      }

      if (change.edgeType === 'location_in_scene' && change.changeType === 'add') {
        sceneUpdates.push({
          id: change.targetId,
          projectId,
          locationId: change.sourceId,
        });
      }
    }

    for (const update of updates) {
      if (update.entityType === 'scene') {
        const patch = update.patch as any;
        if (patch.locationId !== undefined) {
          sceneUpdates.push({
            id: update.entityId,
            projectId,
            locationId: patch.locationId,
          });
        }
      }
    }

    if (sceneUpdates.length > 0) {
      const uniqueSceneUpdates = sceneUpdates.reduce((acc, curr) => {
        const existing = acc.find(s => s.id === curr.id);
        if (existing) {
          if (curr.locationId !== undefined) {
            existing.locationId = curr.locationId;
          }
        } else {
          acc.push(curr);
        }
        return acc;
      }, [] as typeof sceneUpdates);

      await repoProject.updateScenes(
        uniqueSceneUpdates.map(s => ({ id: s.id, projectId: s.projectId, locationId: s.locationId })),
        tx
      );
    }

    if (characterJoinsToRemove.length > 0) {
      const sceneIds = [...new Set(characterJoinsToRemove.map(j => j.sceneId))];
      await tx
        .delete(scenesToCharacters)
        .where(
          and(
            inArray(scenesToCharacters.sceneId, sceneIds),
          )
        );
    }

    if (characterJoinsToAdd.length > 0) {
      const filteredJoins = characterJoinsToAdd.filter(add => {
        return !characterJoinsToRemove.some(rem =>
          rem.sceneId === add.sceneId && rem.characterId === add.characterId
        );
      });

      if (filteredJoins.length > 0) {
        await tx.insert(scenesToCharacters).values(filteredJoins).onConflictDoNothing();
      }
    }

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

      if (isBidirectionalSceneLink && stringDragDirection === 'backward') {
        idEntityMaster = edge.targetId;
        keyAssetMaster = 'scene_start_frame' as const;
        idEntityTargetToUpdate = edge.sourceId;
        keyAssetTargetToUpdate = 'scene_end_frame';
      } else {
        idEntityMaster = edge.sourceId;
        keyAssetMaster = edge.sourceType === 'scene' ? 'scene_end_frame' as const : 'image_file' as const;
        idEntityTargetToUpdate = edge.targetId;
        keyAssetTargetToUpdate = 'scene_start_frame';
      }

      console.debug(`[confirmCanvasChanges] Resolving frame link for edge ${edge.edgeId}. Master: ${idEntityMaster} (${keyAssetMaster}) -> Target: ${idEntityTargetToUpdate} (${keyAssetTargetToUpdate})`);

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
        continue;
      }

      await managerAssetVersion.createVersionedAssets(
        { projectId, sceneIds: [idEntityTargetToUpdate] },
        [keyAssetTargetToUpdate],
        "image",
        [uriDataMaster],
        []
      );
    }

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
}