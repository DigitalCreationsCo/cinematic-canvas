import { NodeFactory } from "#client/domain/canvas/NodeFactory.js";
import { useNodeStore } from "#client/store/useNodeStore.js";
import { trpcClient as api } from "#client/lib/trpc.js";
import { EntityCreatableType } from "#shared/types/entity.types.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

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

export interface AddStyleReferenceInput {
  projectId: string;
  url: string;
}

export interface AddStyleReferenceResult {
  success: boolean;
  message: string;
  gcsUri: string;
  fileId: string;
}

export interface AddStyleReferenceFromNodeInput {
  projectId: string;
  fileId: string;
}

export interface AddStyleReferenceFromNodeResult {
  success: boolean;
  message: string;
  gcsUri: string;
}

export interface RemoveStyleReferenceInput {
  projectId: string;
  gcsUri: string;
}

export const addStyleReference = (
  input: AddStyleReferenceInput,
): Promise<AddStyleReferenceResult> => {
  return (api.projects as any).addStyleReference.mutate(input);
};

export const addStyleReferenceFromNode = (
  input: AddStyleReferenceFromNodeInput,
): Promise<AddStyleReferenceFromNodeResult> => {
  return (api.projects as any).addStyleReferenceFromNode.mutate(input);
};

export const removeStyleReference = (
  input: RemoveStyleReferenceInput,
): Promise<{ success: boolean; message: string }> => {
  return (api.projects as any).removeStyleReference.mutate(input);
};

export const updateGenerationRules = (input: {
  projectId: string;
  generationRules: string[];
}): Promise<{ success: boolean; message: string }> => {
  return (api.projects as any).updateGenerationRules.mutate(input);
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

export const generateScenesFromPrompt = (input: Parameters<typeof api.entities.createScenesWithAutoFill.mutate>[0]) => {
  return api.entities.createScenesWithAutoFill.mutate(input);
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

export const getPropAssets = (input: Parameters<typeof api.projects.propAssets.query>[0]) => {
  return api.projects.propAssets.query(input);
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

function generateClientId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `pending_${timestamp}_${random}`;
}

export const createEntityWithPendingNode = (params: {
  entityType: EntityCreatableType;
  projectId: string;
  contextId: string;
  contextType: "project" | "world";
  scope: "world" | "project";
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
    posCanvas: params.posCanvas ?? {
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
    },
    scope: params.scope,
    label,
  });

  useNodeStore.getState().addNode(pendingNode);

  return { id: entityId, pendingNodeId: entityId };
};

export const confirmEntityNode = (
  pendingNodeId: string,
  serverEntityId: string,
  serverData?: Record<string, unknown>,
): void => {
  const nodeStore = useNodeStore.getState();
  const node = nodeStore.nodes.find((n) => n.id === pendingNodeId);

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
