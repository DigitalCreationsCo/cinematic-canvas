// src/server/routes.ts
import { Router, type Request, type Response } from "express";
import { PubSub } from "@google-cloud/pubsub";
import {
  PIPELINE_COMMANDS_TOPIC_NAME,
  PIPELINE_EVENTS_TOPIC_NAME
} from "../../shared/config.js";
import { PipelineCommand, PipelineEvent, EntityType } from "../../shared/types/index.js";
import { v7 as uuidv7 } from "uuid";
import { Storage } from "@google-cloud/storage";
import multer from "multer";
import { ProjectRepository } from "../../shared/services/project-repository.js";
import { WorldRepository } from "../../shared/services/world-repository.js";
import { requireAuth } from "../middleware/auth.js";
import canvasRouter from "./canvas.routes.js";
import { api } from "./api-routes.js";

import { AssetVersionManager } from "../../shared/services/asset-version-manager.js";
import { z } from "zod";
import { BatchEntityCreateRequest, BatchEntityUpdateRequest } from "../../shared/types/editable.types.js";
import { InsertCharacter, InsertLocation, InsertScene } from "../../shared/types/entities.types.js";

import { GenerationTools } from "../../shared/tools/generation-tools.js";
import { usersAndTeamsDbService } from "../../shared/services/usersAndTeamsDbService.js";
import { db } from "../../shared/db/index.js";
import { sql } from "drizzle-orm";
import * as schema from "../../shared/db/schema.js";
import {
  subscribeToLayoutChanges,
  unsubscribeFromLayoutChanges,
  isRealtimeConfigured,
  type LayoutChangePayload
} from "../services/supabaseRealtime.js";
import { GCPStorageManager } from "../../shared/services/storage-manager.js";

export const serverId = `server-${uuidv7()}`;

async function isUserMemberOfTeam(userId: string, teamId: string): Promise<boolean> {
  return await usersAndTeamsDbService.isUserMemberOfTeam(userId, teamId);
}

const validateApiKey = (req: Request, res: Response, next: Function) => {
  const apiKey = req.headers["x-api-key"];
  const validKey = process.env.INTERNAL_API_KEY;

  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
  }
  next();
};

const generationTools = new GenerationTools();


const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT || "omo-dev";
const bucketName = (process.env.GOOGLE_CLOUD_BUCKET || "test-bucket") as string;
const bucket = new Storage({ projectId: gcpProjectId }).bucket(bucketName);

const router = Router();
export default router;

const storageManager = new GCPStorageManager(gcpProjectId, bucketName);
const projectRepository = new ProjectRepository();
const worldRepository = new WorldRepository();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const pubsub = new PubSub({
  ...(process.env.PUBSUB_EMULATOR_HOST && {
    apiEndpoint: process.env.PUBSUB_EMULATOR_HOST,
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
  }),
});

const commandsTopic = pubsub.topic(PIPELINE_COMMANDS_TOPIC_NAME);
try {
  const [exists] = await commandsTopic.exists();
  if (!exists) {
    await commandsTopic.create();
    console.log(`Created Pub/Sub topic: ${PIPELINE_COMMANDS_TOPIC_NAME}`);
  }
} catch (error: any) {
  console.warn(`Error ensuring commands topic exists: ${error.message}. Continuing...`);
}

const eventsTopic = pubsub.topic(PIPELINE_EVENTS_TOPIC_NAME);
try {
  const [exists] = await eventsTopic.exists();
  if (!exists) {
    await eventsTopic.create();
    console.log(`Created Pub/Sub topic: ${PIPELINE_EVENTS_TOPIC_NAME}`);
  }
} catch (error: any) {
  console.warn(`Error ensuring events topic exists: ${error.message}. Continuing...`);
}

async function publishCommand<T extends PipelineCommand["type"]>(
  command: Omit<Extract<PipelineCommand, { type: T; }>, "timestamp"> & { type: T; commandId: string; }
) {
  const fullCommand = {
    ...command,
    ...("payload" in command ? { payload: command.payload } : {}),
    timestamp: new Date().toISOString(),
    commandId: command.commandId || uuidv7(),
  };

  const data = Buffer.from(JSON.stringify(fullCommand));
  try {
    const messageId = await commandsTopic.publishMessage({ data });
    console.log(`[${command.projectId}] Published '${command.type}' command, messageId: ${messageId}`);
    return messageId;
  } catch (error: any) {
    console.error(`Received error while publishing: ${error.message}`);
    throw error;
  }
}

