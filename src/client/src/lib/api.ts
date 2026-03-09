import { AssetRegistry, AssetKey } from "../../../shared/types/index.js";
import { PipelineCommand } from "../../../shared/types/pipeline.types.js";
import { useStore } from "./store.js";
import { supabase } from "./supabase.js";

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

export const updateSceneAsset = (args: Omit<Extract<PipelineCommand, { type: "UPDATE_SCENE_ASSET"; }>, "type" | "timestamp">) =>
  sendCommand(`/project/${args.projectId}/scene/${args.payload.scene.id}/asset`, args);

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

  const { activeTeamId } = useStore.getState();
  const { data: { session } } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    ...(activeTeamId ? { "x-team-id": activeTeamId } : {}),
  };

  if (session?.access_token) {
    headers[ "Authorization" ] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${API_BASE_URL}/upload-audio`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to upload audio.");
  }

  return response.json();
};

export const getProjects = async (): Promise<{ id: string; createdAt: string; }[]> => {
  return apiFetch("/projects");
};

/**
 * Generic API fetch helper
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const { activeTeamId } = useStore.getState();
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