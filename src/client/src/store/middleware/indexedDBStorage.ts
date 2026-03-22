// src/client/src/store/middleware/indexedDBStorage.ts
// Local-first persistence middleware for Canvas Node Layouts.
// Uses Dexie (IndexedDB) for instant offline saves, with a debounced
// background sync to the Postgres OCC batch endpoint.

import Dexie, { type Table } from 'dexie';
import type { CanvasNodeLayout } from '../../../../shared/db/schema.js';
import type { CanvasNode } from '../../domain/canvas/NodeTypes.js';
import { getActiveTeamId } from '#/lib/auth-context.js';
import { supabase } from '#/lib/supabase.js';
import { api } from '#/lib/routes.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

// Workaround for Dexie class inheritance TS issues in nodenext
const AnyDexie = Dexie as any;

export class CanvasLayoutDB extends AnyDexie {
    layouts!: Table<CanvasNodeLayout, string>; // uuid pk

    constructor() {
        super('CinematicCanvasDB');
        this.version(1).stores({
            layouts: 'idLayout, idContext, [idContext+idEntity]',
        });
    }
}

export const dbLocal = new CanvasLayoutDB();

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 1500;

async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const activeTeamId = getActiveTeamId();
    const { data: { session } } = await supabase.auth.getSession();

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(activeTeamId ? { "x-team-id": activeTeamId } : {}),
    };

    if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    return fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            ...headers,
            ...options.headers,
        },
    });
}

export function debouncedPersistLayout(
    nodes: CanvasNode[],
    contextId: string,
    contextType: 'project' | 'world'
) {
    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(async () => {
        const payload = nodes.map(n => ({
            idContextTarget: contextId,
            contextTypeTarget: contextType,
            idEntityTarget: n.id,
            nodeTypeTarget: n.type,
            valPosXTarget: n.position.x,
            valPosYTarget: n.position.y,
            valWidthTarget: n.width,
            valHeightTarget: n.height,
            jsonUiMetadata: {
                nodeTypeFlag: n.data.nodeTypeFlag,
                pipelineSelected: n.data.pipelineSelected,
                collapsed: n.data.collapsed,
            },
            idxVersionCurrent: n.data.idxVersion,
        }));

        try {
            const res = await fetchWithAuth(api.canvas.batch(contextType, contextId), {
                method: 'PUT',
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                let errorMessage = `HTTP ${res.status}`;
                try {
                    const errorData = await res.json();
                    errorMessage = errorData.error || errorMessage;
                } catch {
                    // Use status text if JSON parsing fails
                }
                if (res.status === 409) {
                    console.warn('[indexedDBStorage] OCC conflict detected. Reload recommended.');
                } else {
                    console.error(`[indexedDBStorage] Failed to sync layouts: ${errorMessage}`);
                }
                return;
            }

            console.debug(`[indexedDBStorage] Synced ${nodes.length} node layouts successfully`);
        } catch (err) {
            console.error('[indexedDBStorage] Error syncing layouts:', err);
        }
    }, SYNC_DEBOUNCE_MS);
}