async function publishPipelineEvent(event: PipelineEvent) {
  const data = Buffer.from(JSON.stringify(event));
  try {
    const messageId = await eventsTopic.publishMessage({
      data,
      attributes: { projectId: event.projectId, type: event.type }
    });
    console.log(`[${event.projectId}] Published '${event.type}' event, messageId: ${messageId}`);
    return messageId;
  } catch (error: any) {
    console.error(`Received error while publishing event: ${error.message}`);
    throw error;
  }
}

// === AUTHENTICATED ROUTES ===
router.use(canvasRouter);

const getTeams = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return res.status(400).json({ error: "User ID is required." });

    const teams = await usersAndTeamsDbService.getTeams(req.user.id);
    res.status(200).json({ teams });
  } catch (error) {
    console.error("Failed to fetch teams:", error);
    res.status(500).json({ error: "Failed to fetch teams." });
  }
}
router.get(api.teams(), requireAuth, getTeams);

const joinOrCreateTeam = async (req: Request, res: Response) => {
  const { name } = req.body as { name: string; };
  const { id: userId, email: userEmail } = req.user!;

  if (!name) return res.status(400).json({ error: "Team name is required." });

  try {
    const result = await usersAndTeamsDbService.joinOrCreateTeam(userId, userEmail!, name);
    if (result.created) {
      return res.status(201).json({ id: result.id, name: result.name });
    }
    return res.status(200).json({ id: result.id, name: result.name });
  } catch (error) {
    console.error("Failed to join or create team:", error);
    return res.status(500).json({ error: "Failed to join or create team." });
  }
};
router.post(api.teams.joinOrCreate(), requireAuth, joinOrCreateTeam);

const getWorlds = async (req: Request, res: Response) => {
  const teamId = req.headers["x-team-id"] as string;
  if (!teamId) return res.status(400).json({ error: "Team ID is required." });
  if (!await isUserMemberOfTeam(req.user!.id, teamId)) return res.status(403).json({ error: "Access denied." });

  try {
    const worlds = await worldRepository.getWorldsForUser(req.user!.id);
    res.status(200).json({ worlds });
  } catch (error) {
    console.error("Failed to fetch worlds:", error);
    res.status(500).json({ error: "Failed to fetch worlds" });
  }
}
router.get(api.worlds.list(), requireAuth, getWorlds);

const createWorld = async (req: Request, res: Response) => {
  const { name, description, teamId } = req.body;
  const userId = req.user!.id;

  if (!name || !teamId) return res.status(400).json({ error: "Name and teamId are required." });
  if (!await isUserMemberOfTeam(userId, teamId)) return res.status(403).json({ error: "You are not a member of this team." });

  try {
    const world = await worldRepository.createWorld({ name, description, teamId, userId });
    res.status(201).json(world);
  } catch (error) {
    console.error("Failed to create world:", error);
    res.status(500).json({ error: "Failed to create world." });
  }
};
router.post(api.worlds.list(), requireAuth, createWorld);

