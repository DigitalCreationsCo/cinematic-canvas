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

export class OCCConflictError extends Error {
  constructor(
    public entityId: string,
    public clientVersion: number,
    public serverVersion: number
  ) {
    super(`OCC conflict for entity: ${entityId}. Client version: ${clientVersion}, server version: ${serverVersion}`);
    this.name = 'OCCConflictError';
  }
}

/**
 * OCC-guarded batch upsert of canvas node layouts.
 * 
 * Uses proper optimistic concurrency control: UPDATE first with version check,
 * INSERT only if row doesn't exist. Throws OCCConflictError on version mismatch.
 * 
 * The client should catch this error, refresh layouts from server, and retry.
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

      const updateResult = await tx
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

      if (updateResult.length > 0) {
        newVersions[node.idEntityTarget] = newVersion;
        continue;
      }

      const existingRow = await tx
        .select({ idxVersion: canvasNodeLayouts.idxVersion })
        .from(canvasNodeLayouts)
        .where(
          and(
            eq(canvasNodeLayouts.idContext, node.idContextTarget),
            eq(canvasNodeLayouts.idEntity, node.idEntityTarget)
          )
        )
        .limit(1);

      if (existingRow.length > 0) {
        throw new OCCConflictError(
          node.idEntityTarget,
          node.idxVersionCurrent,
          existingRow[0].idxVersion
        );
      }

      const insertResult = await tx
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
        .returning({ id: canvasNodeLayouts.idLayout });

      if (insertResult.length === 0) {
        throw new Error(`Failed to insert layout for entity: ${node.idEntityTarget}`);
      }

      newVersions[node.idEntityTarget] = newVersion;
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
 * Returns a map of entityId → new idxVersion for client sync.
 */
export async function confirmCanvasChanges(
  projectId: string,
  updates: EntityPatch[],
  pendingChanges: PendingChange[]
): Promise<{ [entityId: string]: number }> {
  const repoProject = new ProjectRepository();
  const managerAssetVersion = new AssetVersionManager(repoProject);
  const affectedVersions: { [entityId: string]: number } = {};

  await db.transaction(async (tx) => {
    const characterJoinsToAdd: SceneToCharacterJoinInsert[] = [];
    const characterJoinsToRemove: { sceneId: string; characterId: string }[] = [];

    const sceneUpdates: { id: string; projectId: string; locationId?: string | undefined }[] = [];

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
      const versionUpdates = await tx
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
        )
        .returning({ idEntity: canvasNodeLayouts.idEntity, idxVersion: canvasNodeLayouts.idxVersion });

      versionUpdates.forEach(row => {
        affectedVersions[row.idEntity] = row.idxVersion;
      });
    }
  });

  return affectedVersions;
}