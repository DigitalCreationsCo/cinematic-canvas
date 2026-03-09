// src/server/routes.ts
import type { Express, Request, Response } from "express";
import { type Server } from "http";
import { PubSub, Subscription } from "@google-cloud/pubsub";
import {
  PIPELINE_COMMANDS_TOPIC_NAME,
  PIPELINE_EVENTS_TOPIC_NAME
} from "../shared/config.js";
import { PipelineCommand } from "../shared/types/pipeline.types.js";
import { v7 as uuidv7 } from "uuid";
import { Bucket } from "@google-cloud/storage";
import multer from "multer";
import { ProjectRepository } from "../shared/services/project-repository.js";
import { WorldRepository } from "../shared/services/world-repository.js";
import { requireAuth } from "./middleware/auth.js";
import * as schema from "../shared/db/schema.js";
import { db } from "../shared/db/index.js";
import { AssetVersionManager } from "../shared/services/asset-version-manager.js";
import { ilike } from "drizzle-orm";
import { z } from "zod";

export const serverId = `server-${uuidv7()}`;

async function isUserMemberOfTeam(userId: string, teamId: string): Promise<boolean> {
  const membership = await db.query.usersToTeams.findFirst({
    where: { userId, teamId }
  });

  return !!membership;
}

const validateApiKey = (req: Request, res: Response, next: Function) => {
  const apiKey = req.headers[ "x-api-key" ];
  const validKey = process.env.INTERNAL_API_KEY;

  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
  }
  next();
};

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  bucket: Bucket,
): Promise<Server> {
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
    const [ exists ] = await commandsTopic.exists();
    if (!exists) {
      await commandsTopic.create();
      console.log(`Created Pub/Sub topic: ${PIPELINE_COMMANDS_TOPIC_NAME}`);
    }
  } catch (error) {
    console.warn(`Error ensuring commands topic exists: ${error.message}. Continuing...`);
  }

  const eventsTopic = pubsub.topic(PIPELINE_EVENTS_TOPIC_NAME);
  try {
    const [ exists ] = await eventsTopic.exists();
    if (!exists) {
      await eventsTopic.create();
      console.log(`Created Pub/Sub topic: ${PIPELINE_EVENTS_TOPIC_NAME}`);
    }
  } catch (error) {
    console.warn(`Error ensuring events topic exists: ${error.message}. Continuing...`);
  }

  async function publishCommand<T extends PipelineCommand[ "type" ]>(
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
    } catch (error) {
      console.error(`Received error while publishing: ${error.message}`);
      throw error;
    }
  }

  // === AUTHENTICATED ROUTES ===

  app.get("/api/teams", requireAuth, async (req: Request, res: Response) => {
    try {
      const [ user ] = await db.query.users.findMany({
        where: { id: req.user!.id },
        with: { teams: true },
      });
      const teams = user.teams;
      res.status(200).json({ teams });
    } catch (error) {
      console.error("Failed to fetch teams:", error);
      res.status(500).json({ error: "Failed to fetch teams." });
    }
  });

  app.post("/api/teams/join-or-create", requireAuth, async (req: Request, res: Response) => {
    const { name } = req.body as { name: string; };
    const { id: userId, email: userEmail } = req.user!;

    if (!name) return res.status(400).json({ error: "Team name is required." });

    try {
      const [ existingTeam ] = await db
        .select()
        .from(schema.teams)
        .where(ilike(schema.teams.name, name))
        .limit(1);

      if (existingTeam) {
        await db.transaction(async (tx) => {
          // Ensure user exists in public users table
          await tx.insert(schema.users).values({ id: userId, email: userEmail! }).onConflictDoNothing();

          if (!await isUserMemberOfTeam(userId, existingTeam.id)) {
            await tx.insert(schema.usersToTeams).values({ teamId: existingTeam.id, userId, role: 'member' });
          }
        });
        return res.status(200).json({ id: existingTeam.id, name: existingTeam.name });
      } else {
        const teamId = uuidv7();
        await db.transaction(async (tx) => {
          await tx.insert(schema.users).values({ id: userId, email: userEmail! }).onConflictDoNothing();
          const [ newTeam ] = await tx.insert(schema.teams).values({ id: teamId, name }).returning();
          await tx.insert(schema.usersToTeams).values({ teamId, userId, role: 'owner' });
        });
        return res.status(201).json({ id: teamId, name });
      }
    } catch (error) {
      console.error("Failed to join or create team:", error);
      return res.status(500).json({ error: "Failed to join or create team." });
    }
  });

  app.get("/api/worlds", requireAuth, async (req, res) => {
    const teamId = req.headers[ "x-team-id" ] as string;
    if (!teamId) return res.status(400).json({ error: "Team ID is required." });
    if (!await isUserMemberOfTeam(req.user!.id, teamId)) return res.status(403).json({ error: "Access denied." });

    try {
      const worlds = await worldRepository.getWorldsForUser(req.user!.id);
      res.status(200).json({ worlds });
    } catch (error) {
      console.error("Failed to fetch worlds:", error);
      res.status(500).json({ error: "Failed to fetch worlds" });
    }
  });

  app.post("/api/worlds", requireAuth, async (req, res) => {
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
  });

  app.get("/api/projects", requireAuth, async (req, res) => {
    const { worldId } = req.query as { worldId: string | undefined; };
    const teamId = req.headers[ "x-team-id" ] as string;
    if (!teamId) return res.status(400).json({ error: "Team ID is required." });
    if (!await isUserMemberOfTeam(req.user!.id, teamId)) return res.status(403).json({ error: "Access denied." });

    try {
      const projects = await projectRepository.getProjectsForUser(req.user!.id, worldId);
      res.status(200).json({ projects });
    } catch (error) {
      console.error("Failed to fetch projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/events/:projectId", requireAuth, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    console.log(`[SSE] Connection requested for projectId: ${projectId}, User: ${req.user?.id}`);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no" // Disable buffering for Nginx if present
    });

    // Send initial heartbeat to flush headers and confirm connection
    res.write(": ok\n\n");

    const subName = `client-${projectId}-${uuidv7()}`;
    const sub = eventsTopic.subscription(subName);

    try {
      await sub.create({
        ackDeadlineSeconds: 60,
        filter: `attributes.projectId = "${projectId}"`,
        expirationPolicy: { ttl: { seconds: 12 * 60 * 60 } }
      });
    } catch (e: any) { if (e.code !== 6) throw e; }

    const msgHandler = (message: any) => { res.write(`data: ${message.data.toString()}\n\n`); message.ack(); };
    sub.on('message', msgHandler);

    req.on('close', async () => { sub.removeListener('message', msgHandler); await sub.delete(); });
  });

  const VideoFilterSchema = z.object({
    startDate: z.coerce.date().optional().transform(v => v ? new Date(v) : undefined),
    endDate: z.coerce.date().optional().transform(v => v ? new Date(v) : undefined),
    limit: z.coerce.number().int().positive().max(100).default(50),
    status: z.string().optional(),
    minDuration: z.coerce.number().optional()
  });

  app.get("/api/videos", validateApiKey, async (req: Request, res: Response) => {
    try {
      const filters = VideoFilterSchema.parse(req.query);

      // Default to 12 if no duration is specified, or pass through the query param
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
  });

  app.post("/api/project/start", requireAuth, async (req, res) => {
    try {
      const { projectId = uuidv7(), commandId = uuidv7() } = req.body;
      const { teamId, initialPrompt } = req.body.payload;
      const userId = req.user!.id;

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
  });

  app.post("/api/project/stop", async (
    req: Request<any, any, Extract<PipelineCommand, { type: "STOP_PIPELINE"; }>>,
    res: Response) => {
    try {
      const { projectId, commandId = uuidv7() } = req.body;
      if (!projectId) return res.status(400).json({ error: "projectId is required." });
      const finalCommandId = await publishCommand({ type: "STOP_PIPELINE", projectId, commandId });

      res.status(202).json({ message: "Pipeline stop command issued.", projectId, commandId: finalCommandId });
    } catch (error) {
      console.error({ error }, `Error publishing STOP_PIPELINE command`);
      res.status(500).json({ error: "Failed to issue stop command." });
    }
  });

  app.post("/api/project/:projectId/resume", async (
    req: Request<any, any, Extract<PipelineCommand, { type: "RESUME_PIPELINE"; }>>,
    res: Response) => {
    try {
      const { projectId } = req.params;
      const {
        commandId = uuidv7(),
        payload,
      } = req.body;
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
  });

  app.post("/api/project/:projectId/regenerate-scene", async (
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
  });

  app.post("/api/project/:projectId/regenerate-frame", async (
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
  });

  app.post("/api/project/:projectId/resolve-intervention", async (
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
  });

  app.post("/api/project/:projectId/request-state", async (
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
  });

  app.get("/api/project/:projectId/scene/:sceneId/assets", async (
    req: Request,
    res: Response
  ) => {
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
  });

  app.get("/api/project/:projectId/assets", async (
    req: Request,
    res: Response
  ) => {
    try {
      const { projectId } = req.params;
      if (!projectId) return res.status(400).json({ error: "projectId is required." });

      const assets = await new AssetVersionManager(projectRepository).getAllProjectAssets(projectId);
      res.json(assets);
    } catch (error) {
      console.error({ error }, `Error getting project assets`);
      res.status(500).json({ error: "Failed to get project assets." });
    }
  });

  app.get("/api/project/:projectId/character/:characterId/assets", async (
    req: Request,
    res: Response
  ) => {
    try {
      const { characterId } = req.params;
      if (!characterId) return res.status(400).json({ error: "characterId is required." });

      const assets = await new AssetVersionManager(projectRepository).getAllCharacterAssets(characterId);
      res.json(assets);
    } catch (error) {
      console.error({ error }, `Error getting character assets`);
      res.status(500).json({ error: "Failed to get character assets." });
    }
  });

  app.get("/api/project/:projectId/location/:locationId/assets", async (
    req: Request,
    res: Response
  ) => {
    try {
      const { locationId } = req.params;
      if (!locationId) return res.status(400).json({ error: "locationId is required." });

      const assets = await new AssetVersionManager(projectRepository).getAllLocationAssets(locationId);
      res.json(assets);
    } catch (error) {
      console.error({ error }, `Error getting location assets`);
      res.status(500).json({ error: "Failed to get location assets." });
    }
  });

  app.post("/api/project/:projectId/scene/:sceneId/asset", async (
    req: Request<any, any, Extract<PipelineCommand, { type: "UPDATE_SCENE_ASSET"; }>>,
    res: Response
  ) => {
    try {
      const { projectId } = req.params;
      const { payload: { scene, assetKey, version }, commandId = uuidv7() } = req.body;

      if (!assetKey) return res.status(400).json({ error: "asset type is required." });

      const finalCommandId = await publishCommand({
        type: "UPDATE_SCENE_ASSET",
        projectId,
        payload: {
          scene,
          assetKey: assetKey,
          version: version
        },
        commandId
      });

      res.status(202).json({ message: "Asset update command issued.", projectId, commandId: finalCommandId });
    } catch (error) {
      console.error({ error }, `Error publishing UPDATE_SCENE_ASSET command`);
      res.status(500).json({ error: "Failed to issue update scene asset command." });
    }
  });

  app.post("/api/upload-audio", requireAuth, upload.single("audio"), async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).send("No file uploaded.");
    const { projectId = uuidv7() } = req.body;
    const blob = bucket.file(`${projectId}/audio/${Date.now()}_${req.file.originalname}`);
    const blobStream = blob.createWriteStream();

    blobStream.on("error", () => res.status(500).json({ error: "Unable to upload audio." }));
    blobStream.on("finish", () => {
      const audioPublicUri = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      const audioGcsUri = `gs://${bucket.name}/${blob.name}`;
      res.status(200).json({ audioPublicUri, audioGcsUri });
    });
    blobStream.end(req.file.buffer);
  });



  return httpServer;
}