const getProjects = async (req: Request, res: Response) => {
  const { worldId } = req.query as { worldId: string | undefined; };
  const teamId = req.headers["x-team-id"] as string;
  if (!teamId) return res.status(400).json({ error: "Team ID is required." });
  if (!await isUserMemberOfTeam(req.user!.id, teamId)) return res.status(403).json({ error: "Access denied." });

  try {
    const projects = await projectRepository.getProjectsForUser(req.user!.id, worldId);
    res.status(200).json({ projects });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
};
router.get(api.projects.list(), requireAuth, getProjects);

const createProjectHandler = async (req: Request, res: Response) => {
  try {
    const projectId = uuidv7();

    const { teamId } = req.body;
    const userId = req.user!.id;

    if (!teamId) return res.status(400).json({ error: "teamId is required." });
    if (!await isUserMemberOfTeam(userId, teamId)) return res.status(403).json({ error: "Access denied." });

    const initialProject = await projectRepository.buildInitialProject(projectId, { ...req.body, projectId });

    const project = await projectRepository.createProject(initialProject);

    res.status(201).json(project);
  } catch (error) {
    console.error("Failed to create project:", error);
    res.status(500).json({ error: "Failed to create project." });
  }
};
router.post(api.projects.list(), requireAuth, createProjectHandler);

const getProjectEvents = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  console.log(`[SSE] Connection requested for projectId: ${projectId}, User: ${req.user?.id}`);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });

  res.write(": ok\n\n");

  const subName = `client-${projectId}-${uuidv7()}`;
  const sub = eventsTopic.subscription(subName, { flowControl: { maxMessages: 1 } });

  try {
    await sub.create({
      ackDeadlineSeconds: 60,
      filter: `attributes.projectId = "${projectId}"`,
      expirationPolicy: { ttl: { seconds: 12 * 60 * 60 } }
    });
  } catch (e: any) { if (e.code !== 6) throw e; }

  const msgHandler = (message: any) => { res.write(`data: ${message.data.toString()}\n\n`); message.ack(); };
  sub.on('message', msgHandler);

  // Subscribe to Supabase Realtime for layout changes
  let realtimeChannel: any = null;
  if (isRealtimeConfigured()) {
    console.log(`[SSE] Subscribing to Supabase Realtime for project ${projectId}`);
    try {
      realtimeChannel = subscribeToLayoutChanges(projectId, (payload: LayoutChangePayload) => {
        // Forward Supabase Realtime change to SSE client
        const sseEvent = {
          type: 'LAYOUT_UPDATED',
          timestamp: new Date().toISOString(),
          payload: {
            contextType: payload.contextType,
            contextId: payload.contextId,
            nodes: [{
              idEntity: payload.idEntity,
              nodeType: payload.nodeType,
              valPosX: payload.valPosX,
              valPosY: payload.valPosY,
              valWidth: payload.valWidth,
              valHeight: payload.valHeight,
              jsonUiMetadata: payload.jsonUiMetadata,
              idxVersion: payload.idxVersion,
            }],
          },
        };
        res.write(`data: ${JSON.stringify(sseEvent)}\n\n`);
      });
    } catch (realtimeError) {
      console.error(`[SSE] Failed to subscribe to Supabase Realtime:`, realtimeError);
    }
  }

  req.on('close', async () => {
    sub.removeListener('message', msgHandler);
    await sub.delete();
    if (realtimeChannel) {
      unsubscribeFromLayoutChanges(projectId);
    }
  });
};
router.get(api.events.project(":projectId"), requireAuth, getProjectEvents);

const VideoFilterSchema = z.object({
  startDate: z.coerce.date().optional().transform(v => v ? new Date(v) : undefined),
  endDate: z.coerce.date().optional().transform(v => v ? new Date(v) : undefined),
  limit: z.coerce.number().int().positive().max(100).default(50),
  status: z.string().optional(),
  minDuration: z.coerce.number().optional()
});

