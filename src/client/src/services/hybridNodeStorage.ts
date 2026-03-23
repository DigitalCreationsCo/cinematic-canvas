import Dexie from 'dexie';
import { type SupabaseClient } from '@supabase/supabase-js';
import { supabase as createSupabase } from '../lib/supabase.js';

export interface LayoutNodeLocal {
  id: string;
  idContext: string;
  contextType: 'project' | 'world';
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

export interface LayoutNodeOutput {
  idEntity: string;
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

class CanvasNodeDB extends Dexie {
  nodeLayouts!: Dexie.Table<LayoutNodeLocal, string>;
  
  constructor() {
    super('CinematicCanvasNodeStorage');
    this.version(1).stores({
      nodeLayouts: 'id, idContext, idEntity, tsUpdated, tsSynced',
    });
  }
}

const db = new CanvasNodeDB();

function makeId(contextId: string, entityId: string): string {
  return `${contextId}:${entityId}`;
}

class IndexedDBAdapter {
  private db: CanvasNodeDB;

  constructor(database: CanvasNodeDB) {
    this.db = database;
  }

  async fetch(contextId: string): Promise<LayoutNodeLocal[]> {
    return this.db.nodeLayouts.where('idContext').equals(contextId).toArray();
  }

  async put(layout: LayoutNodeLocal): Promise<void> {
    await this.db.nodeLayouts.put(layout);
  }

  async delete(id: string): Promise<void> {
    await this.db.nodeLayouts.delete(id);
  }

  getTable(): Dexie.Table<LayoutNodeLocal, string> {
    return this.db.nodeLayouts;
  }
}

export class SupabaseAdapter implements ISyncAdapter {
  constructor(private supabase: SupabaseClient) {}

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

      const { data: updateData, error: updateError } = await this.supabase
        .from('canvas_node_layouts')
        .update({
          val_pos_x: node.valPosXTarget,
          val_pos_y: node.valPosYTarget,
          val_width: node.valWidthTarget,
          val_height: node.valHeightTarget,
          json_ui_metadata: node.jsonUiMetadata ?? {},
          node_type: node.nodeTypeTarget,
          idx_version: newVersion,
          ts_updated: new Date().toISOString(),
        })
        .eq('id_context', node.idContextTarget)
        .eq('id_entity', node.idEntityTarget)
        .eq('idx_version', node.idxVersionCurrent)
        .select('idx_version')
        .single();

      if (updateError) {
        errors.push(`Failed to update ${node.idEntityTarget}: ${updateError.message}`);
        continue;
      }

      if (updateData) {
        newVersions[node.idEntityTarget] = (updateData as { idx_version: number }).idx_version;
        continue;
      }

      const { data: existingRow } = await this.supabase
        .from('canvas_node_layouts')
        .select('idx_version')
        .eq('id_context', node.idContextTarget)
        .eq('id_entity', node.idEntityTarget)
        .single();

