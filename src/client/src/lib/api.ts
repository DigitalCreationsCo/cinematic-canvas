import { supabase } from "./supabase.js";
import { getActiveTeamId } from "./auth-context.js";
import { getActiveWorldId } from "#client/store/useWorldStore.js";
import { getActiveProjectId } from "#client/store/useProjectStore.js";

import { z } from "zod";
import { ClientJob } from '#client/store/useJobStore.js';
import { NodeFactory } from '../domain/canvas/NodeFactory.js';
import { useNodeStore } from '../store/useNodeStore.js';

import { AssetRegistry, AssetKey } from "#shared/types/index.js";
import type { BatchEntityUpdateRequest } from "#shared/types/editable.types.js";
import { trpc } from './trpc.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export const startPipeline = (
  args: { projectId?: string; initialPrompt?: string }
) => {
  return trpc.projects.start.useMutation({
    input: args,
  });
};

export const stopPipeline = (
  args: { projectId: string }
) => {
  return trpc.projects.stop.useMutation({
    input: { projectId: args.projectId },
  });
};

export const resumePipeline = (
  args: { projectId: string; commandId?: string; payload?: unknown }
) => {
  return trpc.projects.resume.useMutation({
    input: { projectId: args.projectId, commandId: args.commandId, payload: args.payload },
  });
};

export const regenerateScene = (
  args: { projectId: string; sceneId: string }
) => {
  return trpc.projects.regenerateScene.useMutation({
    input: { projectId: args.projectId, payload: { sceneId: args.sceneId } },
  });
};

export const regenerateFrame = (
  args: { projectId: string; sceneId: string; assetKeys: string[] }
) => {
  return trpc.projects.regenerateFrame.useMutation({
    input: { projectId: args.projectId, payload: { sceneId: args.sceneId, assetKeys: args.assetKeys } },
  });
};

export const resolveIntervention = (
  args: { projectId: string; action: string }
) => {
  return trpc.projects.resolveIntervention.useMutation({
    input: { projectId: args.projectId, payload: { action: args.action } },
  });
};

export const requestFullState = (
  args: { projectId: string; commandId?: string }
) => {
  return trpc.projects.requestState.useMutation({
    input: { projectId: args.projectId, commandId: args.commandId },
  });
};

export const getSceneAssets = (args: { projectId: string; sceneId: string; }) => {
  return trpc.projects.sceneAssets.useQuery({
    projectId: args.projectId,
    sceneId: args.sceneId,
  });
};

export const getProjectAssets = (args: { projectId: string; }) => {
  return trpc.projects.assets.useQuery({
    projectId: args.projectId,
  });
};

export const getCharacterAssets = (args: { projectId: string; characterId: string; }) => {
  return trpc.projects.characterAssets.useQuery({
    projectId: args.projectId,
    characterId: args.characterId,
  });
};

export const getLocationAssets = (args: { projectId: string; locationId: string; }) => {
  return trpc.projects.locationAssets.useQuery({
    projectId: args.projectId,
    locationId: args.locationId,
  });
};

export const uploadAudio = async (file: File): Promise<{ audioPublicUri: string; audioGcsUri: string; }> => {
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

export const generateCharacterImage = (
  projectId: string,
  name: string,
  description: string
) => {
  return trpc.assets.generateCharacterImage.useMutation({
    input: { projectId, name, description },
  });
};

export const generateLocationImage = (
  projectId: string,
  name: string,
  description: string
) => {
  return trpc.assets.generateLocationImage.useMutation({
    input: { projectId, name, description },
  });
};

export const generateComposites = (
  projectId: string,
  payload: { imageId: string; inputImages: string[]; prompt: string }
) => {
  return trpc.projects.generateComposites.useMutation({
    input: { projectId, payload },
  });
};

export const getProjects = (worldId?: string) => {
  return trpc.projects.list.useQuery({ worldId });
};

export const createProject = () => {
  return trpc.projects.create.useMutation();
};

export const fetchActiveJobsForProject = (projectId: string) => {
  return trpc.jobs.list.useQuery({ projectId });
};

export const getCommandStatus = (projectId: string, commandId: string) => {
  return trpc.projects.command.useQuery({ projectId, commandId });
};

export const patchEntities = (updates: BatchEntityUpdateRequest['updates']) => {
  return trpc.entities.patch.useMutation({
    input: { projectId: '', updates },
  });
};

export const patchAsset = (
  entityId: string,
  body: {
    entityType: 'scene' | 'character' | 'location' | 'project';
    assetKey: AssetKey;
    version: number | null;
    projectId: string;
  }
) => {
  return trpc.assets.patch.useMutation({
    input: { entityId, ...body },
  });
};

export type EntityType = 'scene' | 'character' | 'location';

export const deleteEntity = (entityId: string, entityType: EntityType) => {
  return trpc.entities.delete.useMutation({
    input: { entityId, entityType },
  });
};

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

export const resolveMentions = () => {
  return trpc.mention.resolve.useMutation();
};

export const getMentionSuggestions = (projectId: string, query: string = '', limit: number = 10) => {
  return trpc.mention.suggest.useQuery({
    projectId,
    query,
    limit,
  });
};

export const registerMentionHandle = () => {
  return trpc.mention.register.useMutation();
};

export const unregisterMentionHandle = (handle: string) => {
  return trpc.mention.unregister.useMutation({
    input: { handle },
  });
};

export const getMentionHandle = (handle: string) => {
  return trpc.mention.getHandle.useQuery({ handle });
};

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