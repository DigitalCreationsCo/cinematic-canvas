import { Dexie } from 'dexie';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '#client/lib/supabase.js';
import type { EntityPatch } from '#shared/types/editable.types.js';
import type { SceneToCharacterJoinInsert } from '#shared/types/schema.types.js';
import type { AssetKey } from '#shared/types/assets.types.js';
import type { PendingChange } from '#shared/types/canvas.types.js';

type CanvasContextType = 'project' | 'world';

export interface LocalViewport {
  contextId: string;
  x: number;
  y: number;
  zoom: number;
  tsUpdated: string;
}

export interface LayoutNodeLocal {
  id: string;
  idContext: string;
  contextType: CanvasContextType;
  idEntity: string;
  nodeType: string;
  valPosX: number;
  valPosY: number;
  valWidth: number | null;
  valHeight: number | null;
  jsonUiMetadata: Record<string, unknown> | null;
  idxVersion: number;
  tsUpdated: string;
  tsSynced: string | null;
}

export interface LayoutNodeInput {
  idContextTarget: string;
  contextTypeTarget: CanvasContextType;
  idEntityTarget: string;
  nodeTypeTarget: string;
  valPosXTarget: number;
  valPosYTarget: number;
  valWidthTarget?: number;
  valHeightTarget?: number;
  jsonUiMetadata?: Record<string, unknown>;
  idxVersionCurrent: number;
}

export interface LayoutNodeOutput {
  idEntity: string;
  contextType?: CanvasContextType;
  nodeType: string;
  valPosX: number;
  valPosY: number;
  valWidth: number | null;
  valHeight: number | null;
  jsonUiMetadata: Record<string, unknown> | null;
  idxVersion: number;
}

export interface UpsertResult {
  success: boolean;
  newVersions: Record<string, number>;
  error?: string;
}

export interface ISyncAdapter {
  fetch(contextId: string): Promise<LayoutNodeOutput[]>;
  upsert(inputs: LayoutNodeInput[]): Promise<UpsertResult>;
  delete(contextId: string, entityId: string): Promise<void>;
}

interface CanvasNodeDatabaseLike {
  nodeLayouts: Dexie.Table<LayoutNodeLocal, string>;
  viewports?: Dexie.Table<LocalViewport, string>;
}

interface ServerCanvasStorageDeps {
  db: typeof import('#shared/db/index.js').db;
  canvasNodeLayouts: typeof import('#shared/db/schema.js').canvasNodeLayouts;
  scenesToCharacters: typeof import('#shared/db/schema.js').scenesToCharacters;
  sql: typeof import('drizzle-orm').sql;
  eq: typeof import('drizzle-orm').eq;
  and: typeof import('drizzle-orm').and;
  inArray: typeof import('drizzle-orm').inArray;
  or: typeof import('drizzle-orm').or;
}

interface ServerCanvasCommitDeps extends ServerCanvasStorageDeps {
  AssetVersionManager: typeof import('#shared/services/asset-version-manager.js').AssetVersionManager;
  ProjectRepository: typeof import('#shared/services/project-repository.js').ProjectRepository;
  getBestAsset: typeof import('#shared/utils/assets.utils.js').getBestAsset;
}

class CanvasNodeDB extends Dexie {
  nodeLayouts!: Dexie.Table<LayoutNodeLocal, string>;
  viewports!: Dexie.Table<LocalViewport, string>;

  constructor() {
    super('CinematicCanvasNodeStorage');
    this.version(1).stores({
      nodeLayouts: 'id, idContext, idEntity, tsUpdated, tsSynced',
    });
    this.version(2).stores({
      nodeLayouts: 'id, idContext, idEntity, tsUpdated, tsSynced',
      viewports: 'contextId',
    });
  }
}

let db: CanvasNodeDB | null = null;
const envHybridNodeStorage = (import.meta as ImportMeta & {
  env?: Record<string, string | boolean | undefined>;
}).env;

