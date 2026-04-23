// Real-time Postgres Changes listener using Supabase Realtime.
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Admin client with service role (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
// Map of projectId -> channel
const projectChannels = new Map();
/**
 * Start listening to canvas_node_layouts changes for a specific project.
 * Returns the channel which can be used to unsubscribe.
 */
export function subscribeToLayoutChanges(projectId, onChange) {
    // Reuse existing channel if already subscribed
    const existing = projectChannels.get(projectId);
    if (existing) {
        console.debug(`[SupabaseRealtime] Reusing existing channel for project ${projectId}`);
        return existing;
    }
    console.log(`[SupabaseRealtime] Subscribing to canvas_node_layouts changes for project ${projectId}`);
    const channel = supabaseAdmin.channel(`canvas-layouts:${projectId}`);
    channel
        .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'canvas_node_layouts',
        filter: `id_context=eq.${projectId}`,
    }, (payload) => {
        console.debug(`[SupabaseRealtime] Layout change detected:`, {
            projectId,
            eventType: payload.eventType,
            entityId: payload.new?.id_entity || payload.old?.id_entity,
        });
        const row = payload.eventType === 'DELETE'
            ? payload.old
            : payload.new;
        if (!row) {
            console.warn('[SupabaseRealtime] No row data in payload');
            return;
        }
        const changePayload = {
            idEntity: row.id_entity,
            nodeType: row.node_type,
            valPosX: row.val_pos_x,
            valPosY: row.val_pos_y,
            valWidth: row.val_width,
            valHeight: row.val_height,
            jsonUiMetadata: row.json_ui_metadata,
            idxVersion: row.idx_version,
            contextType: row.context_type,
            contextId: row.id_context,
            eventType: payload.eventType,
        };
        onChange(changePayload);
    })
        .subscribe((status) => {
        console.log(`[SupabaseRealtime] Channel status for ${projectId}:`, status);
    });
    projectChannels.set(projectId, channel);
    return channel;
}
/**
 * Unsubscribe from layout changes for a specific project.
 */
export function unsubscribeFromLayoutChanges(projectId) {
    const channel = projectChannels.get(projectId);
    if (channel) {
        supabaseAdmin.removeChannel(channel);
        projectChannels.delete(projectId);
        console.log(`[SupabaseRealtime] Unsubscribed from project ${projectId}`);
    }
}
/**
 * Unsubscribe from all layout changes.
 */
export function unsubscribeAll() {
    for (const [projectId, channel] of projectChannels) {
        supabaseAdmin.removeChannel(channel);
        console.log(`[SupabaseRealtime] Unsubscribed from project ${projectId}`);
    }
    projectChannels.clear();
}
/**
 * Check if Supabase Realtime is properly configured.
 */
export function isRealtimeConfigured() {
    return !!(supabaseUrl && supabaseServiceKey);
}
/**
 * Get count of active subscriptions.
 */
export function getActiveSubscriptionCount() {
    return projectChannels.size;
}
//# sourceMappingURL=supabaseRealtime.js.map