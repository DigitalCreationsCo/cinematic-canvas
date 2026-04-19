// src/server/routes/index.routes.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cinematic Canvas – Index Router
//
// All route handlers receive infrastructure through RouterDependencies.
// No raw PubSub clients are instantiated here; every command and event
// publication is done via the injected IEventBus.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Request, type Response } from "express";
import { Storage } from "@google-cloud/storage";
import multer from "multer";
import { z } from "zod";

import { IEventBus } from "../../shared/messaging/event-bus.types.js";
import { PipelineCommand, PipelineEvent, EntityType } from "../../shared/types/index.js";
import { generateId } from "#shared/utils/id.js";
import { ProjectRepository } from "../../shared/services/project-repository.js";
import { WorldRepository } from "../../shared/services/world-repository.js";
import { AssetVersionManager } from "../../shared/services/asset-version-manager.js";
import { GCPStorageManager } from "../../shared/services/storage-manager.js";
import { usersAndTeamsDbService } from "../../shared/services/usersAndTeamsDbService.js";
import { tagRegistryService } from "../../shared/services/tag-registry.js";
import { db } from "../../shared/db/index.js";
import { eq, sql, and, inArray, desc } from "drizzle-orm";
import * as schema from "../../shared/db/schema.js";
import { TtlCache } from "../ttl-cache.js";
import { JobEvent, ACTIVE_JOB_STATES } from "../../shared/types/job.types.js";
import type { ActiveJobRecord } from "../../shared/services/job-control-plane.js";

import { BatchEntityUpdateRequest, BatchEntityCreateRequest } from "../../shared/types/editable.types.js";
import { InsertCharacter, InsertLocation } from "../../shared/types/entity.types.js";

import { requireAuth, requireTeam } from "../middleware/auth.js";
import canvasRouter from "./canvas.routes.js";
import mentionRouter from "./mention.routes.js";
import { api } from "./api-routes.js";
import {
  subscribeToLayoutChanges,
  unsubscribeFromLayoutChanges,
  isRealtimeConfigured,
  type LayoutChangePayload,
} from "../services/supabaseRealtime.js";
import { mapDomainCharacterToInsertCharacter } from "#shared/entity/character-mappers.js";
import { mapDomainLocationToInsertLocation } from "#shared/entity/location-mappers.js";
import { mapDomainSceneToInsertScene } from "#shared/entity/scene-mappers.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RouterDependencies {
  eventBus: IEventBus;
}

export const serverId = generateId();
// ─── Factory ──────────────────────────────────────────────────────────────────