      if (existingRow) {
        newVersions[node.idEntityTarget] = (existingRow as { idx_version: number }).idx_version;
        continue;
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
          const { data: conflictRow } = await this.supabase
            .from('canvas_node_layouts')
            .select('idx_version')
            .eq('id_context', node.idContextTarget)
            .eq('id_entity', node.idEntityTarget)
            .single();
          if (conflictRow) {
            newVersions[node.idEntityTarget] = (conflictRow as { idx_version: number }).idx_version;
            continue;
          }
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

export class HybridNodeStorage {
  private idb: IndexedDBAdapter;
  private supabaseAdapter: SupabaseAdapter | null = null;
  private cloudSyncEnabled: boolean;
  /**
   * Sequential queue for Supabase upserts to prevent OCC race conditions.
   * Each upsert awaits the previous before executing, ensuring in-order writes.
   */
  private _syncQueue: Promise<void> = Promise.resolve();

  constructor(
    supabaseClient: SupabaseClient,
    database?: CanvasNodeDB
  ) {
    this.idb = new IndexedDBAdapter(database ?? db);
    
    const envValue = typeof import.meta !== 'undefined' 
      ? (import.meta.env?.VITE_ENABLE_CLOUD_NODE_SYNC as string | undefined)
      : undefined;
    
    this.cloudSyncEnabled = envValue === 'true';
    
    if (this.cloudSyncEnabled) {
      this.supabaseAdapter = new SupabaseAdapter(supabaseClient);
      console.debug('[HybridNodeStorage] Cloud sync enabled (VITE_ENABLE_CLOUD_NODE_SYNC=true)');
    } else {
      if (envValue === 'false') {
        console.debug('[HybridNodeStorage] Cloud sync disabled (VITE_ENABLE_CLOUD_NODE_SYNC=false)');
      } else {
        console.debug('[HybridNodeStorage] Cloud sync disabled (env var not set to "true")');
      }
    }
  }

  isCloudSyncEnabled(): boolean {
    return this.cloudSyncEnabled;
  }

  async fetch(contextId: string, options?: { syncFromServer?: boolean }): Promise<LayoutNodeOutput[]> {
    const local = await this.idb.fetch(contextId);
    
    const mapped: LayoutNodeOutput[] = local.map(row => ({
      idEntity: row.idEntity,
      nodeType: row.nodeType,
      valPosX: row.valPosX,
      valPosY: row.valPosY,
      valWidth: row.valWidth,
      valHeight: row.valHeight,
      jsonUiMetadata: row.jsonUiMetadata,
      idxVersion: row.idxVersion,
    }));

    if (options?.syncFromServer && this.supabaseAdapter) {
      try {
        const serverData = await this.supabaseAdapter.fetch(contextId);
        
        for (const serverRow of serverData) {
          const localRow = local.find(r => r.idEntity === serverRow.idEntity);
          
          if (!localRow || serverRow.idxVersion >= localRow.idxVersion) {
            const id = makeId(contextId, serverRow.idEntity);
            await this.idb.put({
              id,
              idContext: contextId,
              contextType: localRow?.contextType ?? 'project',
              idEntity: serverRow.idEntity,
              nodeType: serverRow.nodeType,
              valPosX: serverRow.valPosX,
              valPosY: serverRow.valPosY,
              valWidth: serverRow.valWidth,
              valHeight: serverRow.valHeight,
              jsonUiMetadata: serverRow.jsonUiMetadata,
              idxVersion: serverRow.idxVersion,
              tsUpdated: new Date().toISOString(),
              tsSynced: new Date().toISOString(),
            });
          }
        }
        
        const updated = await this.idb.fetch(contextId);
        return updated.map(row => ({
          idEntity: row.idEntity,
          nodeType: row.nodeType,
          valPosX: row.valPosX,
          valPosY: row.valPosY,
          valWidth: row.valWidth,
          valHeight: row.valHeight,
          jsonUiMetadata: row.jsonUiMetadata,
          idxVersion: row.idxVersion,
        }));
      } catch (err) {
        console.error('[HybridNodeStorage] Failed to sync from server, using local data:', err);
      }
    }

    return mapped;
  }

  async upsert(inputs: LayoutNodeInput[]): Promise<UpsertResult> {
    if (inputs.length === 0) {
      return { success: true, newVersions: {} };
    }

    const contextId = inputs[0].idContextTarget;
    const newVersions: Record<string, number> = {};
    const now = new Date().toISOString();

    const existingLocal = await this.idb.fetch(contextId);

    for (const input of inputs) {
      const id = makeId(input.idContextTarget, input.idEntityTarget);
      const existingRow = existingLocal.find(r => r.idEntity === input.idEntityTarget);
      
      if (existingRow && existingRow.idxVersion > input.idxVersionCurrent) {
        newVersions[input.idEntityTarget] = existingRow.idxVersion;
        continue;
      }

      const newVersion = input.idxVersionCurrent + 1;
      newVersions[input.idEntityTarget] = newVersion;

      await this.idb.put({
        id,
        idContext: input.idContextTarget,
        contextType: input.contextTypeTarget,
        idEntity: input.idEntityTarget,
        nodeType: input.nodeTypeTarget,
        valPosX: input.valPosXTarget,
        valPosY: input.valPosYTarget,
        valWidth: input.valWidthTarget ?? null,
        valHeight: input.valHeightTarget ?? null,
        jsonUiMetadata: input.jsonUiMetadata ?? null,
        idxVersion: newVersion,
        tsUpdated: now,
        tsSynced: null,
      });
    }

    if (this.supabaseAdapter) {
      // Chain onto _syncQueue so upserts execute sequentially, preventing
      // OCC race conditions when multiple upserts are in flight. (BUG-3 fix)
      const adapterRef = this.supabaseAdapter;
      this._syncQueue = this._syncQueue.then(async () => {
        try {
          const result = await adapterRef.upsert(inputs);
          if (result.success) {
            const table = this.idb.getTable();
            for (const [entityId] of Object.entries(result.newVersions)) {
              const id = makeId(contextId, entityId);
              const row = await table.get(id);
              if (row) {
                await table.update(id, { tsSynced: now });
              }
            }
            console.debug('[HybridNodeStorage] Cloud sync completed', { count: inputs.length });
          } else {
            console.warn('[HybridNodeStorage] Cloud sync partial failure:', result.error);
          }
        } catch (err) {
          console.warn('[HybridNodeStorage] Cloud sync failed, data saved locally:', err);
        }
      });
    }

    return { success: true, newVersions };
  }

  async delete(contextId: string, entityId: string): Promise<void> {
    const id = makeId(contextId, entityId);
    
    await this.idb.delete(id);

    if (this.supabaseAdapter) {
      this.supabaseAdapter.delete(contextId, entityId).catch(err => {
        console.warn('[HybridNodeStorage] Cloud delete failed:', err);
      });
    }
  }

  async applyRemoteChange(layout: LayoutNodeOutput & { idContext: string }): Promise<void> {
    const id = makeId(layout.idContext, layout.idEntity);
    
    const existing = await this.idb.getTable().get(id);
    
    await this.idb.put({
      id,
      idContext: layout.idContext,
      contextType: existing?.contextType ?? 'project',
      idEntity: layout.idEntity,
      nodeType: layout.nodeType,
      valPosX: layout.valPosX,
      valPosY: layout.valPosY,
      valWidth: layout.valWidth,
      valHeight: layout.valHeight,
      jsonUiMetadata: layout.jsonUiMetadata,
      idxVersion: layout.idxVersion,
      tsUpdated: new Date().toISOString(),
      tsSynced: new Date().toISOString(),
    });
  }

  async getUnsyncedChanges(contextId: string): Promise<LayoutNodeLocal[]> {
    return this.idb.getTable()
      .where('idContext')
      .equals(contextId)
      .filter(row => row.tsSynced === null)
      .toArray();
  }

  async forceSyncUnsynced(): Promise<number> {
    if (!this.supabaseAdapter) {
      console.warn('[HybridNodeStorage] Cloud sync not enabled, skipping force sync');
      return 0;
    }

    // BUG-2 fix: upsert() stores tsSynced as null, not '' (empty string).
    // Use toCollection().filter() to reliably match null values.
    const unsynced = await this.idb.getTable()
      .toCollection()
      .filter(row => row.tsSynced === null)
      .toArray();

    if (unsynced.length === 0) return 0;

    const inputs: LayoutNodeInput[] = unsynced.map(row => ({
      idContextTarget: row.idContext,
      contextTypeTarget: row.contextType,
      idEntityTarget: row.idEntity,
      nodeTypeTarget: row.nodeType,
      valPosXTarget: row.valPosX,
      valPosYTarget: row.valPosY,
      valWidthTarget: row.valWidth ?? undefined,
      valHeightTarget: row.valHeight ?? undefined,
      jsonUiMetadata: row.jsonUiMetadata ?? undefined,
      idxVersionCurrent: row.idxVersion - 1,
    }));

    const result = await this.supabaseAdapter.upsert(inputs);
    
    if (result.success) {
      const now = new Date().toISOString();
      const table = this.idb.getTable();
      for (const row of unsynced) {
        await table.update(row.id, { tsSynced: now });
      }
      return unsynced.length;
    }

    return 0;
  }

  getTable(): Dexie.Table<LayoutNodeLocal, string> {
    return this.idb.getTable();
  }
}

let _instance: HybridNodeStorage | null = null;

export function getHybridNodeStorage(
  supabaseClient: SupabaseClient
): HybridNodeStorage {
  if (!_instance) {
    _instance = new HybridNodeStorage(supabaseClient);
  }
  return _instance;
}

export function resetHybridNodeStorage(): void {
  _instance = null;
}
