import { RealtimeChannel } from '@supabase/supabase-js';
export declare const supabaseAdmin: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
/**
 * Interface for layout change payload
 */
export interface LayoutChangePayload {
    idEntity: string;
    nodeType: string;
    valPosX: number;
    valPosY: number;
    valWidth?: number;
    valHeight?: number;
    jsonUiMetadata?: Record<string, unknown>;
    idxVersion: number;
    contextType: string;
    contextId: string;
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
}
/**
 * Start listening to canvas_node_layouts changes for a specific project.
 * Returns the channel which can be used to unsubscribe.
 */
export declare function subscribeToLayoutChanges(projectId: string, onChange: (payload: LayoutChangePayload) => void): RealtimeChannel;
/**
 * Unsubscribe from layout changes for a specific project.
 */
export declare function unsubscribeFromLayoutChanges(projectId: string): void;
/**
 * Unsubscribe from all layout changes.
 */
export declare function unsubscribeAll(): void;
/**
 * Check if Supabase Realtime is properly configured.
 */
export declare function isRealtimeConfigured(): boolean;
/**
 * Get count of active subscriptions.
 */
export declare function getActiveSubscriptionCount(): number;
//# sourceMappingURL=supabaseRealtime.d.ts.map