const getVideos = async (req: Request, res: Response) => {
  try {
    const filters = VideoFilterSchema.parse(req.query);

    const manager = new AssetVersionManager(projectRepository);
    const videos = await manager.getCompletedProjectVideos({
      ...filters,
      minDuration: filters.minDuration ?? 12
    });

    res.json({
      success: true,
      count: videos.length,
      data: videos
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid parameters", details: error.issues });
    }
    res.status(500).json({ error: "Internal server error." });
  }
};
router.get(api.videos.list(), validateApiKey, getVideos);

const startPipelineProject = async (req: Request, res: Response) => {
  try {
    const { projectId, commandId = uuidv7() } = req.body;
    const { teamId, initialPrompt } = req.body.payload;
    const userId = req.user!.id;

    if (!projectId) return res.status(400).json({ error: "projectId is required." });
    if (!initialPrompt) return res.status(400).json({ error: "initialPrompt is required." });
    if (!teamId) return res.status(400).json({ error: "teamId is required." });
    if (!await isUserMemberOfTeam(userId, teamId)) return res.status(403).json({ error: "You are not a member of this team." });

    const payload = { ...req.body.payload, userId };
    const finalCommandId = await publishCommand({ type: "START_PIPELINE", projectId, payload, commandId });
    res.status(202).json({ message: "Pipeline start command issued.", projectId, commandId: finalCommandId });
  } catch (error) {
    console.error({ error }, `Error processing START_PIPELINE command`);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
router.post(api.projects.start(), requireAuth, startPipelineProject);

const stopPipelineProject = async (
  req: Request<any, any, Extract<PipelineCommand, { type: "STOP_PIPELINE"; }>>,
  res: Response
) => {
  try {
    const { projectId, commandId = uuidv7() } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId is required." });
    const finalCommandId = await publishCommand({ type: "STOP_PIPELINE", projectId, commandId });

    res.status(202).json({ message: "Pipeline stop command issued.", projectId, commandId: finalCommandId });
  } catch (error) {
    console.error({ error }, `Error publishing STOP_PIPELINE command`);
    res.status(500).json({ error: "Failed to issue stop command." });
  }
};
router.post(api.projects.stop(), stopPipelineProject);

const resumePipelineProject = async (
  req: Request<any, any, Extract<PipelineCommand, { type: "RESUME_PIPELINE"; }>>,
  res: Response
) => {
  try {
    const { projectId } = req.params;
    const { commandId = uuidv7(), payload } = req.body;
    const finalCommandId = await publishCommand({
      type: "RESUME_PIPELINE",
      projectId,
      commandId,
      payload,
    });

    res.status(202).json({ message: "Pipeline resume command issued.", projectId, commandId: finalCommandId });
  } catch (error) {
    console.error({ error }, `Error publishing RESUME_PIPELINE command`);
    res.status(500).json({ error: "Failed to issue resume command." });
  }
};
router.post(api.projects.resume(":projectId"), resumePipelineProject);

const regenerateScene = async (
  req: Request<any, any, Extract<PipelineCommand, { type: "REGENERATE_SCENE"; }>>,
  res: Response
) => {
  try {
    const { projectId } = req.params;
    const { payload, commandId = uuidv7() } = req.body;

    if (!payload.sceneId) return res.status(400).json({ error: "sceneId is required." });

    const finalCommandId = await publishCommand({
      type: "REGENERATE_SCENE",
      projectId,
      payload,
      commandId,
    });

    res.status(202).json({ message: "Scene regeneration command issued.", projectId, commandId: finalCommandId });
  } catch (error) {
    console.error({ error }, `Error publishing REGENERATE_SCENE command`);
    res.status(500).json({ error: "Failed to issue regenerate scene command." });
  }
};
router.post(api.projects.regenerateScene(":projectId"), regenerateScene);

const regenerateFrame = async (
  req: Request<any, any, Extract<PipelineCommand, { type: "GENERATE_SCENE_FRAMES"; }>>,
  res: Response
) => {
  try {
    const { projectId } = req.params;
    const { payload, commandId = uuidv7() } = req.body;

    const missingParams = [];
    if (!payload.assetKeys) missingParams.push('assetKeys');

    if (missingParams.length) {
      return res.status(400).json({ error: `Required params are missing: ${missingParams.join(', ')}.` });
    }

    const finalCommandId = await publishCommand({
      type: "GENERATE_SCENE_FRAMES",
      projectId,
      payload,
      commandId,
    });
    res.status(202).json({ message: "Frame regeneration command issued.", projectId, commandId: finalCommandId });
  } catch (error) {
    console.error({ error }, `Error publishing GENERATE_SCENE_FRAMES command`);
    res.status(500).json({ error: "Failed to issue regenerate frame command." });
  }
};
router.post(api.projects.regenerateFrame(":projectId"), regenerateFrame);

const resolveIntervention = async (
  req: Request<any, any, Extract<PipelineCommand, { type: "RESOLVE_INTERVENTION"; }>>,
  res: Response
) => {
  try {
    const { projectId } = req.params;
    const { payload, commandId = uuidv7() } = req.body;

    if (!projectId) return res.status(400).json({ error: "projectId is required." });
    if (!payload.action) return res.status(400).json({ error: "action is required." });

    const finalCommandId = await publishCommand({
      type: "RESOLVE_INTERVENTION",
      projectId,
      payload,
      commandId
    });

    res.status(202).json({ message: "Intervention resolution command issued.", projectId, commandId: finalCommandId });
  } catch (error) {
    console.error({ error }, `Error publishing RESOLVE_INTERVENTION command`);
    res.status(500).json({ error: "Failed to issue resolve intervention command." });
  }
};
router.post(api.projects.resolveIntervention(":projectId"), resolveIntervention);

const requestState = async (
  req: Request<any, any, Extract<PipelineCommand, { type: "REQUEST_FULL_STATE"; }>>,
  res: Response
) => {
  try {
    const { projectId } = req.params;
    const { commandId = uuidv7() } = req.body;
    const finalCommandId = await publishCommand({
      type: "REQUEST_FULL_STATE",
      projectId,
      commandId,
    });

    res.status(202).json({ message: "Full state request command issued.", projectId, commandId: finalCommandId });
  } catch (error) {
    console.error({ error }, `Error publishing REQUEST_FULL_STATE command`);
    res.status(500).json({ error: "Failed to issue request state command." });
  }
};
router.post(api.projects.requestState(":projectId"), requestState);

const getSceneAssets = async (req: Request, res: Response) => {
  try {
    const { projectId, sceneId } = req.params;
    if (!projectId) return res.status(400).json({ error: "projectId is required." });
    if (!sceneId) return res.status(400).json({ error: "sceneId is required." });

    const assets = await new AssetVersionManager(projectRepository).getAllSceneAssets(sceneId);
    res.json(assets);
  } catch (error) {
    console.error({ error }, `Error getting scene assets`);
    res.status(500).json({ error: "Failed to get scene assets." });
  }
};
router.get(api.projects.sceneAssets(":projectId", ":sceneId"), getSceneAssets);

const getProjectAssets = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    if (!projectId) return res.status(400).json({ error: "projectId is required." });

    const assets = await new AssetVersionManager(projectRepository).getAllProjectAssets(projectId);
    res.json(assets);
  } catch (error) {
    console.error({ error }, `Error getting project assets`);
    res.status(500).json({ error: "Failed to get project assets." });
  }
};
router.get(api.projects.assets(":projectId"), getProjectAssets);

const getCharacterAssets = async (req: Request, res: Response) => {
  try {
    const { characterId } = req.params;
    if (!characterId) return res.status(400).json({ error: "characterId is required." });

    const assets = await new AssetVersionManager(projectRepository).getAllCharacterAssets(characterId);
    res.json(assets);
  } catch (error) {
    console.error({ error }, `Error getting character assets`);
    res.status(500).json({ error: "Failed to get character assets." });
  }
};
router.get(api.projects.characterAssets(":projectId", ":characterId"), getCharacterAssets);

const getLocationAssets = async (req: Request, res: Response) => {
  try {
    const { locationId } = req.params;
    if (!locationId) return res.status(400).json({ error: "locationId is required." });

    const assets = await new AssetVersionManager(projectRepository).getAllLocationAssets(locationId);
    res.json(assets);
  } catch (error) {
    console.error({ error }, `Error getting location assets`);
    res.status(500).json({ error: "Failed to get location assets." });
  }
};
router.get(api.projects.locationAssets(":projectId", ":locationId"), getLocationAssets);

const patchEntities = async (req: Request, res: Response) => {
  const { projectId, updates } = req.body as BatchEntityUpdateRequest;
  if (!projectId || !updates) return res.status(400).json({ error: "projectId and updates are required." });

  try {
    const results = await usersAndTeamsDbService.patchEntities(updates);

    await publishPipelineEvent({
      type: "ENTITY_UPDATED",
      projectId,
      payload: results,
      timestamp: new Date().toISOString()
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to patch entities:", error);
    res.status(500).json({ error: "Failed to patch entities." });
  }
};
router.patch(api.entities.patch(), requireAuth, patchEntities);

const createAsset = async (req: Request, res: Response) => {
  try {
    const { projectId, entityId, entityType, assetKey, url } = req.body;
    if (!projectId || !entityId || !entityType || !assetKey || !url) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const manager = new AssetVersionManager(projectRepository);
    const scope = { projectId, [`${entityType}Ids`]: [entityId] };

    await manager.createVersionedAssets(scope, [assetKey], ['image'], [url], []);

    await publishPipelineEvent({
      type: "ENTITY_UPDATED",
      projectId,
      payload: [{
        id: entityId,
        entityType: entityType,
        entity: {},
        assets: await manager.getAssetRegistryForEntity(entityId, entityType as EntityType)
      }],
      timestamp: new Date().toISOString()
    });

    res.status(201).json({ success: true });
  } catch (error: any) {
    console.error("Failed to create asset:", error);
    res.status(500).json({ error: error.message || "Failed to create asset." });
  }
};
router.post(api.assets.list(), requireAuth, createAsset);

const uploadAudio = async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).send("No file uploaded.");

  const { audioPublicUri, audioGcsUri } = await storageManager.uploadAudio(req.file.buffer, {
    fileName: req.file.originalname,
    mimeType: req.file.mimetype
  });
  res.status(200).json({ audioPublicUri, audioGcsUri });
};
router.post(api.assets.uploadAudio(), requireAuth, upload.single("audio"), uploadAudio);

const promoteAssetVersion = async (req: Request, res: Response) => {
  const { entityId } = req.params;
  const { entityType, assetKey, version, projectId } = req.body;

  if (!entityType || !assetKey || version === undefined || !projectId) {
    return res.status(400).json({ error: "entityType, assetKey, version, and projectId are required." });
  }

  try {
    const manager = new AssetVersionManager(projectRepository);
    const scope = { projectId, [`${entityType}Ids`]: [entityId] };
    await manager.setBestVersion(scope as any, [assetKey], [version]);

    await publishPipelineEvent({
      type: "ENTITY_UPDATED",
      projectId,
      payload: [{
        id: entityId,
        entityType,
        entity: {},
        assets: await manager.getAssetRegistryForEntity(entityId, entityType)
      }],
      timestamp: new Date().toISOString()
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to promote asset version:", error);
    res.status(500).json({ error: "Failed to promote asset version." });
  }
};
router.patch(api.assets.patch(":entityId"), requireAuth, promoteAssetVersion);

const uploadImage = async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).send("No file uploaded.");
  const { projectId, name, description, fileType = 'import' } = req.body;
  const prefix = projectId ? `${projectId}/` : '';
  const blob = bucket.file(`${prefix}images/${Date.now()}_${req.file.originalname}`);
  const blobStream = blob.createWriteStream();

  blobStream.on("error", () => res.status(500).json({ error: "Unable to upload image." }));
  blobStream.on("finish", async () => {
    const imagePublicUri = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
    const imageGcsUri = `gs://${bucket.name}/${blob.name}`;

    if (projectId) {
      try {
        const fileId = uuidv7();

        await db.insert(schema.mediaObjects).values({
          data: imageGcsUri,
          refCount: 1,
          status: 'active'
        }).onConflictDoUpdate({
          target: schema.mediaObjects.data,
          set: {
            refCount: sql`${schema.mediaObjects.refCount} + 1`,
            lastReferencedAt: new Date(),
            status: 'active'
          }
        });

        await db.insert(schema.files).values({
          id: fileId,
          projectId,
          name: name || req.file?.originalname || 'Untitled File',
          description: description || null,
          fileType,
          mediaId: imageGcsUri,
          metadata: {
            width: 0,
            height: 0,
            format: req.file?.mimetype || 'image/jpeg',
          },
        });

        const manager = new AssetVersionManager(projectRepository);

        await publishPipelineEvent({
          type: "ENTITY_CREATED",
          projectId,
          payload: {
            entityId: fileId,
            entityType: 'file',
            entity: {
              id: fileId,
              projectId,
              name: name || req.file?.originalname || 'Untitled File',
              description: description || null,
              // fileType,
              // mediaId: imageGcsUri,
            }
          },
          timestamp: new Date().toISOString()
        });

        res.status(200).json({ fileId, imagePublicUri, imageGcsUri });
      } catch (error) {
        console.error("Failed to create file entity:", error);
        res.status(200).json({ imagePublicUri, imageGcsUri });
      }
    } else {
      res.status(200).json({ imagePublicUri, imageGcsUri });
    }
  });
  blobStream.end(req.file.buffer);
};
router.post(api.assets.uploadImage(), requireAuth, upload.single("image"), uploadImage);

const createEntity = async (req: Request, res: Response) => {
  try {
    const { projectId, inserts } = req.body as BatchEntityCreateRequest;
    if (!projectId || !inserts) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const validationErrors: Array<{ index: number; entityType: string; errors: z.ZodError["issues"] }> = [];

    inserts.forEach((insert, index) => {
      try {
        if (insert.entityType === "character") {
          InsertCharacter.parse(insert.data);
        } else if (insert.entityType === "location") {
          InsertLocation.parse(insert.data);
        } else if (insert.entityType === "scene") {
          InsertScene.parse(insert.data);
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          validationErrors.push({
            index,
            entityType: insert.entityType,
            errors: error.issues,
          });
        }
      }
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Validation failed for one or more entities",
        validationErrors,
      });
    }

    const newEntities = await usersAndTeamsDbService.createEntities(projectId, inserts);

    const { entityId, entityType, entity } = newEntities[0];
    await publishPipelineEvent({
      type: "ENTITY_CREATED",
      projectId,
      payload: {
        entityId,
        entityType,
        entity: entity as any
      },
      timestamp: new Date().toISOString()
    });

    res.status(201).json({ entities: newEntities });
  } catch (error: any) {
    console.error("Failed to create entity:", error);
    res.status(500).json({ error: error.message || "Failed to create entity." });
  }
};
router.post(api.entities.list(), requireAuth, createEntity);

