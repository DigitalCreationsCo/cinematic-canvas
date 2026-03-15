import { AssetRegistry, AssetKey } from "../../../shared/types/index.js";
import { PipelineCommand } from "../../../shared/types/pipeline.types.js";
import { supabase } from "./supabase.js";
import { getActiveTeamId } from "./auth-context.js";
import type { BatchEntityUpdateRequest } from "../../../shared/types/editable.types.js";

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
  sendCommand("/project/start", args); 

export const stopPipeline = (args: Omit<Extract<PipelineCommand, { type: "STOP_PIPELINE"; }>, "type" | "timestamp">) =>
  sendCommand("/project/stop", args);

export const resumePipeline = (args: Omit<Extract<PipelineCommand, { type: "RESUME_PIPELINE"; }>, "type" | "timestamp">) =>
  sendCommand(`/project/${args.projectId}/resume`, args);

export const regenerateScene = (args: Omit<Extract<PipelineCommand, { type: "REGENERATE_SCENE"; }>, "type" | "timestamp">) =>
  sendCommand(`/project/${args.projectId}/regenerate-scene`, args);

export const regenerateFrame = (args: Omit<Extract<PipelineCommand, { type: "GENERATE_SCENE_FRAMES"; }>, "type" | "timestamp">) =>
  sendCommand(`/project/${args.projectId}/regenerate-frame`, args);


export const resolveIntervention = (args: Omit<Extract<PipelineCommand, { type: "RESOLVE_INTERVENTION"; }>, "type" | "timestamp">) =>
  sendCommand(`/project/${args.projectId}/resolve-intervention`, args);


// ============================================================================
// Data Fetching
// ============================================================================

export const requestFullState = (args: Omit<Extract<PipelineCommand, { type: "REQUEST_FULL_STATE"; }>, "type" | "timestamp">) =>
  sendCommand(`/project/${args.projectId}/request-state`, args);

export const getSceneAssets = async (projectId: string, sceneId: string): Promise<AssetRegistry> => {
  return apiFetch(`/project/${projectId}/scene/${sceneId}/assets`);
};

export const getProjectAssets = async (projectId: string): Promise<AssetRegistry> => {
  return apiFetch(`/project/${projectId}/assets`);
};

export const getCharacterAssets = async (projectId: string, characterId: string): Promise<AssetRegistry> => {
  return apiFetch(`/project/${projectId}/character/${characterId}/assets`);
};

export const getLocationAssets = async (projectId: string, locationId: string): Promise<AssetRegistry> => {
  return apiFetch(`/project/${projectId}/location/${locationId}/assets`);
};

export const uploadAudio = async (file: File): Promise<{ audioPublicUri: string; audioGcsUri: string; }> => {
  const formData = new FormData();
  formData.append("audio", file);
  return apiFetchMultipart("/upload-audio", formData);
};

export async function apiFetchMultipart(endpoint: string, formData: FormData) {
  const activeTeamId = getActiveTeamId();
  const { data: { session } } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    ...(activeTeamId ? { "x-team-id": activeTeamId } : {}),
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
  return apiFetch("/projects");
};

/**
 * Generic API fetch helper
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const activeTeamId = getActiveTeamId();
  const { data: { session } } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(activeTeamId ? { "x-team-id": activeTeamId } : {}),
  };

  if (session?.access_token) {
    headers[ "Authorization" ] = `Bearer ${session.access_token}`;
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
  return apiFetch(`/project/${projectId}/command/${commandId}`);
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
  await apiFetch('/entities', {
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
  await apiFetch(`/assets/${entityId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
};