function getLocalDatabase(): CanvasNodeDB {
  if (!db) {
    db = new CanvasNodeDB();
  }
  return db;
}

function makeId(contextId: string, entityId: string): string {
  return `${contextId}:${entityId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapLocalToOutput(row: LayoutNodeLocal): LayoutNodeOutput {
  return {
    idEntity: row.idEntity,
    contextType: row.contextType,
    nodeType: row.nodeType,
    valPosX: row.valPosX,
    valPosY: row.valPosY,
    valWidth: row.valWidth,
    valHeight: row.valHeight,
    jsonUiMetadata: row.jsonUiMetadata,
    idxVersion: row.idxVersion,
  };
}

function buildLocalLayout(input: LayoutNodeInput, tsUpdated: string, tsSynced: string | null): LayoutNodeLocal {
  return {
    id: makeId(input.idContextTarget, input.idEntityTarget),
    idContext: input.idContextTarget,
    contextType: input.contextTypeTarget,
    idEntity: input.idEntityTarget,
    nodeType: input.nodeTypeTarget,
    valPosX: input.valPosXTarget,
    valPosY: input.valPosYTarget,
    valWidth: input.valWidthTarget ?? null,
    valHeight: input.valHeightTarget ?? null,
    jsonUiMetadata: input.jsonUiMetadata ?? null,
    idxVersion: input.idxVersionCurrent + 1,
    tsUpdated,
    tsSynced,
  };
}

function isNoRowsError(error: { code?: string; details?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === 'PGRST116' ||
    error.details?.includes('0 rows') === true ||
    error.message?.includes('0 rows') === true;
}

async function importServerModule<T>(specifier: string): Promise<T> {
  return import(
    /* @vite-ignore */
    specifier
  ) as Promise<T>;
}

async function loadServerCanvasStorageDeps(): Promise<ServerCanvasStorageDeps> {
  const [dbModule, schemaModule, drizzleModule] = await Promise.all([
    importServerModule<typeof import('#shared/db/index.js')>('#shared/db/index.js'),
    importServerModule<typeof import('#shared/db/schema.js')>('#shared/db/schema.js'),
    importServerModule<typeof import('drizzle-orm')>('drizzle-orm'),
  ]);

  return {
    db: dbModule.db,
    canvasNodeLayouts: schemaModule.canvasNodeLayouts,
    scenesToCharacters: schemaModule.scenesToCharacters,
    sql: drizzleModule.sql,
    eq: drizzleModule.eq,
    and: drizzleModule.and,
    inArray: drizzleModule.inArray,
    or: drizzleModule.or,
  };
}

async function loadServerCanvasCommitDeps(): Promise<ServerCanvasCommitDeps> {
  const [storageDeps, assetVersionModule, projectRepositoryModule, assetsUtilsModule] = await Promise.all([
    loadServerCanvasStorageDeps(),
    importServerModule<typeof import('#shared/services/asset-version-manager.js')>('#shared/services/asset-version-manager.js'),
    importServerModule<typeof import('#shared/services/project-repository.js')>('#shared/services/project-repository.js'),
    importServerModule<typeof import('#shared/utils/assets.utils.js')>('#shared/utils/assets.utils.js'),
  ]);

  return {
    ...storageDeps,
    AssetVersionManager: assetVersionModule.AssetVersionManager,
    ProjectRepository: projectRepositoryModule.ProjectRepository,
    getBestAsset: assetsUtilsModule.getBestAsset,
  };
}

class IndexedDBAdapter {
  constructor(private readonly database: CanvasNodeDatabaseLike) { }

  async fetch(contextId: string): Promise<LayoutNodeLocal[]> {
    return this.database.nodeLayouts.where('idContext').equals(contextId).toArray();
  }

  async put(layout: LayoutNodeLocal): Promise<void> {
    await this.database.nodeLayouts.put(layout);
  }

  async delete(id: string): Promise<void> {
    await this.database.nodeLayouts.delete(id);
  }

  getTable(): Dexie.Table<LayoutNodeLocal, string> {
    return this.database.nodeLayouts;
  }

  async getViewport(contextId: string): Promise<LocalViewport | undefined> {
    if (!this.database.viewports) return undefined;
    return this.database.viewports.get(contextId);
  }

  async saveViewport(viewport: LocalViewport): Promise<void> {
    if (!this.database.viewports) {
      throw new Error('Viewport storage is unavailable for this HybridNodeStorage instance.');
    }
    await this.database.viewports.put(viewport);
  }
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

export class SupabaseAdapter implements ISyncAdapter {
  constructor(private readonly supabase: SupabaseClient) { }

  async fetch(contextId: string): Promise<LayoutNodeOutput[]> {
    const { data, error } = await this.supabase
      .from('canvas_node_layouts')
      .select('*')
      .eq('id_context', contextId);

    if (error) {
      console.error('[SupabaseAdapter] Fetch error:', error);
      throw error;
    }

    return (data || []).map((row: Record<string, unknown>) => ({
      idEntity: row.id_entity as string,
      contextType: row.context_type as CanvasContextType,
      nodeType: row.node_type as string,
      valPosX: row.val_pos_x as number,
      valPosY: row.val_pos_y as number,
      valWidth: row.val_width as number | null,
      valHeight: row.val_height as number | null,
      jsonUiMetadata: row.json_ui_metadata as Record<string, unknown> | null,
      idxVersion: row.idx_version as number,
    }));
  }

  async upsert(inputs: LayoutNodeInput[]): Promise<UpsertResult> {
    if (inputs.length === 0) {
      return { success: true, newVersions: {} };
    }

    const newVersions: Record<string, number> = {};
    const errors: string[] = [];

    for (const node of inputs) {
      const newVersion = node.idxVersionCurrent + 1;
      const { data: updateData, error: updateError } = await this.readOptionalSingle<{ idx_version: number }>(
        this.supabase
          .from('canvas_node_layouts')
          .update({
            val_pos_x: node.valPosXTarget,
            val_pos_y: node.valPosYTarget,
            val_width: node.valWidthTarget,
            val_height: node.valHeightTarget,
            json_ui_metadata: node.jsonUiMetadata ?? {},
            node_type: node.nodeTypeTarget,
            idx_version: newVersion,
            ts_updated: nowIso(),
          })
          .eq('id_context', node.idContextTarget)
          .eq('id_entity', node.idEntityTarget)
          .eq('idx_version', node.idxVersionCurrent)
          .select('idx_version')
      );

      if (updateError) {
        errors.push(`Failed to update ${node.idEntityTarget}: ${updateError.message}`);
        continue;
      }

      if (updateData) {
        newVersions[node.idEntityTarget] = updateData.idx_version;
        continue;
      }

      const serverVersion = await this.fetchCurrentVersion(node.idContextTarget, node.idEntityTarget);
      if (serverVersion !== null) {
        throw new OCCConflictError(
          node.idEntityTarget,
          node.idxVersionCurrent,
          serverVersion
        );
      }

      const { error: insertError } = await this.supabase
        .from('canvas_node_layouts')
        .insert({
          id_context: node.idContextTarget,
          context_type: node.contextTypeTarget,
          id_entity: node.idEntityTarget,
          node_type: node.nodeTypeTarget,
          val_pos_x: node.valPosXTarget,
          val_pos_y: node.valPosYTarget,
          val_width: node.valWidthTarget,
          val_height: node.valHeightTarget,
          json_ui_metadata: node.jsonUiMetadata ?? {},
          idx_version: newVersion,
        });

      if (insertError) {
        if (insertError.code === '23505') {
          const conflictVersion = await this.fetchCurrentVersion(node.idContextTarget, node.idEntityTarget);
          throw new OCCConflictError(
            node.idEntityTarget,
            node.idxVersionCurrent,
            conflictVersion ?? newVersion
          );
        }

        errors.push(`Failed to insert ${node.idEntityTarget}: ${insertError.message}`);
        continue;
      }

      newVersions[node.idEntityTarget] = newVersion;
    }

    if (errors.length > 0) {
      return { success: false, newVersions, error: errors.join('; ') };
    }

    return { success: true, newVersions };
  }

  async delete(contextId: string, entityId: string): Promise<void> {
    const { error } = await this.supabase
      .from('canvas_node_layouts')
      .delete()
      .eq('id_context', contextId)
      .eq('id_entity', entityId);

    if (error) {
      console.error('[SupabaseAdapter] Delete error:', error);
      throw error;
    }
  }

  private async fetchCurrentVersion(contextId: string, entityId: string): Promise<number | null> {
    const { data, error } = await this.readOptionalSingle<{ idx_version: number }>(
      this.supabase
        .from('canvas_node_layouts')
        .select('idx_version')
        .eq('id_context', contextId)
        .eq('id_entity', entityId)
    );

    if (error) {
      throw error;
    }

    return data?.idx_version ?? null;
  }

  private async readOptionalSingle<T>(
    request: {
      single: () => unknown;
      maybeSingle?: () => unknown;
    }
  ): Promise<{ data: T | null; error: { code?: string; message?: string; details?: string } | null }> {
    const result = await (
      'maybeSingle' in request && typeof request.maybeSingle === 'function'
        ? request.maybeSingle()
        : request.single()
    ) as { data: T | null; error: { code?: string; message?: string; details?: string } | null };

    if (isNoRowsError(result.error)) {
      return { data: null, error: null };
    }

    return result;
  }
}

export async function fetchCanvasLayoutsFromCloud(
  contextId: string,
  supabaseClient: SupabaseClient = defaultSupabase
): Promise<LayoutNodeOutput[]> {
  return new SupabaseAdapter(supabaseClient).fetch(contextId);
}

export async function upsertCanvasLayoutsToCloud(
  inputs: LayoutNodeInput[],
  supabaseClient: SupabaseClient = defaultSupabase
): Promise<UpsertResult> {
  return new SupabaseAdapter(supabaseClient).upsert(inputs);
}

export async function deleteCanvasLayoutFromCloud(
  contextId: string,
  entityId: string,
  supabaseClient: SupabaseClient = defaultSupabase
): Promise<void> {
  return new SupabaseAdapter(supabaseClient).delete(contextId, entityId);
}

export async function fetchCanvasLayoutsFromDatabase(contextId: string): Promise<LayoutNodeOutput[]> {
  const { db: database, canvasNodeLayouts, eq } = await loadServerCanvasStorageDeps();
  const rows = await database
    .select()
    .from(canvasNodeLayouts)
    .where(eq(canvasNodeLayouts.idContext, contextId));

  console.debug(`[HybridNodeStorage] fetchCanvasLayoutsFromDatabase: contextId=${contextId} -> ${rows.length} rows`);

  return rows.map((row) => ({
    idEntity: row.idEntity,
    contextType: row.contextType as CanvasContextType,
    nodeType: row.nodeType,
    valPosX: row.valPosX,
    valPosY: row.valPosY,
    valWidth: row.valWidth,
    valHeight: row.valHeight,
    jsonUiMetadata: row.jsonUiMetadata as Record<string, unknown> | null,
    idxVersion: row.idxVersion,
  }));
}

export async function upsertBatchCanvasLayouts(listNodes: LayoutNodeInput[]): Promise<Record<string, number>> {
  const { db: database, canvasNodeLayouts, sql, eq, and } = await loadServerCanvasStorageDeps();
  const newVersions: Record<string, number> = {};

  if (!listNodes.length) {
    console.debug('[HybridNodeStorage] upsertBatchCanvasLayouts: empty input, skipping');
    return newVersions;
  }

  console.debug(`[HybridNodeStorage] upsertBatchCanvasLayouts: ${listNodes.length} nodes`);

  await database.transaction(async (tx) => {
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

export async function deleteCanvasLayoutFromDatabase(
  contextId: string,
  entityId: string
): Promise<void> {
  const { db: database, canvasNodeLayouts, sql } = await loadServerCanvasStorageDeps();
  const result = await database
    .delete(canvasNodeLayouts)
    .where(sql`${canvasNodeLayouts.idContext} = ${contextId} AND ${canvasNodeLayouts.idEntity} = ${entityId}`)
    .returning({ id: canvasNodeLayouts.idLayout });

  console.debug(
    `[HybridNodeStorage] deleteCanvasLayoutFromDatabase: contextId=${contextId} entityId=${entityId} deleted=${result.length} rows`
  );
}

export async function confirmCanvasChanges(
  projectId: string,
  updates: EntityPatch[],
  pendingChanges: PendingChange[]
): Promise<Record<string, number>> {
  const {
    db: database,
    canvasNodeLayouts,
    scenesToCharacters,
    sql,
    eq,
    and,
    inArray,
    or,
    AssetVersionManager,
    ProjectRepository,
    getBestAsset,
  } = await loadServerCanvasCommitDeps();

  const projectRepository = new ProjectRepository();
  const assetVersionManager = new AssetVersionManager(projectRepository);
  const affectedVersions: Record<string, number> = {};

  await database.transaction(async (tx) => {
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
      if (update.entityType !== 'scene') continue;

      const patch = update.patch as { locationId?: string | null };
      if (patch.locationId !== undefined) {
        sceneUpdates.push({
          id: update.entityId,
          projectId,
          locationId: patch.locationId ?? undefined,
        });
      }
    }

    if (sceneUpdates.length > 0) {
      const uniqueSceneUpdates = sceneUpdates.reduce((listAccum, rowCurrent) => {
        const existing = listAccum.find((rowExisting) => rowExisting.id === rowCurrent.id);
        if (existing) {
          if (rowCurrent.locationId !== undefined) {
            existing.locationId = rowCurrent.locationId;
          }
          return listAccum;
        }

        listAccum.push(rowCurrent);
        return listAccum;
      }, [] as typeof sceneUpdates);

      await projectRepository.updateScenes(
        uniqueSceneUpdates.map((rowScene) => ({
          id: rowScene.id,
          projectId: rowScene.projectId,
          locationId: rowScene.locationId,
        })),
        tx
      );
    }

    if (characterJoinsToRemove.length > 0) {
      const predicates = characterJoinsToRemove.map(({ sceneId, characterId }) =>
        and(
          eq(scenesToCharacters.sceneId, sceneId),
          eq(scenesToCharacters.characterId, characterId)
        )
      );

      await tx
        .delete(scenesToCharacters)
        .where(predicates.length === 1 ? predicates[0] : or(...predicates));
    }

    if (characterJoinsToAdd.length > 0) {
      const filteredJoins = characterJoinsToAdd.filter((rowAdd) => {
        return !characterJoinsToRemove.some((rowRemove) =>
          rowRemove.sceneId === rowAdd.sceneId && rowRemove.characterId === rowAdd.characterId
        );
      });

      if (filteredJoins.length > 0) {
        await tx.insert(scenesToCharacters).values(filteredJoins).onConflictDoNothing();
      }
    }

    const frameInputEdges = pendingChanges.filter(
      (change) => change.changeType === 'add' && change.edgeType === 'frame_input'
    );

    for (const edge of frameInputEdges) {
      const isBidirectionalSceneLink = edge.sourceType === 'scene' && edge.targetType === 'scene';
      const dragDirection = edge.jsonUiMetadata?.dragDirection || 'forward';

      let idEntityMaster: string;
      let keyAssetMaster: AssetKey;
      let idEntityTargetToUpdate: string;
      let keyAssetTargetToUpdate: AssetKey;

      if (isBidirectionalSceneLink && dragDirection === 'backward') {
        idEntityMaster = edge.targetId;
        keyAssetMaster = 'scene_start_frame';
        idEntityTargetToUpdate = edge.sourceId;
        keyAssetTargetToUpdate = 'scene_end_frame';
      } else {
        idEntityMaster = edge.sourceId;
        keyAssetMaster = edge.sourceType === 'scene' ? 'scene_end_frame' : 'image_file';
        idEntityTargetToUpdate = edge.targetId;
        keyAssetTargetToUpdate = 'scene_start_frame';
      }

      console.debug(
        `[confirmCanvasChanges] Resolving frame link for edge ${edge.edgeId}. Master: ${idEntityMaster} (${keyAssetMaster}) -> Target: ${idEntityTargetToUpdate} (${keyAssetTargetToUpdate})`
      );

      let uriDataMaster: string | undefined;

      if (edge.sourceType === 'image' && dragDirection === 'forward') {
        const assetRegistry = await assetVersionManager.getAssetRegistryForEntity(idEntityMaster, 'image');
        uriDataMaster = getBestAsset(assetRegistry, 'image_file')?.data;
      } else {
        const assetRegistry = await assetVersionManager.getAssetRegistryForEntity(idEntityMaster, 'scene');
        uriDataMaster = getBestAsset(assetRegistry, keyAssetMaster)?.data;
      }

      if (!uriDataMaster) {
        console.warn(
          `[confirmCanvasChanges] Could not resolve master frame URI for entity ${idEntityMaster}. Skipping version creation for edge ${edge.edgeId}.`
        );
        continue;
      }

      await assetVersionManager.createVersionedAssets(
        { projectId, sceneIds: [idEntityTargetToUpdate] },
        [keyAssetTargetToUpdate],
        'image',
        [uriDataMaster],
        []
      );
    }

    const affectedEntityIds = Array.from(new Set([
      ...pendingChanges.map((change) => change.sourceId),
      ...pendingChanges.map((change) => change.targetId),
    ]));

    if (affectedEntityIds.length > 0) {
      const versionUpdates = await tx
        .update(canvasNodeLayouts)
        .set({
          jsonUiMetadata: sql`jsonb_set(
            COALESCE(${canvasNodeLayouts.jsonUiMetadata}, '{}'::jsonb),
            '{pendingChangeCount}',
            '0'::jsonb
          )`,
          idxVersion: sql`${canvasNodeLayouts.idxVersion} + 1`,
        })
        .where(
          and(
            eq(canvasNodeLayouts.idContext, projectId),
            inArray(canvasNodeLayouts.idEntity, affectedEntityIds)
          )
        )
        .returning({ idEntity: canvasNodeLayouts.idEntity, idxVersion: canvasNodeLayouts.idxVersion });

      versionUpdates.forEach((rowVersion) => {
        affectedVersions[rowVersion.idEntity] = rowVersion.idxVersion;
      });
    }
  });

  return affectedVersions;
}

export class HybridNodeStorage {
  private readonly idb: IndexedDBAdapter;
  private readonly supabaseAdapter: SupabaseAdapter | null;
  private readonly cloudSyncEnabled: boolean;
  private syncQueue: Promise<void> = Promise.resolve();

  constructor(
    supabaseClient: SupabaseClient,
    database?: CanvasNodeDatabaseLike,
    options?: { cloudSyncEnabled?: boolean }
  ) {
    this.idb = new IndexedDBAdapter(database ?? getLocalDatabase());

    const envValue = typeof import.meta !== 'undefined'
      ? (envHybridNodeStorage?.VITE_ENABLE_CLOUD_NODE_SYNC as string | undefined)
      : undefined;

    this.cloudSyncEnabled = options?.cloudSyncEnabled ?? envValue === 'true';
    this.supabaseAdapter = this.cloudSyncEnabled ? new SupabaseAdapter(supabaseClient) : null;

    if (this.cloudSyncEnabled) {
      console.debug('[HybridNodeStorage] Cloud sync enabled (VITE_ENABLE_CLOUD_NODE_SYNC=true)');
    } else if (envValue === 'false') {
      console.debug('[HybridNodeStorage] Cloud sync disabled (VITE_ENABLE_CLOUD_NODE_SYNC=false)');
    } else {
      console.debug('[HybridNodeStorage] Cloud sync disabled (env var not set to "true")');
    }
  }

  isCloudSyncEnabled(): boolean {
    return this.cloudSyncEnabled;
  }

  async fetch(
    contextId: string,
    options?: { syncFromServer?: boolean; contextType?: CanvasContextType }
  ): Promise<LayoutNodeOutput[]> {
    const localRows = await this.idb.fetch(contextId);

    if (options?.syncFromServer && this.supabaseAdapter) {
      try {
        const serverRows = await this.supabaseAdapter.fetch(contextId);

        for (const serverRow of serverRows) {
          const localRow = localRows.find((rowLocal) => rowLocal.idEntity === serverRow.idEntity);

          if (localRow && localRow.idxVersion > serverRow.idxVersion) {
            continue;
          }

          await this.idb.put({
            id: makeId(contextId, serverRow.idEntity),
            idContext: contextId,
            contextType: serverRow.contextType ?? localRow?.contextType ?? options?.contextType ?? 'project',
            idEntity: serverRow.idEntity,
            nodeType: serverRow.nodeType,
            valPosX: serverRow.valPosX,
            valPosY: serverRow.valPosY,
            valWidth: serverRow.valWidth,
            valHeight: serverRow.valHeight,
            jsonUiMetadata: serverRow.jsonUiMetadata,
            idxVersion: serverRow.idxVersion,
            tsUpdated: nowIso(),
            tsSynced: nowIso(),
          });
        }
      } catch (error) {
        console.error('[HybridNodeStorage] Failed to sync from server, using local data:', error);
      }
    }

    return (await this.idb.fetch(contextId)).map(mapLocalToOutput);
  }

  async upsert(inputs: LayoutNodeInput[]): Promise<UpsertResult> {
    if (inputs.length === 0) {
      return { success: true, newVersions: {} };
    }

    const contextId = inputs[0].idContextTarget;
    const existingLocal = await this.idb.fetch(contextId);
    const localVersions: Record<string, number> = {};
    const tsUpdated = nowIso();

    for (const input of inputs) {
      const localRow = existingLocal.find((rowLocal) => rowLocal.idEntity === input.idEntityTarget);
      if (localRow && localRow.idxVersion > input.idxVersionCurrent) {
        localVersions[input.idEntityTarget] = localRow.idxVersion;
        continue;
      }

      const nextLayout = buildLocalLayout(input, tsUpdated, null);
      localVersions[input.idEntityTarget] = nextLayout.idxVersion;
      await this.idb.put(nextLayout);
    }

    if (!this.supabaseAdapter) {
      return { success: true, newVersions: localVersions };
    }

    const syncResult = await this.enqueueCloudUpsert(inputs);
    const tsSynced = nowIso();
    const table = this.idb.getTable();

    if (syncResult.success) {
      for (const [entityId, idxVersion] of Object.entries(syncResult.newVersions)) {
        const id = makeId(contextId, entityId);
        const localRow = await table.get(id);
        if (!localRow) continue;

        await table.update(id, {
          idxVersion,
          tsUpdated,
          tsSynced,
        });
      }

      console.debug('[HybridNodeStorage] Cloud sync completed', { count: inputs.length });
      return {
        success: true,
        newVersions: { ...localVersions, ...syncResult.newVersions },
      };
    }

    console.warn('[HybridNodeStorage] Cloud sync incomplete, data remains local only:', syncResult.error);
    return {
      success: true,
      newVersions: localVersions,
      error: syncResult.error,
    };
  }

  async delete(contextId: string, entityId: string): Promise<void> {
    await this.idb.delete(makeId(contextId, entityId));

    if (!this.supabaseAdapter) {
      return;
    }

    await this.supabaseAdapter.delete(contextId, entityId);
  }

  async applyRemoteChange(layout: LayoutNodeOutput & { idContext: string }): Promise<void> {
    const id = makeId(layout.idContext, layout.idEntity);
    const existing = await this.idb.getTable().get(id);

    await this.idb.put({
      id,
      idContext: layout.idContext,
      contextType: layout.contextType ?? existing?.contextType ?? 'project',
      idEntity: layout.idEntity,
      nodeType: layout.nodeType,
      valPosX: layout.valPosX,
      valPosY: layout.valPosY,
      valWidth: layout.valWidth,
      valHeight: layout.valHeight,
      jsonUiMetadata: layout.jsonUiMetadata,
      idxVersion: layout.idxVersion,
      tsUpdated: nowIso(),
      tsSynced: nowIso(),
    });
  }

  async getUnsyncedChanges(contextId: string): Promise<LayoutNodeLocal[]> {
    return this.idb.getTable()
      .where('idContext')
      .equals(contextId)
      .filter((rowLocal) => rowLocal.tsSynced === null)
      .toArray();
  }

  async forceSyncUnsynced(): Promise<number> {
    if (!this.supabaseAdapter) {
      console.warn('[HybridNodeStorage] Cloud sync not enabled, skipping force sync');
      return 0;
    }

    const unsyncedRows = await this.idb.getTable()
      .toCollection()
      .filter((rowLocal) => rowLocal.tsSynced === null)
      .toArray();

    if (unsyncedRows.length === 0) {
      return 0;
    }

    const inputs: LayoutNodeInput[] = unsyncedRows.map((rowLocal) => ({
      idContextTarget: rowLocal.idContext,
      contextTypeTarget: rowLocal.contextType,
      idEntityTarget: rowLocal.idEntity,
      nodeTypeTarget: rowLocal.nodeType,
      valPosXTarget: rowLocal.valPosX,
      valPosYTarget: rowLocal.valPosY,
      valWidthTarget: rowLocal.valWidth ?? undefined,
      valHeightTarget: rowLocal.valHeight ?? undefined,
      jsonUiMetadata: rowLocal.jsonUiMetadata ?? undefined,
      idxVersionCurrent: rowLocal.idxVersion - 1,
    }));

    const result = await this.enqueueCloudUpsert(inputs);
    if (!result.success) {
      console.warn('[HybridNodeStorage] forceSyncUnsynced failed:', result.error);
      return 0;
    }

    const tsSynced = nowIso();
    for (const rowLocal of unsyncedRows) {
      await this.idb.getTable().update(rowLocal.id, { tsSynced });
    }

    return unsyncedRows.length;
  }

  getTable(): Dexie.Table<LayoutNodeLocal, string> {
    return this.idb.getTable();
  }

  async getViewport(contextId: string): Promise<{ x: number; y: number; zoom: number } | null> {
    const viewport = await this.idb.getViewport(contextId);
    if (!viewport) return null;
    return { x: viewport.x, y: viewport.y, zoom: viewport.zoom };
  }

  async saveViewport(contextId: string, viewport: { x: number; y: number; zoom: number }): Promise<void> {
    await this.idb.saveViewport({
      contextId,
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
      tsUpdated: nowIso(),
    });
  }

  private async enqueueCloudUpsert(inputs: LayoutNodeInput[]): Promise<UpsertResult> {
    if (!this.supabaseAdapter) {
      return { success: true, newVersions: {} };
    }

    const taskSync = this.syncQueue.then(
      () => this.supabaseAdapter!.upsert(inputs),
      () => this.supabaseAdapter!.upsert(inputs)
    );

    this.syncQueue = taskSync.then(
      () => undefined,
      () => undefined
    );

    return taskSync;
  }
}

let instanceStorage: HybridNodeStorage | null = null;

export function getHybridNodeStorage(
  supabaseClient: SupabaseClient = defaultSupabase
): HybridNodeStorage {
  if (!instanceStorage) {
    instanceStorage = new HybridNodeStorage(supabaseClient);
  }
  return instanceStorage;
}

export function resetHybridNodeStorage(): void {
  instanceStorage = null;
  db = null;
}
