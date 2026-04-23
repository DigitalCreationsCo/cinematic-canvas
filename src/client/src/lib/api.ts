import { supabase } from "./supabase.js";
import { getActiveTeamId } from "./auth-context.js";
import { getActiveWorldId } from "#client/store/useWorldStore.js";
import { getActiveProjectId } from "#client/store/useProjectStore.js";

import { NodeFactory } from '../domain/canvas/NodeFactory.js';
import { useNodeStore } from '../store/useNodeStore.js';
import { trpcClient as api } from './trpc.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export const startPipeline = (input: Parameters<typeof api.projects.start.mutate>[0]) => {
  return api.projects.start.mutate(input);
};

export const stopPipeline = (input: Parameters<typeof api.projects.stop.mutate>[0]) => {
  return api.projects.stop.mutate(input);
};

export const resumePipeline = (input: Parameters<typeof api.projects.resume.mutate>[0]) => {
  return api.projects.resume.mutate(input);
};

export const regenerateScene = (input: Parameters<typeof api.projects.regenerateScene.mutate>[0]) => {
  return api.projects.regenerateScene.mutate(input);
};

export const regenerateFrame = (input: Parameters<typeof api.projects.regenerateFrame.mutate>[0]) => {
  return api.projects.regenerateFrame.mutate(input);
};

export const resolveIntervention = (input: Parameters<typeof api.projects.resolveIntervention.mutate>[0]) => {
  return api.projects.resolveIntervention.mutate(input);
};

export const requestFullState = (input: Parameters<typeof api.projects.requestState.mutate>[0]) => {
  return api.projects.requestState.mutate(input);
};

export const generateCharacterImage = (input: Parameters<typeof api.assets.generateCharacterImage.mutate>[0]) => {
  return api.assets.generateCharacterImage.mutate(input);
};

export const generateLocationImage = (input: Parameters<typeof api.assets.generateLocationImage.mutate>[0]) => {
  return api.assets.generateLocationImage.mutate(input);
};

export const generateComposites = (input: Parameters<typeof api.projects.generateComposites.mutate>[0]) => {
  return api.projects.generateComposites.mutate(input);
};

export const createProject = (input: Parameters<typeof api.projects.create.mutate>[0]) => {
  return api.projects.create.mutate(input);
};

export const patchEntities = (input: Parameters<typeof api.entities.patch.mutate>[0]) => {
  return api.entities.patch.mutate(input);
};

export const patchAsset = (input: Parameters<typeof api.assets.patch.mutate>[0]) => {
  return api.assets.patch.mutate(input);
};

export const deleteEntity = (input: Parameters<typeof api.entities.delete.mutate>[0]) => {
  return api.entities.delete.mutate(input);
};

export const resolveMentions = (input: Parameters<typeof api.mention.resolve.mutate>[0]) => {
  return api.mention.resolve.mutate(input);
};

export const registerMentionHandle = (input: Parameters<typeof api.mention.register.mutate>[0]) => {
  return api.mention.register.mutate(input);
};

export const unregisterMentionHandle = (input: Parameters<typeof api.mention.unregister.mutate>[0]) => {
  return api.mention.unregister.mutate(input);
};

export const getSceneAssets = (input: Parameters<typeof api.projects.sceneAssets.query>[0]) => {
  return api.projects.sceneAssets.query(input);
};

export const getProjectAssets = (input: Parameters<typeof api.projects.assets.query>[0]) => {
  return api.projects.assets.query(input);
};

export const getCharacterAssets = (input: Parameters<typeof api.projects.characterAssets.query>[0]) => {
  return api.projects.characterAssets.query(input);
};

export const getLocationAssets = (input: Parameters<typeof api.projects.locationAssets.query>[0]) => {
  return api.projects.locationAssets.query(input);
};

export const getProjects = (input: Parameters<typeof api.projects.list.query>[0]) => {
  return api.projects.list.query(input);
};

export const fetchActiveJobsForProject = (input: Parameters<typeof api.jobs.list.query>[0]) => {
  return api.jobs.list.query(input);
};

export const getCommandStatus = (input: Parameters<typeof api.projects.command.query>[0]) => {
  return api.projects.command.query(input);
};

export const getMentionSuggestions = (input: Parameters<typeof api.mention.suggest.query>[0]) => {
  return api.mention.suggest.query(input);
};

export const getMentionHandle = (input: Parameters<typeof api.mention.getHandle.query>[0]) => {
  return api.mention.getHandle.query(input);
};

export const uploadAudio = async (file: File): Promise<{ audioPublicUri: string; audioGcsUri: string }> => {
  const formData = new FormData();
  formData.append("audio", file);

  const activeTeamId = getActiveTeamId();
  const worldId = getActiveWorldId();
  const projectId = getActiveProjectId();
  const { data: { session } } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    ...(activeTeamId ? { "x-team-id": activeTeamId } : {}),
    ...(worldId ? { "x-world-id": worldId } : {}),
    ...(projectId ? { "x-project-id": projectId } : {}),
  };

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${API_BASE_URL}/upload-audio`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to upload file.");
  }

  return response.json();
};

export type EntityType = 'scene' | 'character' | 'location';

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

export { api };