export function createIndexRouter(deps: RouterDependencies): Router {

  const { eventBus } = deps;

  // ── Shared infrastructure ────────────────────────────────────────────────

  const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT ?? "omo-dev";
  const bucketName = (process.env.GOOGLE_CLOUD_BUCKET ?? "test-bucket") as string;

  const storageClientGcp = new Storage({ projectId: gcpProjectId });
  const bucket = storageClientGcp.bucket(bucketName);

  const storageManager = new GCPStorageManager(gcpProjectId, bucketName);
  const projectRepository = new ProjectRepository();
  const worldRepository = new WorldRepository();

  const JOBS_CACHE_TTL_MS = 15_000; // 15 s
  const jobsCache = new TtlCache<ActiveJobRecord[]>();

  const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  // ── Publish helpers (always use injected eventBus – never raw PubSub) ───

  async function publishCommandViaEventBus<T extends PipelineCommand["type"]>(
    commandPartial: Omit<Extract<PipelineCommand, { type: T }>, "timestamp"> & {
      type: T;
      commandId: string;
    }
  ): Promise<string> {
    const paramsCommandWithTimestamp = {
      ...commandPartial,
      ...("payload" in commandPartial ? { payload: commandPartial.payload } : {}),
      timestamp: new Date().toISOString(),
      commandId: commandPartial.commandId || generateId(),
    } as PipelineCommand;

    console.log(
      { command: paramsCommandWithTimestamp },
      `[Router] Publishing '${commandPartial.type}' command.`
    );
    return eventBus.publishCommand(paramsCommandWithTimestamp);
  }

  async function publishPipelineEventViaEventBus(
    eventPayload: PipelineEvent
  ): Promise<string> {
    console.debug(
      { eventType: eventPayload.type, projectId: eventPayload.projectId },
      "[Router] Publishing pipeline event."
    );
    return eventBus.publishPipelineEvent(eventPayload);
  }

  // ── Internal API key guard ───────────────────────────────────────────────

  const validateApiKey = (req: Request, res: Response, next: Function) => {
    const apiKeyFromHeader = req.headers["x-api-key"];
    const validApiKey = process.env.INTERNAL_API_KEY;
    if (!apiKeyFromHeader || apiKeyFromHeader !== validApiKey) {
      return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
    }
    next();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Router
  // ─────────────────────────────────────────────────────────────────────────

  const router = Router();

  // ── Teams ────────────────────────────────────────────────────────────────

  const getTeams = async (req: Request, res: Response) => {
    try {
      const teams = await usersAndTeamsDbService.getTeams(req.user!.id);
      res.status(200).json({ teams });
    } catch (errGetTeams) {
      console.error("[Router] Failed to fetch teams:", errGetTeams);
      res.status(500).json({ error: "Failed to fetch teams." });
    }
  };
  router.get(api.teams(), requireAuth, getTeams);

  const joinOrCreateTeam = async (req: Request, res: Response) => {
    const { name } = req.body as { name: string };
    const { id: userId, email: userEmail } = req.user!;
    if (!name) return res.status(400).json({ error: "Team name is required." });

    try {
      const resultJoinOrCreate = await usersAndTeamsDbService.joinOrCreateTeam(
        userId,
        userEmail!,
        name
      );
      const statusCodeTeam = resultJoinOrCreate.created ? 201 : 200;
      return res
        .status(statusCodeTeam)
        .json({ id: resultJoinOrCreate.id, name: resultJoinOrCreate.name });
    } catch (errJoinOrCreate) {
      console.error("[Router] Failed to join/create team:", errJoinOrCreate);
      return res.status(500).json({ error: "Failed to join or create team." });
    }
  };
  router.post(api.teams.joinOrCreate(), requireAuth, joinOrCreateTeam);

  // ── Worlds ───────────────────────────────────────────────────────────────

  const getWorlds = async (req: Request, res: Response) => {
    try {
      const worlds = await worldRepository.getWorldsForUser(req.user!.id);
      res.status(200).json({ worlds });
    } catch (errGetWorlds) {
      console.error("[Router] Failed to fetch worlds:", errGetWorlds);
      res.status(500).json({ error: "Failed to fetch worlds." });
    }
  };
  router.get(api.worlds.list(), requireAuth, requireTeam, getWorlds);

  const createWorld = async (req: Request, res: Response) => {
    const { name, description } = req.body;
    const userId = req.user!.id;
    const teamId = req.headers["x-team-id"] as string;
    if (!name) return res.status(400).json({ error: "Name is required." });

    try {
      const world = await worldRepository.createWorld({
        name,
        description,
        teamId,
        userId,
      });
      res.status(201).json(world);
    } catch (errCreateWorld) {
      console.error("[Router] Failed to create world:", errCreateWorld);
      res.status(500).json({ error: "Failed to create world." });
    }
  };
  router.post(api.worlds.list(), requireAuth, requireTeam, createWorld);

  // GET /worlds/:worldId/entities
  const getWorldEntities = async (req: Request, res: Response) => {
    const { worldId } = req.params;
    try {
      const entitiesForWorld = await worldRepository.getWorldEntities(worldId);
      res.status(200).json(entitiesForWorld);
    } catch (errGetWorldEntities) {
      console.error(
        `[Router] Failed to fetch entities for world ${worldId}:`,
        errGetWorldEntities
      );
      res.status(500).json({ error: "Failed to fetch world entities." });
    }
  };
  router.get(api.worlds.entities(":worldId"), requireAuth, requireTeam, getWorldEntities);

  // ── Projects ─────────────────────────────────────────────────────────────

  const getProjects = async (req: Request, res: Response) => {
    const { worldId } = req.query as { worldId?: string };
    try {
      const projects = await projectRepository.getProjectsForUser(
        req.user!.id,
        worldId
      );
      res.status(200).json({ projects });
    } catch (errGetProjects) {
      console.error("[Router] Failed to fetch projects:", errGetProjects);
      res.status(500).json({ error: "Failed to fetch projects." });
    }
  };
  router.get(api.projects.list(), requireAuth, requireTeam, getProjects);

  const createProject = async (req: Request, res: Response) => {
    try {
      const projectId = generateId();
      const initialProject = await projectRepository.buildInitialProject(
        projectId,
        { ...req.body, projectId }
      );
      const project = await projectRepository.createProject(initialProject);
      res.status(201).json(project);
    } catch (errCreateProject) {
      console.error("[Router] Failed to create project:", errCreateProject);
      res.status(500).json({ error: "Failed to create project." });
    }
  };
  router.post(api.projects.list(), requireAuth, requireTeam, createProject);

  // ── Pipeline command endpoints ────────────────────────────────────────────

  const startPipeline = async (req: Request, res: Response) => {
    try {
      const { projectId, commandId = generateId() } = req.body;
      const { initialPrompt } = req.body.payload;
      const userId = req.user!.id;
      const teamId = req.headers["x-team-id"] as string;
      const worldId = req.headers["x-world-id"] as string;

      if (!projectId)
        return res.status(400).json({ error: "projectId is required." });
      if (!initialPrompt)
        return res.status(400).json({ error: "initialPrompt is required." });

      const payloadParamsStartPipeline = { ...req.body.payload, userId };
      const finalCommandIdStart = await publishCommandViaEventBus({
        type: "START_PIPELINE",
        projectId,
        worldId,
        teamId,
        userId,
        payload: payloadParamsStartPipeline,
        commandId,
      });

      res.status(202).json({
        message: "Pipeline start command issued.",
        projectId,
        commandId: finalCommandIdStart,
      });
    } catch (errStartPipeline) {
      console.error({ error: errStartPipeline }, "[Router] Error publishing START_PIPELINE.");
      res.status(500).json({ error: "Internal Server Error." });
    }
  };
  router.post(api.projects.start(), requireAuth, requireTeam, startPipeline);

  // POST /project/:projectId/stop → publishes CANCEL_WORKFLOW / STOP_PIPELINE
  const stopPipeline = async (
    req: Request<{ projectId: string }>,
    res: Response
  ) => {
    try {
      const projectId = req.params.projectId ?? req.body.projectId;
      const commandId = req.body.commandId ?? generateId();
      const userId = req.user!.id;
      const teamId = req.headers["x-team-id"] as string;
      const worldId = req.headers["x-world-id"] as string;

      if (!projectId)
        return res.status(400).json({ error: "projectId is required." });

      const finalCommandIdStop = await publishCommandViaEventBus({
        type: "STOP_PIPELINE",
        projectId,
        teamId,
        userId,
        worldId,
        commandId,
      });

      res.status(202).json({
        message: "Pipeline stop command issued.",
        projectId,
        commandId: finalCommandIdStop,
      });
    } catch (errStopPipeline) {
      console.error({ error: errStopPipeline }, "[Router] Error publishing STOP_PIPELINE.");
      res.status(500).json({ error: "Failed to issue stop command." });
    }
  };
  router.post(api.projects.stop(), requireAuth, requireTeam, stopPipeline);

  const resumePipeline = async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { commandId = generateId(), payload } = req.body;
      const userId = req.user!.id;
      const teamId = req.headers["x-team-id"] as string;
      const worldId = req.headers["x-world-id"] as string;

      if (!projectId)
        return res.status(400).json({ error: "projectId is required." });

      const finalCommandIdResume = await publishCommandViaEventBus({
        type: "RESUME_PIPELINE",
        projectId,
        teamId,
        userId,
        worldId,
        commandId,
        payload,
      });

      res.status(202).json({
        message: "Pipeline resume command issued.",
        projectId,
        commandId: finalCommandIdResume,
      });
    } catch (errResumePipeline) {
      console.error({ error: errResumePipeline }, "[Router] Error publishing RESUME_PIPELINE.");
      res.status(500).json({ error: "Failed to issue resume command." });
    }
  };
  router.post(api.projects.resume(":projectId"), requireAuth, requireTeam, resumePipeline);

  const requestFullState = async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { commandId = generateId() } = req.body;
      const userId = req.user!.id;
      const teamId = req.headers["x-team-id"] as string;
      const worldId = req.headers["x-world-id"] as string;

      if (!projectId)
        return res.status(400).json({ error: "projectId is required." });

      const finalCommandIdState = await publishCommandViaEventBus({
        type: "REQUEST_FULL_STATE",
        projectId,
        worldId,
        teamId,
        userId,
        commandId,
      });

      res.status(202).json({
        message: "Full state request command issued.",
        projectId,
        commandId: finalCommandIdState,
      });
    } catch (errRequestState) {
      console.error({ error: errRequestState }, "[Router] Error publishing REQUEST_FULL_STATE.");
      res.status(500).json({ error: "Failed to issue request state command." });
    }
  };
  router.post(api.projects.requestState(":projectId"), requireAuth, requireTeam, requestFullState);

  // GET /project/:projectId/jobs
  // Returns all non-terminal (PENDING | RUNNING) jobs for the project.
  // This endpoint is called once when the SSE connection opens, to hydrate
  // the client's useJobStore.  Subsequent updates arrive via SSE.
  const getProjectJobs = async (req: Request, res: Response) => {
    const { projectId } = req.params;

    try {
      // ── Cache hit ──────────────────────────────────────────────────────────
      const cached = jobsCache.get(projectId);
      if (cached) {
        return res.json({ jobs: cached });
      }

      // ── DB query ───────────────────────────────────────────────────────────
      const activeJobs = await db
        .select({
          id: schema.jobs.id,
          type: schema.jobs.type,
          state: schema.jobs.state,
          projectId: schema.jobs.projectId,
          userId: schema.jobs.userId,
          teamId: schema.jobs.teamId,
          workflowId: schema.jobs.workflowId,
          error: schema.jobs.error,
          createdAt: schema.jobs.createdAt,
          updatedAt: schema.jobs.updatedAt,
        })
        .from(schema.jobs)
        .where(
          and(
            eq(schema.jobs.projectId, projectId),
            inArray(schema.jobs.state, ACTIVE_JOB_STATES)
          )
        )
        .orderBy(desc(schema.jobs.createdAt));

      jobsCache.set(projectId, activeJobs as ActiveJobRecord[], JOBS_CACHE_TTL_MS);

      return res.json({ jobs: activeJobs });
    } catch (errGetJobs) {
      console.error({ error: errGetJobs, projectId }, "[Router] Failed to list active jobs.");
      return res.status(500).json({ error: "Failed to list active jobs." });
    }
  };
  router.get(api.jobs.list(":projectId"), requireAuth, requireTeam, getProjectJobs);

  // DELETE /project/:projectId/jobs/:jobId
  // Attempts to cancel a PENDING job. RUNNING jobs are rejected with 409.
  //
  // The operation is atomic: a conditional UPDATE (WHERE state = 'PENDING')
  // ensures correctness under concurrent claim races without an extra read
  // in the happy path.  A follow-up read fires only when the update misses,
  // to produce a precise error reason.
  const cancelJob = async (req: Request, res: Response) => {
    const { projectId, jobId } = req.params;
    const userId = req.user!.id;
    const teamId = req.headers["x-team-id"] as string;

    if (!projectId) return res.status(400).json({ error: "projectId is required." });
    if (!jobId) return res.status(400).json({ error: "jobId is required." });

    try {
      // ── Atomic conditional cancel ──────────────────────────────────────────
      const [cancelled] = await db
        .update(schema.jobs)
        .set({ state: "CANCELLED", updatedAt: new Date() })
        .where(
          and(
            eq(schema.jobs.id, jobId),
            eq(schema.jobs.projectId, projectId),
            eq(schema.jobs.state, "PENDING")
          )
        )
        .returning();

      if (cancelled) {
        // Publish event — SSE clients (including the actor's own tab) update
        // their stores reactively on receipt.
        await eventBus.publishJobEvent({
          type: "JOB_CANCELLED",
          projectId,
          userId,
          teamId,
          metadata: {
            jobType: cancelled.type,
            jobId: cancelled.id,
            workflowId: cancelled.workflowId ?? undefined,
          },
        });

        // Invalidate cache so the next hydration GET reflects the cancellation.
        jobsCache.invalidate(projectId);

        return res.status(200).json({ success: true });
      }

      // ── Update missed — determine precise reason ───────────────────────────
      const [existing] = await db
        .select({ state: schema.jobs.state })
        .from(schema.jobs)
        .where(
          and(
            eq(schema.jobs.id, jobId),
            eq(schema.jobs.projectId, projectId)
          )
        )
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Job not found." });
      }
      if (existing.state === "RUNNING") {
        return res.status(409).json({
          error: "Cannot cancel a job that is already running. Only PENDING jobs can be cancelled.",
          reason: "RUNNING",
        });
      }
      // COMPLETED, FAILED, FATAL, CANCELLED
      return res.status(409).json({
        error: "Job is already in a terminal state.",
        reason: "ALREADY_TERMINAL",
        state: existing.state,
      });

    } catch (errCancelJob) {
      console.error({ error: errCancelJob, jobId, projectId }, "[Router] Failed to cancel job.");
      return res.status(500).json({ error: "Failed to cancel job." });
    }
  };
  router.delete(api.jobs.cancel(":projectId", ":jobId"), requireAuth, requireTeam, cancelJob);

  const resolveIntervention = async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { payload, commandId = generateId() } = req.body;
      const userId = req.user!.id;
      const teamId = req.headers["x-team-id"] as string;
      const worldId = req.headers["x-world-id"] as string;

      if (!projectId)
        return res.status(400).json({ error: "projectId is required." });
      if (!payload?.action)
        return res.status(400).json({ error: "action is required." });

      const finalCommandIdIntervention = await publishCommandViaEventBus({
        type: "RESOLVE_INTERVENTION",
        projectId,
        worldId,
        teamId,
        userId,
        payload,
        commandId,
      });

      res.status(202).json({
        message: "Intervention resolution command issued.",
        projectId,
        commandId: finalCommandIdIntervention,
      });
    } catch (errIntervention) {
      console.error({ error: errIntervention }, "[Router] Error publishing RESOLVE_INTERVENTION.");
      res.status(500).json({ error: "Failed to issue resolve intervention command." });
    }
  };
  router.post(
    api.projects.resolveIntervention(":projectId"),
    requireAuth,
    requireTeam,
    resolveIntervention
  );

  const regenerateScene = async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { payload, commandId = generateId() } = req.body;
      const userId = req.user!.id;
      const teamId = req.headers["x-team-id"] as string;
      const worldId = req.headers["x-world-id"] as string;

      const missingParamsRegenerateScene: string[] = [];
      if (!payload?.sceneId) missingParamsRegenerateScene.push("sceneId");
      if (!projectId) missingParamsRegenerateScene.push("projectId");

      if (missingParamsRegenerateScene.length) {
        return res.status(400).json({
          error: `Required params missing: ${missingParamsRegenerateScene.join(", ")}.`,
        });
      }

      const finalCommandIdRegenerateScene = await publishCommandViaEventBus({
        type: "GENERATE_SCENE_VIDEO",
        projectId,
        worldId,
        teamId,
        userId,
        payload,
        commandId,
      });

      res.status(202).json({
        message: "Scene regeneration command issued.",
        projectId,
        commandId: finalCommandIdRegenerateScene,
      });
    } catch (errRegenerateScene) {
      console.error({ error: errRegenerateScene }, "[Router] Error publishing GENERATE_SCENE_VIDEO.");
      res.status(500).json({ error: "Failed to issue regenerate scene command." });
    }
  };
  router.post(
    api.projects.regenerateScene(":projectId"),
    requireAuth,
    requireTeam,
    regenerateScene
  );

  const regenerateFrame = async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { payload, commandId = generateId() } = req.body;
      const userId = req.user!.id;
      const teamId = req.headers["x-team-id"] as string;
      const worldId = req.headers["x-world-id"] as string;

      const missingParamsFrame: string[] = [];
      if (!payload?.assetKeys) missingParamsFrame.push("assetKeys");
      if (!projectId) missingParamsFrame.push("projectId");

      if (missingParamsFrame.length) {
        return res.status(400).json({
          error: `Required params missing: ${missingParamsFrame.join(", ")}.`,
        });
      }

      const finalCommandIdFrame = await publishCommandViaEventBus({
        type: "GENERATE_SCENE_FRAMES",
        projectId,
        worldId,
        teamId,
        userId,
        payload,
        commandId,
      });

      res.status(202).json({
        message: "Frame regeneration command issued.",
        projectId,
        commandId: finalCommandIdFrame,
      });
    } catch (errRegenerateFrame) {
      console.error({ error: errRegenerateFrame }, "[Router] Error publishing GENERATE_SCENE_FRAMES.");
      res.status(500).json({ error: "Failed to issue regenerate frame command." });
    }
  };
  router.post(
    api.projects.regenerateFrame(":projectId"),
    requireAuth,
    requireTeam,
    regenerateFrame
  );

  // POST /entities/scene-with-autofill → publishes GENERATE_SCENE_CONTENT / CREATE_SCENE_WITH_ENTITIES
  const createSceneWithAutoFill = async (req: Request, res: Response) => {
    try {
      const {
        projectId,
        sceneFields,
        sceneImageGcsUri,
        sceneImageMimeType,
        startFrameGcsUri,
        startFrameMimeType,
        endFrameGcsUri,
        endFrameMimeType,
      } = req.body as {
        projectId: string;
        sceneFields: Record<string, unknown>;
        sceneImageGcsUri?: string;
        sceneImageMimeType?: string;
        startFrameGcsUri?: string;
        startFrameMimeType?: string;
        endFrameGcsUri?: string;
        endFrameMimeType?: string;
      };

      if (!projectId)
        return res.status(400).json({ error: "projectId is required." });

      const userId = req.user!.id;
      const worldId = req.headers["x-world-id"] as string;
      const teamId = req.headers["x-team-id"] as string;

      await publishCommandViaEventBus({
        type: "CREATE_SCENE_WITH_ENTITIES",
        projectId,
        worldId,
        teamId,
        userId,
        commandId: generateId(),
        payload: {
          userId,
          sceneFields,
          sceneImageGcsUri,
          sceneImageMimeType,
          startFrameGcsUri,
          startFrameMimeType,
          endFrameGcsUri,
          endFrameMimeType,
        },
      });

      return res.status(202).json({
        message: "Scene creation queued.",
        projectId,
      });
    } catch (errCreateScene) {
      console.error("[Router] Failed to queue scene creation:", errCreateScene);
      return res.status(500).json({
        error: (errCreateScene as any)?.message || "Failed to queue scene creation.",
      });
    }
  };
  router.post(
    api.entities.createSceneWithAutoFill(),
    requireAuth,
    requireTeam,
    createSceneWithAutoFill
  );

  // POST /projects/:projectId/generate-composites
  const generateComposites = async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { imageId, inputImages, prompt, negativePrompt, numberOfOutputs } =
        req.body;
      const userId = req.user!.id;
      const worldId = req.headers["x-world-id"] as string;
      const teamId = req.headers["x-team-id"] as string;

      if (!projectId) return res.status(400).json({ error: "projectId is required." });
      if (!imageId) return res.status(400).json({ error: "imageId is required." });
      if (!inputImages?.length)
        return res.status(400).json({ error: "inputImages are required." });
      if (!prompt) return res.status(400).json({ error: "prompt is required." });

      const commandIdComposites = generateId();
      const finalCommandIdComposites = await publishCommandViaEventBus({
        type: "GENERATE_COMPOSITES",
        projectId,
        worldId,
        teamId,
        userId,
        commandId: commandIdComposites,
        payload: {
          imageId,
          inputImages,
          prompt,
          negativePrompt,
          numberOfOutputs: numberOfOutputs ?? 1,
        },
      });

      res.status(202).json({
        message: "Composite generation queued.",
        projectId,
        imageId,
        commandId: finalCommandIdComposites,
      });
    } catch (errComposites) {
      console.error({ error: errComposites }, "[Router] Error publishing GENERATE_COMPOSITES.");
      res.status(500).json({ error: "Failed to queue composite generation." });
    }
  };
  router.post(
    api.projects.generateComposites(":projectId"),
    requireAuth,
    requireTeam,
    generateComposites
  );

  // ── SSE – Project event stream ────────────────────────────────────────────
  //
  // Subscribes to pipeline events for a specific project. In distributed
  // (PubSub) mode the eventBus creates a per-client ephemeral subscription
  // with a server-side filter. In monolith mode all events are received and
  // filtered in-process by projectId.

  const getProjectEvents = async (req: Request, res: Response) => {
    const { projectId } = req.params;

    const userId = req.user?.id ?? "anonymous";

    console.log(`[SSE] Connection opened for project ${projectId}, user ${userId}.`);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.write(": ok\n\n");

    // Unique subscription name so multiple clients for the same project
    // each get their own delivery channel.
    const sessionId = generateId();
    const sseSubscriptionName = `sse-${projectId}-${sessionId}`;

    let isConnectionClosed = false;

    const pipelineEventHandler = async (pipelineEventPayload: PipelineEvent): Promise<void> => {
      if (isConnectionClosed) return;
      // In-process filter (InMemory mode receives all events)
      if (pipelineEventPayload.projectId !== projectId) return;
      res.write(`data: ${JSON.stringify(pipelineEventPayload)}\n\n`);
    };

    // Subscribe – temporary flag marks the PubSub subscription for
    // deletion on close so ephemeral subscriptions don't accumulate.
    await eventBus.subscribeToPipelineEvents(
      sseSubscriptionName,
      pipelineEventHandler,
      {
        temporary: true,
        ackDeadlineSeconds: 60,
        filter: `attributes.projectId = "${projectId}"`,
        expirationPolicy: { ttl: { seconds: 12 * 60 * 60 } }
      }
    );

    // per-session job event subscription ───────────────────────────────
    //
    // Each SSE session gets its own ephemeral subscription to the job-events
    // topic, filtered by both projectId and userId.
    //
    // PubSub mode: the broker-level filter prevents fan-out — only events for
    //   this exact user+project reach this subscription.
    // InMemory mode: the filter option is ignored; the in-process guard inside
    //   jobEventHandler handles routing (all events received, wrong ones dropped).
    const jobSseSubscriptionName = `sse-jobs-${projectId}-${userId}-${sessionId}`;
    const jobEventHandler = async (jobEventPayload: JobEvent): Promise<void> => {
      if (isConnectionClosed) return;
      // In-process guard — essential for InMemoryEventBus (monolith / dev mode)
      // which broadcasts all job events to every listener.
      if (jobEventPayload.projectId !== projectId) return;
      if (jobEventPayload.userId !== userId) return;

      res.write(`data: ${JSON.stringify(jobEventPayload)}\n\n`);
    };

    await eventBus.subscribeToJobEvents(
      jobSseSubscriptionName,
      jobEventHandler,
      {
        temporary: true,
        ackDeadlineSeconds: 60,
        // Broker-level filter: only job events for this project+user reach
        // this subscription. Requires userId to be published as a message
        // attribute — see pubsub-event-bus.ts publishJobEvent().
        filter: `attributes.projectId = "${projectId}" AND attributes.userId = "${userId}"`,
        expirationPolicy: { ttl: { seconds: 12 * 60 * 60 } },
      }
    );

    // Supabase Realtime for layout changes (optional)
    let realtimeChannel: any = null;
    if (isRealtimeConfigured()) {
      try {
        realtimeChannel = subscribeToLayoutChanges(
          projectId,
          (layoutPayload: LayoutChangePayload) => {
            if (isConnectionClosed) return;
            const paramsLayoutSseEvent = {
              type: "LAYOUT_UPDATED",
              timestamp: new Date().toISOString(),
              payload: {
                contextType: layoutPayload.contextType,
                contextId: layoutPayload.contextId,
                nodes: [
                  {
                    idEntity: layoutPayload.idEntity,
                    nodeType: layoutPayload.nodeType,
                    valPosX: layoutPayload.valPosX,
                    valPosY: layoutPayload.valPosY,
                    valWidth: layoutPayload.valWidth,
                    valHeight: layoutPayload.valHeight,
                    jsonUiMetadata: layoutPayload.jsonUiMetadata,
                    idxVersion: layoutPayload.idxVersion,
                  },
                ],
              },
            };
            res.write(`data: ${JSON.stringify(paramsLayoutSseEvent)}\n\n`);
          }
        );
        console.debug(
          `[SSE] Supabase Realtime subscribed for project ${projectId}.`
        );
      } catch (errRealtime) {
        console.error("[SSE] Failed to subscribe to Supabase Realtime:", errRealtime);
      }
    }

    res.flushHeaders();

    req.on("close", async () => {
      eventBus.unsubscribe(sseSubscriptionName, pipelineEventHandler);
      eventBus.unsubscribe(jobSseSubscriptionName, jobEventHandler);
      if (realtimeChannel) {
        unsubscribeFromLayoutChanges(projectId);
      }
      isConnectionClosed = true;
      console.log(`[SSE] Connection closed for project ${projectId}. Cleaning up.`);
    });

  };
  router.get(
    api.events.project(":projectId"),
    requireAuth,
    requireTeam,
    getProjectEvents
  );

  // ── Asset management ──────────────────────────────────────────────────────

  const VideoFilterSchema = z.object({
    startDate: z
      .coerce.date()
      .optional()
      .transform((v) => (v ? new Date(v) : undefined)),
    endDate: z
      .coerce.date()
      .optional()
      .transform((v) => (v ? new Date(v) : undefined)),
    limit: z.coerce.number().int().positive().max(100).default(50),
    status: z.string().optional(),
    minDuration: z.coerce.number().optional(),
  });

  const getVideos = async (req: Request, res: Response) => {
    try {
      const paramsVideoFilters = VideoFilterSchema.parse(req.query);
      const assetVersionManagerForVideos = new AssetVersionManager(
        projectRepository
      );
      const videosResult = await assetVersionManagerForVideos.getCompletedProjectVideos(
        { ...paramsVideoFilters, minDuration: paramsVideoFilters.minDuration ?? 12 }
      );
      res.json({ success: true, count: videosResult.length, data: videosResult });
    } catch (errGetVideos) {
      if (errGetVideos instanceof z.ZodError) {
        return res.status(400).json({
          error: "Invalid parameters",
          details: errGetVideos.issues,
        });
      }
      res.status(500).json({ error: "Internal server error." });
    }
  };
  router.get(api.videos.list(), validateApiKey, getVideos);

  const getSceneAssets = async (req: Request, res: Response) => {
    try {
      const { projectId, sceneId } = req.params;
      if (!projectId)
        return res.status(400).json({ error: "projectId is required." });
      if (!sceneId)
        return res.status(400).json({ error: "sceneId is required." });

      const assetsForScene = await new AssetVersionManager(
        projectRepository
      ).getAllSceneAssets(sceneId);
      res.json(assetsForScene);
    } catch (errSceneAssets) {
      console.error({ error: errSceneAssets }, "[Router] Error getting scene assets.");
      res.status(500).json({ error: "Failed to get scene assets." });
    }
  };
  router.get(
    api.projects.sceneAssets(":projectId", ":sceneId"),
    requireAuth,
    requireTeam,
    getSceneAssets
  );

  const getProjectAssets = async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      if (!projectId)
        return res.status(400).json({ error: "projectId is required." });

      const assetsForProject = await new AssetVersionManager(
        projectRepository
      ).getAllProjectAssets(projectId);
      res.json(assetsForProject);
    } catch (errProjectAssets) {
      console.error({ error: errProjectAssets }, "[Router] Error getting project assets.");
      res.status(500).json({ error: "Failed to get project assets." });
    }
  };
  router.get(
    api.projects.assets(":projectId"),
    requireAuth,
    requireTeam,
    getProjectAssets
  );

  const getCharacterAssets = async (req: Request, res: Response) => {
    try {
      const { characterId } = req.params;
      if (!characterId)
        return res.status(400).json({ error: "characterId is required." });

      const assetsForCharacter = await new AssetVersionManager(
        projectRepository
      ).getAllCharacterAssets(characterId);
      res.json(assetsForCharacter);
    } catch (errCharacterAssets) {
      console.error({ error: errCharacterAssets }, "[Router] Error getting character assets.");
      res.status(500).json({ error: "Failed to get character assets." });
    }
  };
  router.get(
    api.projects.characterAssets(":projectId", ":characterId"),
    requireAuth,
    requireTeam,
    getCharacterAssets
  );

  const getLocationAssets = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      if (!locationId)
        return res.status(400).json({ error: "locationId is required." });

      const assetsForLocation = await new AssetVersionManager(
        projectRepository
      ).getAllLocationAssets(locationId);
      res.json(assetsForLocation);
    } catch (errLocationAssets) {
      console.error({ error: errLocationAssets }, "[Router] Error getting location assets.");
      res.status(500).json({ error: "Failed to get location assets." });
    }
  };
  router.get(
    api.projects.locationAssets(":projectId", ":locationId"),
    requireAuth,
    requireTeam,
    getLocationAssets
  );

  const patchEntities = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { projectId, updates } = req.body as BatchEntityUpdateRequest;
    const teamId = req.headers["x-team-id"] as string;
    const worldId = req.headers["x-world-id"] as string;

    if (!projectId || !updates)
      return res
        .status(400)
        .json({ error: "projectId and updates are required." });

    try {
      const patchResultEntities = await usersAndTeamsDbService.patchEntities(
        updates
      );

      await publishPipelineEventViaEventBus({
        type: "ENTITY_UPDATED",
        projectId,
        worldId,
        teamId,
        userId,
        payload: patchResultEntities,
        timestamp: new Date().toISOString(),
      });

      res.status(200).json({ success: true });
    } catch (errPatchEntities) {
      console.error("[Router] Failed to patch entities:", errPatchEntities);
      res.status(500).json({ error: "Failed to patch entities." });
    }
  };
  router.patch(api.entities.patch(), requireAuth, requireTeam, patchEntities);

  const createAsset = async (req: Request, res: Response) => {
    try {
      const { projectId, entityId, entityType, assetKey, url } = req.body;
      if (!projectId || !entityId || !entityType || !assetKey || !url) {
        return res.status(400).json({ error: "Missing required fields." });
      }

      const userId = req.user!.id;
      const teamId = req.headers["x-team-id"] as string;
      const worldId = req.headers["x-world-id"] as string;

      const assetVersionManagerCreate = new AssetVersionManager(
        projectRepository
      );
      const scopeForCreateAsset = {
        projectId,
        [`${entityType}Ids`]: [entityId],
      };
      await assetVersionManagerCreate.createVersionedAssets(
        scopeForCreateAsset,
        [assetKey],
        ["image"],
        [url],
        []
      );

      await publishPipelineEventViaEventBus({
        type: "ENTITY_UPDATED",
        projectId,
        teamId,
        worldId,
        userId,
        payload: [
          {
            id: entityId,
            entityType,
            entity: {},
            assets: await assetVersionManagerCreate.getAssetRegistryForEntity(
              entityId,
              entityType as EntityType
            ),
          },
        ],
        timestamp: new Date().toISOString(),
      });

      res.status(201).json({ success: true });
    } catch (errCreateAsset) {
      console.error("[Router] Failed to create asset:", errCreateAsset);
      res.status(500).json({
        error:
          (errCreateAsset as any)?.message || "Failed to create asset.",
      });
    }
  };
  router.post(api.assets.list(), requireAuth, requireTeam, createAsset);

  const uploadAudio = async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).send("No file uploaded.");

    const { audioPublicUri, audioGcsUri } = await storageManager.uploadAudio(
      req.file.buffer,
      { fileName: req.file.originalname, mimeType: req.file.mimetype }
    );
    res.status(200).json({ audioPublicUri, audioGcsUri });
  };
  router.post(
    api.assets.uploadAudio(),
    requireAuth,
    uploadMiddleware.single("audio"),
    uploadAudio
  );

  const promoteAssetVersion = async (req: Request, res: Response) => {
    const { entityId } = req.params;
    const { entityType, assetKey, version, projectId } = req.body;

    if (!entityType || !assetKey || version === undefined || !projectId) {
      return res.status(400).json({
        error: "entityType, assetKey, version, and projectId are required.",
      });
    }

    const userId = req.user!.id;
    const teamId = req.headers["x-team-id"] as string;
    const worldId = req.headers["x-world-id"] as string;

    try {
      const assetVersionManagerPromote = new AssetVersionManager(
        projectRepository
      );
      const scopeForPromote = {
        projectId,
        [`${entityType}Ids`]: [entityId],
      };
      await assetVersionManagerPromote.setBestVersion(
        scopeForPromote as any,
        [assetKey],
        [version]
      );

      await publishPipelineEventViaEventBus({
        type: "ENTITY_UPDATED",
        projectId,
        teamId,
        worldId,
        userId,
        payload: [
          {
            id: entityId,
            entityType,
            entity: {},
            assets: await assetVersionManagerPromote.getAssetRegistryForEntity(
              entityId,
              entityType
            ),
          },
        ],
        timestamp: new Date().toISOString(),
      });

      res.status(200).json({ success: true });
    } catch (errPromoteVersion) {
      console.error("[Router] Failed to promote asset version:", errPromoteVersion);
      res.status(500).json({ error: "Failed to promote asset version." });
    }
  };
  router.patch(
    api.assets.patch(":entityId"),
    requireAuth,
    requireTeam,
    promoteAssetVersion
  );

  const uploadImage = async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).send("No file uploaded.");

    const { projectId, name, description, fileType = "import" } = req.body;
    const userId = req.user!.id;
    const teamId = req.headers["x-team-id"] as string;
    const worldId = req.headers["x-world-id"] as string;

    if (!projectId)
      return res.status(400).json({ error: "projectId is required." });

    const prefixForImage = projectId ? `${projectId}/` : "";
    const blobForImage = bucket.file(
      `${prefixForImage}images/${Date.now()}_${req.file.originalname}`
    );
    const blobStreamForImage = blobForImage.createWriteStream();

    blobStreamForImage.on("error", () =>
      res.status(500).json({ error: "Unable to upload image." })
    );

    blobStreamForImage.on("finish", async () => {
      const imagePublicUri = `https://storage.googleapis.com/${bucket.name}/${blobForImage.name}`;
      const imageGcsUri = `gs://${bucket.name}/${blobForImage.name}`;

      try {
        const fileId = generateId();

        await db
          .insert(schema.mediaObjects)
          .values({ data: imageGcsUri, refCount: 1, status: "active" })
          .onConflictDoUpdate({
            target: schema.mediaObjects.data,
            set: {
              refCount: sql`${schema.mediaObjects.refCount} + 1`,
              lastReferencedAt: new Date(),
              status: "active",
            },
          });

        await db.insert(schema.files).values({
          id: fileId,
          projectId,
          name: name || req.file?.originalname || "Untitled File",
          description: description || null,
          fileType,
          mediaId: imageGcsUri,
          metadata: {
            width: 0,
            height: 0,
            format: req.file?.mimetype || "image/jpeg",
          },
        });

        await publishPipelineEventViaEventBus({
          type: "ENTITY_CREATED",
          projectId,
          teamId,
          userId,
          worldId,
          payload: [
            {
              entityId: fileId,
              entityType: "file",
              entity: {
                id: fileId,
                projectId,
                name: name || req.file?.originalname || "Untitled File",
              },
            },
          ],
          timestamp: new Date().toISOString(),
        });

        res.status(200).json({ fileId, imagePublicUri, imageGcsUri });
      } catch (errUploadImage) {
        console.error("[Router] Failed to create file entity:", errUploadImage);
        // Still return the URLs – file entity creation is non-fatal
        res.status(200).json({ imagePublicUri, imageGcsUri });
      }
    });

    blobStreamForImage.end(req.file.buffer);
  };
  router.post(
    api.assets.uploadImage(),
    requireAuth,
    requireTeam,
    uploadMiddleware.single("image"),
    uploadImage
  );

  // ── Entity generation endpoints ───────────────────────────────────────────

  const generateCharacter = async (req: Request, res: Response) => {
    try {
      const characterDataRaw = req.body as InsertCharacter & {
        description: string;
        worldId?: string;
        teamId: string;
        userId: string;
      };
      const { projectId, name } = characterDataRaw;

      if (!projectId)
        return res
          .status(400)
          .json({ error: "projectId is required." });

      const userId = req.user!.id;
      const teamId = req.headers["x-team-id"] as string;
      const worldId = req.headers["x-world-id"] as string;

      const paramsInsertCharacter = InsertCharacter.parse({
        ...characterDataRaw,
        id: generateId(),
        projectId,
        referenceId:
          characterDataRaw.referenceId ||
          name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        aliases: characterDataRaw.aliases || [],
        physicalTraits: characterDataRaw.physicalTraits || {},
        state: characterDataRaw.state || {},
        guidanceLevel: characterDataRaw.guidanceLevel ?? 2,
      });

      const [characterRecord] = await db
        .insert(schema.characters)
        .values(paramsInsertCharacter)
        .returning();

      await publishPipelineEventViaEventBus({
        type: "ENTITY_CREATED",
        worldId,
        teamId,
        userId,
        projectId,
        payload: [
          {
            entityId: characterRecord.id,
            entityType: "character",
            entity: characterRecord,
          },
        ],
        timestamp: new Date().toISOString(),
      });

      await publishCommandViaEventBus({
        type: "GENERATE_CHARACTERS",
        projectId,
        worldId,
        teamId,
        userId,
        commandId: generateId(),
        payload: [
          {
            characterId: characterRecord.id,
            prompt: "",
            numberOfOutputs: 1,
          },
        ],
      });

      return res.status(202).json({
        message: "Character created. Image generation queued.",
        characterId: characterRecord.id,
      });
    } catch (errGenerateCharacter) {
      console.error("[Router] Failed to create character:", errGenerateCharacter);
      return res.status(500).json({
        error:
          (errGenerateCharacter as any)?.message ||
          "Failed to create character.",
      });
    }
  };
  router.post(
    api.assets.generateCharacterImage(),
    requireAuth,
    requireTeam,
    generateCharacter
  );

  const generateLocation = async (req: Request, res: Response) => {
    try {
      const locationDataRaw = req.body as InsertLocation & {
        description: string;
        worldId?: string;
        teamId: string;
      };
      const { projectId } = locationDataRaw;
      const userId = req.user!.id;
      const worldId = req.headers["x-world-id"] as string;
      const teamId = req.headers["x-team-id"] as string;

      if (!projectId)
        return res
          .status(400)
          .json({ error: "projectId is required." });

      const paramsInsertLocation = InsertLocation.parse({
        ...locationDataRaw,
        id: generateId(),
        projectId,
        referenceId: locationDataRaw.referenceId,
        timeOfDay: locationDataRaw.timeOfDay || "day",
        weather: locationDataRaw.weather || "clear",
      });

      const [locationRecord] = await db
        .insert(schema.locations)
        .values(paramsInsertLocation)
        .returning();

      await publishPipelineEventViaEventBus({
        type: "ENTITY_CREATED",
        projectId,
        worldId,
        teamId,
        userId,
        payload: [
          {
            entityId: locationRecord.id,
            entityType: "location",
            entity: locationRecord,
          },
        ],
        timestamp: new Date().toISOString(),
      });

      await publishCommandViaEventBus({
        type: "GENERATE_LOCATIONS",
        projectId,
        worldId,
        teamId,
        userId,
        commandId: generateId(),
        payload: [
          {
            locationId: locationRecord.id,
            prompt: "",
            numberOfOutputs: 1,
          },
        ],
      });

      return res.status(202).json({
        message: "Location created. Image generation queued.",
        locationId: locationRecord.id,
      });
    } catch (errGenerateLocation) {
      console.error("[Router] Failed to create location:", errGenerateLocation);
      return res.status(500).json({
        error:
          (errGenerateLocation as any)?.message ||
          "Failed to create location.",
      });
    }
  };
  router.post(
    api.assets.generateLocationImage(),
    requireAuth,
    requireTeam,
    generateLocation
  );

  // ── Entity CRUD ───────────────────────────────────────────────────────────

  const createEntity = async (req: Request, res: Response) => {
    try {
      const { projectId, inserts: entities } = req.body as BatchEntityCreateRequest;
      const userId = req.user!.id;
      const teamId = req.headers["x-team-id"] as string;
      const worldId = req.headers["x-world-id"] as string;

      if (!projectId || !entities?.length) {
        return res
          .status(400)
          .json({ error: "projectId and entities are required." });
      }

      const paramsNewEntities: any[] = entities.map((entityRaw: any) => {
        const entityId = generateId();
        if (entityRaw.entityType === "character") {
          return mapDomainCharacterToInsertCharacter({
            ...entityRaw,
            id: entityId,
            projectId,
          });
        }
        if (entityRaw.entityType === "location") {
          return mapDomainLocationToInsertLocation({
            ...entityRaw,
            id: entityId,
            projectId,
          });
        }
        if (entityRaw.entityType === "scene") {
          return mapDomainSceneToInsertScene({
            ...entityRaw,
            id: entityId,
            projectId,
          });
        }
        throw new Error(`Unknown entity type: ${entityRaw.entityType}`);
      });

      // Persist
      const newEntities: any[] = [];
      for (const paramsEntity of paramsNewEntities) {
        if (paramsEntity.entityType === "character") {
          const [charResult] = await db
            .insert(schema.characters)
            .values(paramsEntity)
            .returning();
          newEntities.push({
            entityId: charResult.id,
            entityType: "character",
            entity: charResult,
          });
        } else if (paramsEntity.entityType === "location") {
          const [locResult] = await db
            .insert(schema.locations)
            .values(paramsEntity)
            .returning();
          newEntities.push({
            entityId: locResult.id,
            entityType: "location",
            entity: locResult,
          });
        } else if (paramsEntity.entityType === "scene") {
          const [sceneResult] = await db
            .insert(schema.scenes)
            .values(paramsEntity)
            .returning();
          newEntities.push({
            entityId: sceneResult.id,
            entityType: "scene",
            entity: sceneResult,
          });
        }
      }

      await publishPipelineEventViaEventBus({
        type: "ENTITY_CREATED",
        projectId,
        worldId,
        teamId,
        userId,
        payload: newEntities,
        timestamp: new Date().toISOString(),
      });

      // Register @mention handles for entities that have a name
      for (const entity of newEntities) {
        const entityName: string =
          entity.entity?.name ?? entity.entity?.title ?? "";
        if (!entityName) continue;
        try {
          await tagRegistryService.registerHandle(
            {
              handle: `@${entityName.replace(/[^a-zA-Z0-9_]/g, "")}`,
              entityId: entity.entityId,
              entityType: entity.entityType as "character" | "location" | "prop",
              projectId,
            },
            db
          );
        } catch (errRegisterHandle) {
          console.warn(
            { entityId: entity.entityId, error: errRegisterHandle },
            "[Router] Failed to register entity handle."
          );
        }
      }

      return res.status(201).json({ entities: newEntities });
    } catch (errCreateEntity) {
      console.error("[Router] Failed to create entity:", errCreateEntity);
      return res.status(500).json({
        error: (errCreateEntity as any)?.message || "Failed to create entity.",
      });
    }
  };
  router.post(api.entities.list(), requireAuth, requireTeam, createEntity);

  // POST /entities/:entityId/delete – uses usersAndTeamsDbService (no WHERE deletes)
  const deleteEntity = async (req: Request, res: Response) => {
    const { entityId } = req.params;
    const { entityType } = req.body as {
      entityType: "scene" | "character" | "location";
    };

    if (!entityType) {
      return res.status(400).json({ error: "entityType is required." });
    }

    try {
      const resultDeleteEntity = await usersAndTeamsDbService.deleteEntity(
        entityId,
        entityType
      );
      if (!resultDeleteEntity.success) {
        return res
          .status(500)
          .json({ error: resultDeleteEntity.error || "Failed to delete entity." });
      }
      res.status(200).json({ success: true });
    } catch (errDeleteEntity) {
      console.error("[Router] Failed to delete entity:", errDeleteEntity);
      res.status(500).json({
        error: (errDeleteEntity as any)?.message || "Failed to delete entity.",
      });
    }
  };
  router.delete(api.entities.delete(":entityId"), requireAuth, requireTeam, deleteEntity);

  // ── Sub-routers ───────────────────────────────────────────────────────────

  router.use(canvasRouter);
  router.use("/entities", mentionRouter);

  return router;
}