const generateEntityFields = async (req: Request, res: Response) => {
  try {
    const { entityType, currentFields, imageGcsUri, mimeType } = req.body as { entityType: EntityType; currentFields: any; imageGcsUri: string; mimeType: string };

    let generatedFields;
    if (entityType === 'character') {
      generatedFields = await generationTools.generateCharacterFields({ ...currentFields, imageGcsUri, mimeType });
    } else if (entityType === 'location') {
      generatedFields = await generationTools.generateLocationFields({ ...currentFields, imageGcsUri, mimeType });
    } else if (entityType === 'scene') {
      generatedFields = await generationTools.generateSceneFields({ ...currentFields, imageGcsUri, mimeType });
    } else {
      return res.status(400).json({ error: "Invalid entity type" });
    }

    res.json(generatedFields);
  } catch (error: any) {
    console.error("Failed to generate fields:", error);
    res.status(500).json({ error: error.message || "Failed to generate fields." });
  }
};
router.post(api.entities.generateFields(), requireAuth, generateEntityFields);

const getWorldEntities = async (req: Request, res: Response) => {
  const { worldId } = req.params;
  try {
    const entities = await worldRepository.getWorldEntities(worldId);
    res.status(200).json(entities);
  } catch (error) {
    console.error(`Failed to fetch entities for world ${worldId}:`, error);
    res.status(500).json({ error: "Failed to fetch world entities." });
  }
};
router.get(api.worlds.entities(":worldId"), requireAuth, getWorldEntities);

const deleteEntity = async (req: Request, res: Response) => {
  const { entityId } = req.params;
  const { entityType } = req.body as { entityType: 'scene' | 'character' | 'location' };

  if (!entityType) {
    return res.status(400).json({ error: "entityType is required" });
  }

  try {
    const result = await usersAndTeamsDbService.deleteEntity(entityId, entityType);
    if (!result.success) {
      return res.status(500).json({ error: result.error || "Failed to delete entity" });
    }
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete entity:", error);
    res.status(500).json({ error: error.message || "Failed to delete entity." });
  }
};
router.delete(api.entities.delete(":entityId"), requireAuth, deleteEntity);
