import { supabase } from '../lib/supabase.js';

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

export async function fetchCanvasLayouts(
  contextId: string
): Promise<LayoutNodeOutput[]> {
  const { data, error } = await supabase
    .from('canvas_node_layouts')
    .select('*')
    .eq('id_context', contextId);

  if (error) {
    console.error('[canvasLayoutSync] Failed to fetch layouts:', error);
    throw error;
  }

  return (data || []).map(row => ({
    idEntity: row.id_entity,
    nodeType: row.node_type,
    valPosX: row.val_pos_x,
    valPosY: row.val_pos_y,
    valWidth: row.val_width,
    valHeight: row.val_height,
    jsonUiMetadata: row.json_ui_metadata,
    idxVersion: row.idx_version,
  }));
}

export async function upsertCanvasLayouts(
  nodes: LayoutNodeInput[]
): Promise<{ success: boolean; newVersions: Record<string, number>; error?: string }> {
  if (nodes.length === 0) {
    return { success: true, newVersions: {} };
  }

  const newVersions: Record<string, number> = {};
  const errors: string[] = [];

  for (const node of nodes) {
    const newVersion = node.idxVersionCurrent + 1;

    const { data: updateData, error: updateError } = await supabase
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
      console.error('[canvasLayoutSync] Update error:', updateError);
      errors.push(`Failed to update ${node.idEntityTarget}: ${updateError.message}`);
      continue;
    }

    if (updateData) {
      newVersions[node.idEntityTarget] = (updateData as { idx_version: number }).idx_version;
      continue;
    }

    const { data: existingRow } = await supabase
      .from('canvas_node_layouts')
      .select('idx_version')
      .eq('id_context', node.idContextTarget)
      .eq('id_entity', node.idEntityTarget)
      .single();

    if (existingRow) {
      throw new OCCConflictError(
        node.idEntityTarget,
        node.idxVersionCurrent,
        (existingRow as { idx_version: number }).idx_version
      );
    }

    const { error: insertError } = await supabase
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
        throw new OCCConflictError(
          node.idEntityTarget,
          node.idxVersionCurrent,
          newVersion
        );
      }
      console.error('[canvasLayoutSync] Insert error:', insertError);
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

export async function deleteCanvasLayout(
  contextId: string,
  entityId: string
): Promise<void> {
  const { error } = await supabase
    .from('canvas_node_layouts')
    .delete()
    .eq('id_context', contextId)
    .eq('id_entity', entityId);

  if (error) {
    console.error('[canvasLayoutSync] Delete error:', error);
    throw error;
  }
}
