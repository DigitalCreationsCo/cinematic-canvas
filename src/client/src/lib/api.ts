import { AssetRegistry, AssetKey } from "../../../shared/types/index.js";
import { PipelineCommand } from "../../../shared/types/pipeline.types.js";
import { supabase } from "./supabase.js";
import { getActiveTeamId } from "./auth-context.js";
import type { BatchEntityUpdateRequest } from "../../../shared/types/editable.types.js";
import { api } from "./routes.js";
import { getActiveWorldId } from "#client/store/useWorldStore.js";
import { ClientJob } from '#client/store/useJobStore.js';
import { NodeFactory } from '../domain/canvas/NodeFactory.js';
import { useNodeStore } from '../store/useNodeStore.js';
import type { contract } from "../../../shared/api-contracts.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

async function sendCommand<T>(endpoint: string, body: T): Promise<{ projectId: string; message: string; commandId: string; }> {
  return apiFetch(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ============================================================================
// Pipeline Control Commands
// ============================================================================

export const startPipeline = (args: (Omit<Extract<PipelineCommand, { type: "START_PIPELINE"; }>, "projectId" | "type" | "timestamp"> & { projectId?: string })) =>
  sendCommand(api.projects.start(), args);

export const stopPipeline = (args: Omit<Extract<PipelineCommand, { type: "STOP_PIPELINE"; }>, "type" | "timestamp">) =>
  sendCommand(api.projects.stop(), args);

export const resumePipeline = (args: Omit<Extract<PipelineCommand, { type: "RESUME_PIPELINE"; }>, "type" | "timestamp">) =>
  sendCommand(api.projects.resume(args.projectId), args);

export const regenerateScene = (args: Omit<Extract<PipelineCommand, { type: "GENERATE_SCENE_VIDEO"; }>, "type" | "timestamp">) =>
  sendCommand(api.projects.regenerateScene(args.projectId), args);

export const regenerateFrame = (args: Omit<Extract<PipelineCommand, { type: "GENERATE_SCENE_FRAMES"; }>, "type" | "timestamp">) =>
  sendCommand(api.projects.regenerateFrame(args.projectId), args);

export const resolveIntervention = (args: Omit<Extract<PipelineCommand, { type: "RESOLVE_INTERVENTION"; }>, "type" | "timestamp">) =>
  sendCommand(api.projects.resolveIntervention(args.projectId), args);


// ============================================================================
// Data Fetching
// ============================================================================

export const requestFullState = (args: Omit<Extract<PipelineCommand, { type: "REQUEST_FULL_STATE"; }>, "type" | "timestamp">) =>
  sendCommand(api.projects.requestState(args.projectId), args);

export const getSceneAssets = async (projectId: string, sceneId: string): Promise<AssetRegistry> => {
  return apiFetch(api.projects.sceneAssets(projectId, sceneId));
};

export const getProjectAssets = async (projectId: string): Promise<AssetRegistry> => {
  return apiFetch(api.projects.assets(projectId));
};

export const getCharacterAssets = async (projectId: string, characterId: string): Promise<AssetRegistry> => {
  return apiFetch(api.projects.characterAssets(projectId, characterId));
};

export const getLocationAssets = async (projectId: string, locationId: string): Promise<AssetRegistry> => {
  return apiFetch(api.projects.locationAssets(projectId, locationId));
};

export const uploadAudio = async (file: File): Promise<{ audioPublicUri: string; audioGcsUri: string; }> => {
  const formData = new FormData();
  formData.append("audio", file);
  return apiFetchMultipart(api.assets.uploadAudio(), formData);
};

/**
 * Create a character entity in the DB and queue async AI image generation.
 *
 * The server now returns 202 immediately after persisting the entity and
 * dispatching the GENERATE_CHARACTERS pipeline command.  The generated image
 * will arrive via the SSE NEW_ASSETS_BATCH event — callers must not block on
 * an image URL from this response.
 */
export const generateCharacterImage = async (
  projectId: string,
  name: string,
  description: string
): Promise<{ message: string; characterId: string; }> => {
  return apiFetch(api.assets.generateCharacterImage(), {
    method: 'POST',
    body: JSON.stringify({ projectId, name, description }),
  });
};

/**
 * Create a location entity in the DB and queue async AI image generation.
 *
 * The server now returns 202 immediately after persisting the entity and
 * dispatching the GENERATE_LOCATIONS pipeline command.  The generated image
 * will arrive via the SSE NEW_ASSETS_BATCH event — callers must not block on
 * an image URL from this response.
 */
export const generateLocationImage = async (
  projectId: string,
  name: string,
  description: string
): Promise<{ message: string; locationId: string; }> => {
  return apiFetch(api.assets.generateLocationImage(), {
    method: 'POST',
    body: JSON.stringify({ projectId, name, description }),
  });
};

/**
 * Queue an on-demand composite image generation job.
 *
 * The server returns 202 immediately.  The generated composite images arrive
 * via the SSE NEW_ASSETS_BATCH event keyed by imageId, followed by FULL_STATE
 * once the worker job completes.
 */
export const generateComposites = async (
  projectId: string,
  payload: Extract<PipelineCommand, { type: "GENERATE_COMPOSITES" }>["payload"]
): Promise<{ message: string; projectId: string; imageId: string; commandId: string; }> => {
  return apiFetch(api.projects.generateComposites(projectId), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export async function apiFetchMultipart(endpoint: string, formData: FormData) {
  const activeTeamId = getActiveTeamId();
  const worldId = getActiveWorldId();
  const { data: { session } } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    ...(activeTeamId ? { "x-team-id": activeTeamId } : {}),
    ...(worldId ? { "x-world-id": worldId } : {}),
  };

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to upload file.");
  }

  return response.json();
}

export const getProjects = async (): Promise<{ id: string; createdAt: string; }[]> => {
  return apiFetch(api.projects.list());
};

export const createProject = async (payload: { title?: string, initialPrompt?: string, audioGcsUri?: string, audioPublicUri?: string, worldId?: string, teamId: string }) => {
  return apiFetch(api.projects.list(), {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

/**
 * Fetches active (non-terminal) jobs for the given project.
 * Called once on SSE connect to hydrate useJobStore.
 */
export async function fetchActiveJobsForProject(
  projectId: string,
): Promise<{ jobs: ClientJob[] }> {
  return apiFetch(api.jobs.list(projectId));
}

/**
 * Generic API fetch helper
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const activeTeamId = getActiveTeamId();
  const worldId = getActiveWorldId();
  const { data: { session } } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(activeTeamId ? { "x-team-id": activeTeamId } : {}),
    ...(worldId ? { "x-world-id": worldId } : {}),
  };

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API Request failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get command status (optional - for debugging)
 */
export async function getCommandStatus({
  projectId,
  commandId,
}: {
  projectId: string;
  commandId: string;
}) {
  return apiFetch(api.projects.command(projectId, commandId));
}

// ============================================================================
// Entity Attribute Updates
// ============================================================================

/**
 * Batch PATCH for entity attribute changes.
 * Called exclusively by the entityDebounce flush function.
 * Response body is intentionally ignored here — state is updated via SSE ENTITY_UPDATED.
 */
export const patchEntities = async (
  body: BatchEntityUpdateRequest
): Promise<void> => {
  await apiFetch(api.entities.patch(), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
};

// ============================================================================
// Asset Version Promotion
// ============================================================================

/**
 * Promote an asset version (update the `best` pointer on asset_entries).
 * Replaces the old PubSub UPDATE_SCENE_ASSET command.
 * State update arrives via SSE ENTITY_UPDATED event.
 */
export const patchAsset = async (
  entityId: string,
  body: {
    entityType: 'scene' | 'character' | 'location' | 'project';
    assetKey: AssetKey;
    version: number | null;
    projectId: string;
  }
): Promise<void> => {
  await apiFetch(api.assets.patch(entityId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
};

// ============================================================================
// Entity Deletion
// ============================================================================

export type EntityType = 'scene' | 'character' | 'location';

export const deleteEntity = async (entityId: string, entityType: EntityType): Promise<{ success: boolean }> => {
  return apiFetch(api.entities.delete(entityId), {
    method: 'DELETE',
    body: JSON.stringify({ entityType }),
  });
};

// ============================================================================
// Entity Mention System (Tag Registry + KBHydration)
// ============================================================================

export interface ResolveMentionsRequest {
  htmlInput: string;
  projectId: string;
  options?: {
    includeUnauthorized?: boolean;
  };
}

export interface ResolveMentionsResponse {
  success: boolean;
  prompt: string | null;
  unauthorizedHandles: string[];
  errors: string[];
  metadata: {
    resolvedCount: number;
    unauthorizedCount: number;
    processingTimeMs: number;
  };
}

export interface MentionSuggestion {
  handle: string;
  displayName: string;
  entityType: 'character' | 'location' | 'prop';
  avatarUrl?: string;
  scope: 'project' | 'world';
  isOrphaned: boolean;
}

export interface SuggestMentionsResponse {
  suggestions: MentionSuggestion[];
  totalAvailable: number;
}

export const resolveMentions = async (request: ResolveMentionsRequest): Promise<ResolveMentionsResponse> => {
  return apiFetch('/entities/resolve', {
    method: 'POST',
    body: JSON.stringify(request),
  });
};

export const getMentionSuggestions = async (projectId: string, query: string = '', limit: number = 10): Promise<SuggestMentionsResponse> => {
  const params = new URLSearchParams({ query, limit: limit.toString() });
  return apiFetch(`/entities/${projectId}/suggest?${params}`);
};

export const registerMentionHandle = async (input: {
  handle: string;
  entityId: string;
  entityType: 'character' | 'location' | 'prop';
  projectId?: string;
  worldId?: string;
}): Promise<{ handle: string; entityId: string; entityType: string }> => {
  return apiFetch('/entities/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
};

export const unregisterMentionHandle = async (handle: string): Promise<void> => {
  return apiFetch(`/entities/${encodeURIComponent(handle)}`, {
    method: 'DELETE',
  });
};

export const getMentionHandle = async (handle: string): Promise<{ handle: string; entityId: string; entityType: string } | null> => {
  return apiFetch(`/entities/${encodeURIComponent(handle)}`);
};

// ============================================================================
// Optimistic Node Creation
// ============================================================================

function generateClientId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `pending_${timestamp}_${random}`;
}

export const createEntityWithPendingNode = (params: {
  entityType: EntityType;
  projectId: string;
  contextId: string;
  contextType: 'project' | 'world';
  scope: 'world' | 'project';
  posCanvas?: { x: number; y: number };
  data?: Record<string, unknown>;
}): { id: string; pendingNodeId: string } => {
  const label = params.data?.name as string | undefined;
  const entityId = generateClientId();

  const pendingNode = NodeFactory.createPendingNode({
    type: params.entityType,
    entityId,
    contextId: params.contextId,
    contextType: params.contextType,
    posCanvas: params.posCanvas ?? { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
    scope: params.scope,
    label,
  });

  useNodeStore.getState().addNode(pendingNode);

  return { id: entityId, pendingNodeId: entityId };
};

export const confirmEntityNode = (
  pendingNodeId: string,
  serverEntityId: string,
  serverData?: Record<string, unknown>
): void => {
  const nodeStore = useNodeStore.getState();
  const node = nodeStore.nodes.find(n => n.id === pendingNodeId);

  if (node && serverEntityId !== pendingNodeId) {
    const confirmedNode = NodeFactory.createNode({
      type: node.type as any,
      entityId: serverEntityId,
      contextId: node.data.contextId,
      contextType: node.data.contextType,
      posCanvas: node.position,
      scope: node.data.scope,
      label: serverData?.name as string | undefined,
    });

    nodeStore.deleteNode(pendingNodeId, false);
    nodeStore.addNode(confirmedNode);
  } else if (node && serverEntityId === pendingNodeId) {
    nodeStore.promotePendingNode(pendingNodeId);
  }
};