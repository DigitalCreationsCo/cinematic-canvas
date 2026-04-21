/**
 * Typed API client.
 *
 * Drop-in replacement for the raw `apiFetch` / `apiFetchMultipart` helpers.
 * Every call is fully typed end-to-end — body, params, query, and response.
 *
 * Usage:
 *   import { apiClient } from './api-client';
 *
 *   const { body } = await apiClient.projects.list({ query: {} });
 *   //      ^^^^ typed as { id: string; createdAt: string; }[]
 */

import { initClient, type ApiFetcherArgs } from '@ts-rest/core';
import { contract } from '#shared/contract.js';
import { supabase } from './supabase.js';
import { getActiveTeamId } from './auth-context.js';
import { getActiveWorldId } from '#client/store/useWorldStore.js';
import { getActiveProjectId } from '#client/store/useProjectStore.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// ---------------------------------------------------------------------------
// Auth + context headers (identical logic to the old apiFetch helpers)
// ---------------------------------------------------------------------------

async function buildAuthHeaders(): Promise<Record<string, string>> {
    const activeTeamId = getActiveTeamId();
    const worldId = getActiveWorldId();
    const projectId = getActiveProjectId();
    const { data: { session } } = await supabase.auth.getSession();

    return {
        ...(activeTeamId ? { 'x-team-id': activeTeamId } : {}),
        ...(worldId ? { 'x-world-id': worldId } : {}),
        ...(projectId ? { 'x-project-id': projectId } : {}),
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
}

// ---------------------------------------------------------------------------
// Custom fetcher — ts-rest calls this for every request.
// `body` is already serialised (JSON string or FormData); headers already
// include Content-Type where appropriate.
// ---------------------------------------------------------------------------

async function authAwareFetcher(args: ApiFetcherArgs) {
    const { path, method, headers, body } = args;
    const authHeaders = await buildAuthHeaders();

    const response = await fetch(path, {
        method,
        headers: { ...headers, ...authHeaders },
        body: body ?? undefined,
    });

    // ts-rest expects { status, body, headers } — parse JSON best-effort
    const responseBody = await response.json().catch(() => null);
    return { status: response.status, body: responseBody, headers: response.headers };
}

// ---------------------------------------------------------------------------
// Typed client
// ---------------------------------------------------------------------------

export const apiClient = initClient(contract, {
    baseUrl: API_BASE_URL,
    baseHeaders: {},     // static headers go here; dynamic ones are in the fetcher
    api: authAwareFetcher,
});

// ---------------------------------------------------------------------------
// Helpers: unwrap + throw on non-2xx, mirrors old apiFetch behaviour.
// ---------------------------------------------------------------------------

type ClientResponse<T> = { status: number; body: T };

/**
 * Unwraps a ts-rest response, throwing on unexpected status codes.
 * Mirrors the old apiFetch error-throw behaviour.
 */
export function unwrap<T>(
    result: ClientResponse<T>,
    expectedStatus: number = 200,
): T {
    if (result.status !== expectedStatus) {
        const body = result.body as any;
        throw new Error(body?.error ?? `API request failed with status ${result.status}`);
    }
    return result.body;
}