// ─────────────────────────────────────────────────────────────────────────────
// Cinematic Canvas App Router
//
// All route handlers receive infrastructure through RouterDependencies.
// No raw PubSub clients are instantiated here; every command and event
// publication is done via the injected IEventBus.
// ─────────────────────────────────────────────────────────────────────────────
import { z } from 'zod';
import { router, protectedProcedure, teamProcedure } from './trpc.js';
import { generateId } from '../utils/id.js';
import { ProjectRepository } from '../services/project-repository.js';
import { WorldRepository } from '../services/world-repository.js';
import { usersAndTeamsDbService } from '../services/usersAndTeamsDbService.js';
import { AssetVersionManager } from '../services/asset-version-manager.js';
import { GCPStorageManager } from '../services/storage-manager.js';
import { tagRegistryService } from '../services/tag-registry.js';
import { KBHydrator } from '../services/sac/KBHydrator.js';
import { getSacGitService } from '../services/sac/SacGitServiceStub.js';
import {
  fetchCanvasLayouts,
  upsertBatchCanvasLayouts,
  deleteCanvasLayout,
  confirmCanvasChanges,
  OCCConflictError,
} from '../services/canvasLayoutService.js';
import {
  ResolveMentionsRequestSchema,
  RegisterHandleInputSchema,
  SuggestMentionsRequestSchema,
} from '../types/mention.types.js';
import { db } from '../db/index.js';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { ActiveJobRecord } from '../services/job-control-plane.js';
import { ACTIVE_JOB_STATES } from '../types/job.types.js';
import { IEventBus } from '#shared/messaging/event-bus.types.js';
import { TRPCError } from '@trpc/server';
import { Storage } from '@google-cloud/storage';
import { AssetKey, CharacterAttributes, GuidanceLevel, LocationAttributes, PipelineEvent, PropAttributes, UploadResult } from '#shared/types/index.js';
import type { EntityType, PipelineCommand } from '#shared/types/index.js';
import { ReferenceType } from '#shared/lm/provider.js';
import { createFormDataSchema } from '#shared/utils/utils.js';
import { createChatRouter } from './chat-router.js';

// ─────────────────────────────────────────────────────────────────────────────
// Jobs cache — 15-second TTL to reduce DB hammering on poll-heavy clients
// ─────────────────────────────────────────────────────────────────────────────

const JOBS_CACHE_TTL_MS = 15_000;
const jobsCache = new Map<string, { data: ActiveJobRecord[]; expires: number }>();

function getJobsCache(projectId: string): ActiveJobRecord[] | null {
  const cached = jobsCache.get(projectId);
  if (cached && cached.expires > Date.now()) return cached.data;
  return null;
}

function setJobsCache(projectId: string, data: ActiveJobRecord[]): void {
  jobsCache.set(projectId, { data, expires: Date.now() + JOBS_CACHE_TTL_MS });
}

function invalidateJobsCache(projectId: string): void {
  jobsCache.delete(projectId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level singletons with no per-request state
// ─────────────────────────────────────────────────────────────────────────────

const kbHydrator = new KBHydrator();
const sacService = getSacGitService();

// ─────────────────────────────────────────────────────────────────────────────
// RouterDependencies
// ─────────────────────────────────────────────────────────────────────────────

const VideoFilterSchema = z.object({
  startDate: z.coerce.date().optional().transform(v => v ? new Date(v) : undefined),
  endDate: z.coerce.date().optional().transform(v => v ? new Date(v) : undefined),
  limit: z.coerce.number().int().positive().max(100).default(50),
  status: z.string().optional(),
  minDuration: z.coerce.number().optional()
}).optional();

export interface RouterDependencies {
  eventBus: IEventBus;
  eventsRouter: ReturnType<typeof import('./sse-events.js').createEventsRouter>;
  chatRouter: ReturnType<typeof import('./chat-router.js').createChatRouter>;
}

// ─────────────────────────────────────────────────────────────────────────────
// createAppRouter
// ─────────────────────────────────────────────────────────────────────────────

export function createAppRouter(deps: RouterDependencies) {
  const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT ?? 'omo-dev';
  const bucketName = (process.env.GOOGLE_CLOUD_BUCKET ?? 'test-bucket') as string;

  const {
    eventBus,
    eventsRouter,
    chatRouter,
  } = deps;

  const projectRepository = new ProjectRepository();
  const worldRepository = new WorldRepository();
  const assetVersionManager = new AssetVersionManager(projectRepository);
  const storageClientGcp = new Storage({ projectId: gcpProjectId });
  const storageManager = new GCPStorageManager(gcpProjectId, bucketName);
  const bucket = storageClientGcp.bucket(bucketName);

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function publishCommand<T extends PipelineCommand["type"]>(
    command: Omit<Extract<PipelineCommand, { type: T }>, "timestamp"> & {
      type: T;
      commandId: string;
    }
  ): Promise<string> {
    const commandWithTimestamp = {
      ...command,
      ...("payload" in command ? { payload: command.payload } : {}),
      timestamp: new Date().toISOString(),
      commandId: command.commandId || generateId(),
    } as PipelineCommand;
    console.log(
      { command: commandWithTimestamp },
      `[Router] Publishing '${command.type}' command.`
    );
    return eventBus.publishCommand(commandWithTimestamp);
  }

  async function publishPipelineEvent(eventPayload: PipelineEvent): Promise<string> {
    console.debug(
      { eventType: eventPayload.type, projectId: eventPayload.projectId },
      '[Router] Publishing pipeline event.'
    );
    return eventBus.publishPipelineEvent(eventPayload);
  }

  // ── Router ─────────────────────────────────────────────────────────────────

  return router({

    // ════════════════════════════════════════════════════════════════════════
    // TEAMS
    // ════════════════════════════════════════════════════════════════════════

    teams: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        try {
          const teams = await usersAndTeamsDbService.getTeams(ctx.user!.id);
          return { teams };
        } catch (err) {
          console.error('[Router] Failed to fetch teams:', err);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch teams.' });
        }
      }),

      joinOrCreate: protectedProcedure
        .input(z.object({ name: z.string().min(1).max(100) }))
        .mutation(async ({ ctx, input }) => {
          try {
            const result = await usersAndTeamsDbService.joinOrCreateTeam(
              ctx.user!.id,
              ctx.user!.email!,
              input.name
            );
            return { id: result.id, name: result.name };
          } catch (err) {
            console.error('[Router] Failed to join/create team:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to join or create team.' });
          }
        }),
    }),

    // ════════════════════════════════════════════════════════════════════════
    // WORLDS
    // ════════════════════════════════════════════════════════════════════════

    worlds: router({
      list: teamProcedure.query(async ({ ctx }) => {
        try {
          const worlds = await worldRepository.getWorldsForUser(ctx.user!.id);
          return { worlds };
        } catch (err) {
          console.error('[Router] Failed to fetch worlds:', err);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch worlds.' });
        }
      }),

      create: teamProcedure
        .input(z.object({
          name: z.string().min(1).max(200),
          description: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
          try {
            const world = await worldRepository.createWorld({
              name: input.name,
              description: input.description,
              teamId: ctx.teamId!,
              userId: ctx.user!.id,
            });
            return world;
          } catch (err) {
            console.error('[Router] Failed to create world:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create world.' });
          }
        }),

      // get: teamProcedure
      //   .input(z.object({ worldId: z.string() }))
      //   .query(async ({ input }) => {
      //     try {
      //       const world = await worldRepository.getWorld(input.worldId);
      //       if (!world) {
      //         throw new TRPCError({ code: 'NOT_FOUND', message: 'World not found.' });
      //       }
      //       return world;
      //     } catch (err) {
      //       if (err instanceof TRPCError) throw err;
      //       console.error(`[Router] Failed to fetch world ${input.worldId}:`, err);
      //       throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch world.' });
      //     }
      //   }),

      entities: teamProcedure
        .input(z.object({ worldId: z.string() }))
        .query(async ({ input }) => {
          try {
            return await worldRepository.getWorldEntities(input.worldId);
          } catch (err) {
            console.error(`[Router] Failed to fetch entities for world ${input.worldId}:`, err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch world entities.' });
          }
        }),

      access: teamProcedure
        .input(z.object({ worldId: z.string() }))
        .query(async ({ ctx, input }) => {
          try {
            const grant = await usersAndTeamsDbService.getWorldAccessGrant(input.worldId, ctx.user!.id);
            if (!grant) {
              // No explicit grant found — default to owner/base_ledger for POC
              return { role: 'owner' as const, licenseType: 'base_ledger' as const };
            }
            return { role: grant.role, licenseType: grant.licenseType };
          } catch (err) {
            console.error('[canvasRouter][worldAccess] Access fetch error:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch world access.' });
          }
        }),
    }),

    // ════════════════════════════════════════════════════════════════════════
    // PROJECTS
    // ════════════════════════════════════════════════════════════════════════

    projects: router({
      list: teamProcedure
        .input(z.object({ worldId: z.string().optional() }))
        .query(async ({ ctx, input }) => {
          try {
            const projects = await projectRepository.getProjectsForUser(ctx.user!.id, input.worldId);
            return { projects };
          } catch (err) {
            console.error('[Router] Failed to fetch projects:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch projects.' });
          }
        }),

      create: teamProcedure
        .input(z.object({
          title: z.string().optional(),
          initialPrompt: z.string(),
          teamId: z.string(),
          audioGcsUri: z.string().optional(),
          audioPublicUri: z.string().optional(),
          worldId: z.string().optional(),
          sacRepoId: z.string().optional(),
          sacCommitSha: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          try {
            const projectId = generateId();
            const initialProject = await projectRepository.buildInitialProject(
              projectId,
              input
            );
            const project = await projectRepository.createProject(initialProject);
            return { id: project.id, title: project.metadata.title, createdAt: project.createdAt.toISOString() };
          } catch (err) {
            console.error('[Router] Failed to create project:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create project.' });
          }
        }),

      get: teamProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ input }) => {
          try {
            const project = await projectRepository.getProject(input.projectId);
            if (!project) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found.' });
            }
            return project;
          } catch (err) {
            if (err instanceof TRPCError) throw err;
            console.error(`[Router] Failed to fetch project ${input.projectId}:`, err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch project.' });
          }
        }),

      start: teamProcedure
        .input(z.object({
          projectId: z.string().optional(),
          commandId: z.string().optional(),
          payload: z.object({
            worldId: z.string().optional(),
            teamId: z.string(),
            initialPrompt: z.string(),
            audioGcsUri: z.string().optional(),
            audioPublicUri: z.string().optional(),
            title: z.string().optional(),
            guidanceLevel: GuidanceLevel,
            systemInstructions: z.string().optional(),
            selectedCharacterIds: z.array(z.string()).optional(),
            selectedLocationIds: z.array(z.string()).optional(),
            styleReferenceUrls: z.array(z.string()).optional(),
            loreContent: z.string().optional(),
            sacRepoId: z.string().optional(),
            sacCommitSha: z.string().optional(),
          }),
        }))
        .mutation(async ({ ctx, input }) => {
          try {
            const projectId = ctx.projectId || input.projectId;
            if (!projectId) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'projectId is required.' });
            }
            const commandId = input.commandId || generateId();
            const finalCommandId = await publishCommand({
              type: 'START_PIPELINE',
              projectId,
              worldId: ctx.worldId || '',
              teamId: ctx.teamId || '',
              userId: ctx.user!.id,
              commandId,
              payload: input.payload,
            });
            return { projectId, message: 'Pipeline start command issued.', commandId: finalCommandId };
          } catch (err) {
            if (err instanceof TRPCError) throw err;
            console.error('[Router] Error publishing START_PIPELINE:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal Server Error.' });
          }
        }),

      stop: teamProcedure
        .input(z.object({
          projectId: z.string(),
          commandId: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          try {
            const commandId = input.commandId || generateId();
            const finalCommandId = await publishCommand({
              type: 'STOP_PIPELINE',
              projectId: input.projectId,
              teamId: ctx.teamId || '',
              userId: ctx.user!.id,
              worldId: ctx.worldId || '',
              commandId,
            });
            return { projectId: input.projectId, message: 'Pipeline stop command issued.', commandId: finalCommandId };
          } catch (err) {
            console.error('[Router] Error publishing STOP_PIPELINE:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to issue stop command.' });
          }
        }),

      resume: teamProcedure
        .input(z.object({
          projectId: z.string(),
          commandId: z.string().optional(),
          payload: z.any().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          try {
            const commandId = input.commandId || generateId();
            const finalCommandId = await publishCommand({
              type: 'RESUME_PIPELINE',
              projectId: input.projectId,
              teamId: ctx.teamId || '',
              userId: ctx.user!.id,
              worldId: ctx.worldId || '',
              commandId,
              payload: input.payload,
            });
            return { projectId: input.projectId, message: 'Pipeline resume command issued.', commandId: finalCommandId };
          } catch (err) {
            console.error('[Router] Error publishing RESUME_PIPELINE:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to issue resume command.' });
          }
        }),

      requestState: teamProcedure
        .input(z.object({
          projectId: z.string(),
          commandId: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          try {
            const commandId = input.commandId || generateId();
            const finalCommandId = await publishCommand({
              type: 'REQUEST_FULL_STATE',
              projectId: input.projectId,
              worldId: ctx.worldId || '',
              teamId: ctx.teamId || '',
              userId: ctx.user!.id,
              commandId,
            });
            return { projectId: input.projectId, message: 'Full state request command issued.', commandId: finalCommandId };
          } catch (err) {
            console.error('[Router] Error publishing REQUEST_FULL_STATE:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to issue request state command.' });
          }
        }),

      regenerateScene: teamProcedure
        .input(z.object({
          projectId: z.string(),
          payload: z.object({
            sceneId: z.string(),
            forceRegenerate: z.boolean(),
            promptModification: z.string().optional(),
          }),
          commandId: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          try {
            const commandId = input.commandId || generateId();
            const finalCommandId = await publishCommand({
              projectId: input.projectId,
              type: 'GENERATE_SCENE_VIDEO',
              teamId: ctx.teamId || '',
              userId: ctx.user!.id,
              payload: input.payload,
              commandId,
            });
            return { projectId: input.projectId, message: 'Scene regeneration command issued.', commandId: finalCommandId };
          } catch (err) {
            console.error('[Router] Error publishing GENERATE_SCENE_VIDEO:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to issue regenerate scene command.' });
          }
        }),

      regenerateFrame: teamProcedure
        .input(z.object({
          projectId: z.string(),
          payload: z.object({
            sceneIds: z.array(z.string()),
            assetKeys: z.array(
              z.union([
                z.literal("scene_end_frame"),
                z.literal("scene_start_frame"),
              ])
            ),
            promptModifications: z.array(z.string()).optional(),
          }),
          commandId: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          try {
            const commandId = input.commandId || generateId();
            const finalCommandId = await publishCommand({
              type: 'GENERATE_SCENE_FRAMES',
              projectId: input.projectId,
              worldId: ctx.worldId || '',
              teamId: ctx.teamId || '',
              userId: ctx.user!.id,
              payload: input.payload,
              commandId,
            });
            return { projectId: input.projectId, message: 'Frame regeneration command issued.', commandId: finalCommandId };
          } catch (err) {
            console.error('[Router] Error publishing GENERATE_SCENE_FRAMES:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to issue regenerate frame command.' });
          }
        }),

      resolveIntervention: teamProcedure
        .input(z.object({
          projectId: z.string(),
          payload: z.union([
            z.object({
              action: z.literal("retry"),
              jobType: z.string(),
              revisedParams: z.record(z.string(), z.any()),
            }),
            z.object({
              action: z.literal("skip"),
              jobType: z.string().optional(),
            }),
            z.object({
              action: z.literal("abort"),
              jobType: z.string().optional(),
            }),
          ]),
          commandId: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          try {
            const commandId = input.commandId || generateId();
            const finalCommandId = await publishCommand({
              type: 'RESOLVE_INTERVENTION',
              projectId: input.projectId,
              worldId: ctx.worldId || '',
              teamId: ctx.teamId || '',
              userId: ctx.user!.id,
              payload: input.payload,
              commandId,
            });
            return { projectId: input.projectId, message: 'Intervention resolution command issued.', commandId: finalCommandId };
          } catch (err) {
            console.error('[Router] Error publishing RESOLVE_INTERVENTION:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to issue resolve intervention command.' });
          }
        }),

      generateComposites: teamProcedure
        .input(z.object({
          imageId: z.string(),
          inputImages: z.array(z.object({
            src: z.string(),
            entityId: z.string(),
            assetKey: AssetKey,
            version: z.number(),
            weight: z.number(),
            blendMode: z.enum(["normal", "multiply", "overlay", "screen", "soft-light"]),
            type: ReferenceType,
          })),
          prompt: z.string(),
          negativePrompt: z.string().optional(),
          numberOfOutputs: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          try {
            const commandId = generateId();
            const finalCommandId = await publishCommand({
              type: 'GENERATE_COMPOSITE',
              projectId: ctx.projectId!,
              worldId: ctx.worldId || '',
              teamId: ctx.teamId || '',
              userId: ctx.user!.id,
              commandId,
              payload: {
                ...input,
                numberOfOutputs: input.numberOfOutputs ?? 1,
              },
            });
            return {
              projectId: ctx.projectId!,
              message: 'Composite generation queued.',
              imageId: input.imageId,
              commandId: finalCommandId,
            };
          } catch (err) {
            console.error('[Router] Error publishing GENERATE_COMPOSITE:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to queue composite generation.' });
          }
        }),

      // Status query for a previously issued command — placeholder for command tracking
      command: teamProcedure
        .input(z.object({ projectId: z.string(), commandId: z.string() }))
        .query(async () => ({})),

      assets: teamProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ input }) => {
          try {
            return new AssetVersionManager(projectRepository).getAllProjectAssets(input.projectId);
          } catch (err) {
            console.error('[Router] Error getting project assets:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get project assets.' });
          }
        }),

      sceneAssets: teamProcedure
        .input(z.object({ projectId: z.string(), sceneId: z.string() }))
        .query(async ({ input }) => {
          try {
            return new AssetVersionManager(projectRepository).getAllSceneAssets(input.sceneId);
          } catch (err) {
            console.error('[Router] Error getting scene assets:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get scene assets.' });
          }
        }),

      characterAssets: teamProcedure
        .input(z.object({ projectId: z.string(), characterId: z.string() }))
        .query(async ({ input }) => {
          try {
            return new AssetVersionManager(projectRepository).getAllCharacterAssets(input.characterId);
          } catch (err) {
            console.error('[Router] Error getting character assets:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get character assets.' });
          }
        }),

      locationAssets: teamProcedure
        .input(z.object({ projectId: z.string(), locationId: z.string() }))
        .query(async ({ input }) => {
          try {
            return new AssetVersionManager(projectRepository).getAllLocationAssets(input.locationId);
          } catch (err) {
            console.error('[Router] Error getting location assets:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get location assets.' });
          }
        }),
    }),

    // ════════════════════════════════════════════════════════════════════════
    // JOBS
    // ════════════════════════════════════════════════════════════════════════

    jobs: router({
      list: teamProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ input }) => {
          try {
            const cached = getJobsCache(input.projectId);
            if (cached) return { jobs: cached };

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
              .where(and(
                eq(schema.jobs.projectId, input.projectId),
                inArray(schema.jobs.state, ACTIVE_JOB_STATES)
              ))
              .orderBy(desc(schema.jobs.createdAt));

            setJobsCache(input.projectId, activeJobs as ActiveJobRecord[]);
            return { jobs: activeJobs };
          } catch (err) {
            console.error({ error: err, projectId: input.projectId }, '[Router] Failed to list active jobs.');
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list active jobs.' });
          }
        }),

      cancel: teamProcedure
        .input(z.object({ projectId: z.string(), jobId: z.string() }))
        .mutation(async ({ ctx, input }) => {
          const { projectId, jobId } = input;
          const userId = ctx.user!.id;
          const teamId = ctx.teamId || '';

          try {
            // Atomic conditional cancel — only matches PENDING state to avoid races
            const [cancelled] = await db
              .update(schema.jobs)
              .set({ state: 'CANCELLED', updatedAt: new Date() })
              .where(and(
                eq(schema.jobs.id, jobId),
                eq(schema.jobs.projectId, projectId),
                eq(schema.jobs.state, 'PENDING')
              ))
              .returning();

            if (cancelled) {
              await eventBus.publishJobEvent({
                type: 'JOB_CANCELLED',
                projectId,
                userId,
                teamId,
                metadata: {
                  jobType: cancelled.type,
                  jobId: cancelled.id,
                  workflowId: cancelled.workflowId ?? undefined,
                },
              });
              invalidateJobsCache(projectId);
              return { success: true };
            }

            // Update missed — determine precise failure reason without a separate read in the happy path
            const [existing] = await db
              .select({ state: schema.jobs.state })
              .from(schema.jobs)
              .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.projectId, projectId)))
              .limit(1);

            if (!existing) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found.' });
            }
            if (existing.state === 'RUNNING') {
              throw new TRPCError({
                code: 'CONFLICT',
                message: 'Cannot cancel a job that is already running. Only PENDING jobs can be cancelled.',
              });
            }
            // COMPLETED | FAILED | FATAL | CANCELLED
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Job is already in a terminal state: ${existing.state}`,
            });
          } catch (err) {
            if (err instanceof TRPCError) throw err;
            console.error({ error: err, jobId, projectId }, '[Router] Failed to cancel job.');
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to cancel job.' });
          }
        }),
    }),

    // ════════════════════════════════════════════════════════════════════════
    // ENTITIES
    // ════════════════════════════════════════════════════════════════════════

    entities: router({
      // Generic polymorphic entity creation — publishes GENERATE_ENTITIES command
      create: teamProcedure
        .input(z.array(z.union([
          z.object({
            images: z.array(UploadResult),
            entityType: z.literal('character'),
            data: CharacterAttributes.partial().extend({ id: z.uuid() }),
          }),
          z.object({
            images: z.array(UploadResult),
            entityType: z.literal('location'),
            data: LocationAttributes.partial().extend({ id: z.uuid() }),
          }),
          z.object({
            images: z.array(UploadResult),
            entityType: z.literal('prop'),
            data: PropAttributes.partial().extend({ id: z.uuid() }),
          }),
          z.object({
            images: z.array(UploadResult),
            entityType: z.literal('file'),
            data: PropAttributes.partial().extend({ id: z.uuid() }),
          }),
        ])))
        .output(z.object({
          message: z.string(),
          entityIds: z.array(z.string()),
        }))
        .mutation(async ({ ctx, input }) => {
          try {
            await publishCommand({
              type: 'GENERATE_ENTITIES',
              projectId: ctx.projectId!,
              worldId: ctx.worldId,
              teamId: ctx.teamId,
              userId: ctx.user!.id,
              commandId: generateId(),
              payload: input,
            });
            return {
              message: 'Entities created. Image generation queued.',
              entityIds: input.map((e) => e.data?.id),
            };
          } catch (err) {
            if (err instanceof TRPCError) throw err;
            console.error('[Router] Failed to create entities:', err);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: (err as any)?.message || 'Failed to create entities.',
            });
          }
        }),

      patch: teamProcedure
        .input(z.object({ projectId: z.string(), updates: z.array(z.any()) }))
        .mutation(async ({ ctx, input }) => {
          try {
            const patchResult = await usersAndTeamsDbService.patchEntities(input.updates);
            await publishPipelineEvent({
              type: 'ENTITY_UPDATED',
              projectId: input.projectId,
              worldId: ctx.worldId || '',
              teamId: ctx.teamId || '',
              userId: ctx.user!.id,
              payload: patchResult,
              timestamp: new Date().toISOString(),
            });
            return { success: true };
          } catch (err) {
            console.error('[Router] Failed to patch entities:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to patch entities.' });
          }
        }),

      delete: teamProcedure
        .input(z.object({
          entityId: z.string(),
          entityType: z.enum(['scene', 'character', 'location']),
        }))
        .mutation(async ({ input }) => {
          try {
            const result = await projectRepository.deleteEntity(input.entityId, input.entityType);
            if (!result.success) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: result.error || 'Failed to delete entity.',
              });
            }
            return { success: true };
          } catch (err) {
            if (err instanceof TRPCError) throw err;
            console.error('[Router] Failed to delete entity:', err);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: (err as any)?.message || 'Failed to delete entity.',
            });
          }
        }),

      // Queues scene creation with autofill of entity relationships
      createSceneWithAutoFill: teamProcedure
        .input(z.object({
          projectId: z.string(),
          sceneFields: z.record(z.string(), z.any()),
          startFrameGcsUri: z.string().optional(),
          startFrameMimeType: z.string().optional(),
          endFrameGcsUri: z.string().optional(),
          endFrameMimeType: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          try {
            await publishCommand({
              type: 'CREATE_SCENE_WITH_ENTITIES',
              commandId: generateId(),
              teamId: ctx.teamId,
              projectId: input.projectId,
              userId: ctx.user!.id,
              worldId: ctx.worldId,
              payload: {
                userId: ctx.user!.id,
                sceneFields: input.sceneFields,
                startFrameGcsUri: input.startFrameGcsUri,
                startFrameMimeType: input.startFrameMimeType,
                endFrameGcsUri: input.endFrameGcsUri,
                endFrameMimeType: input.endFrameMimeType,
              },
            });
            return { message: 'Scene creation queued.', projectId: input.projectId };
          } catch (err) {
            console.error('[Router] Failed to queue scene creation:', err);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: (err as any)?.message || 'Failed to queue scene creation.',
            });
          }
        }),

      // Links a source entity's output frame as the start frame of a target scene
      sceneFrameInput: teamProcedure
        .input(z.object({
          sceneId: z.string(),
          projectId: z.string(),
          sourceEntityId: z.string(),
          sourceType: z.enum(['scene', 'image']),
        }))
        .mutation(async ({ input }) => {
          const { sceneId, projectId, sourceEntityId, sourceType } = input;
          try {
            let sourceDataUri: string | undefined;

            if (sourceType === 'scene') {
              sourceDataUri = (await assetVersionManager.getBestVersion(
                { projectId, sceneIds: [sourceEntityId] },
                ['scene_start_frame']
              ))?.[0]?.data;
            } else if (sourceType === 'image') {
              sourceDataUri = (await assetVersionManager.getBestVersion(
                { projectId, fileIds: [sourceEntityId] },
                ['image_file']
              ))?.[0]?.data;
            }

            if (!sourceDataUri) {
              throw new TRPCError({
                code: 'UNPROCESSABLE_CONTENT',
                message: `Source ${sourceType} does not have a valid output frame to link.`,
              });
            }

            const [history] = await assetVersionManager.createVersionedAssets(
              { projectId, sceneIds: [sceneId] },
              ['scene_start_frame'],
              'image',
              [sourceDataUri],
              []
            );

            return {
              result: {
                sceneId,
                sourceType,
                sourceEntityId,
                data: sourceDataUri,
                createdAt: new Date().toISOString(),
              },
              history,
            };
          } catch (err) {
            if (err instanceof TRPCError) throw err;
            console.error('[frame-input] Error linking frame:', {
              error: err instanceof Error ? err.message : err,
              sceneId,
            });
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to link frame to scene.' });
          }
        }),
    }),

    // ════════════════════════════════════════════════════════════════════════
    // ASSETS
    // ════════════════════════════════════════════════════════════════════════

    assets: router({
      get: protectedProcedure
        .input(z.object({
          entityId: z.string(),
          entityType: z.enum(['scene', 'character', 'location', 'project', 'prop', 'file']),
        }))
        .query(async ({ input }) => {
          try {
            return assetVersionManager.getAssetRegistryForEntity(input.entityId, input.entityType as EntityType);
          } catch (err) {
            console.error('[Router] Error getting asset registry:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get asset.' });
          }
        }),

      // Create a versioned asset entry for an entity and publish ENTITY_UPDATED
      create: teamProcedure
        .input(z.object({
          projectId: z.string(),
          entityId: z.string(),
          entityType: z.enum(['scene', 'character', 'location', 'project', 'prop', 'file']),
          assetKey: AssetKey,
          url: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
          try {
            const avm = new AssetVersionManager(projectRepository);
            const scope = { projectId: input.projectId, [`${input.entityType}Ids`]: [input.entityId] };
            await avm.createVersionedAssets(scope, [input.assetKey], ['image'], [input.url], []);

            await publishPipelineEvent({
              type: 'ENTITY_UPDATED',
              projectId: input.projectId,
              teamId: ctx.teamId || '',
              worldId: ctx.worldId || '',
              userId: ctx.user!.id,
              payload: [{
                id: input.entityId,
                entityType: input.entityType,
                entity: {},
                assets: await avm.getAssetRegistryForEntity(input.entityId, input.entityType as EntityType),
              }],
              timestamp: new Date().toISOString(),
            });
            return { success: true };
          } catch (err) {
            console.error('[Router] Failed to create asset:', err);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: (err as any)?.message || 'Failed to create asset.',
            });
          }
        }),

      // Promote a specific asset version to "best" and publish ENTITY_UPDATED
      patch: teamProcedure
        .input(z.object({
          entityId: z.string(),
          entityType: z.enum(['scene', 'character', 'location', 'project']),
          assetKey: AssetKey,
          version: z.number(),
          projectId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
          try {
            const avm = new AssetVersionManager(projectRepository);
            const scope = { projectId: input.projectId, [`${input.entityType}Ids`]: [input.entityId] };
            await avm.setBestVersion(scope as any, [input.assetKey], [input.version]);

            await publishPipelineEvent({
              type: 'ENTITY_UPDATED',
              projectId: input.projectId,
              teamId: ctx.teamId,
              worldId: ctx.worldId,
              userId: ctx.user!.id,
              payload: [{
                id: input.entityId,
                entityType: input.entityType,
                entity: {},
                assets: await avm.getAssetRegistryForEntity(input.entityId, input.entityType as EntityType),
              }],
              timestamp: new Date().toISOString(),
            });
            return { success: true };
          } catch (err) {
            console.error('[Router] Failed to promote asset version:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to promote asset version.' });
          }
        }),

      uploadAudio: teamProcedure
        .input(z.object({
          fileData: z.string(),
          fileName: z.string(),
          mimeType: z.string(),
        }))
        .mutation(async ({ input }) => {
          try {
            const fileBuffer = Buffer.from(input.fileData, 'base64');

            const { audioPublicUri, audioGcsUri } = await storageManager.uploadAudio(fileBuffer, {
              fileName: input.fileName,
              mimeType: input.mimeType,
            });
            return { audioPublicUri, audioGcsUri };
          } catch (err) {
            console.error('[Router] Failed to upload audio:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to upload audio.' });
          }
        }),

      // Uploads image to GCS, persists a file entity row, and publishes ENTITY_CREATED.
      // File is passed as base64 — see note on uploadAudio above.
      uploadImage: teamProcedure
        .input(z.object({
          fileData: z.string().min(1, 'File data is required'),
          fileName: z.string().min(1, 'File name is required'),
          mimeType: z.string().min(1, 'Mime type is required'),
        }))
        .output(UploadResult.extend({ fileId: z.uuid() }))
        .mutation(async ({ ctx, input }) => {

          const projectId = ctx.projectId!;
          const userId = ctx.user!.id;
          const teamId = ctx.teamId || '';
          const worldId = ctx.worldId || '';

          try {
            const fileBuffer = Buffer.from(input.fileData, 'base64');
            const blobPath = `${projectId}/images/${Date.now()}_${input.fileName}`;
            const blob = bucket.file(blobPath);

            // Stream the buffer into GCS
            await new Promise<void>((resolve, reject) => {
              const stream = blob.createWriteStream({ metadata: { contentType: input.mimeType } });
              stream.on('error', reject);
              stream.on('finish', resolve);
              stream.end(fileBuffer);
            });

            const imagePublicUri = `https://storage.googleapis.com/${bucketName}/${blob.name}`;
            const imageGcsUri = `gs://${bucketName}/${blob.name}`;

            // Persist media object with ref-count upsert
            await db
              .insert(schema.mediaObjects)
              .values({ data: imageGcsUri, refCount: 1, status: 'active' })
              .onConflictDoUpdate({
                target: schema.mediaObjects.data,
                set: {
                  refCount: sql`${schema.mediaObjects.refCount} + 1`,
                  lastReferencedAt: new Date(),
                  status: 'active',
                },
              });

            const fileId = generateId();
            await db.insert(schema.files).values({
              id: fileId,
              projectId,
              name: input.fileName,
              description: null,
              fileType: 'image',
              mediaId: imageGcsUri,
              metadata: { width: 0, height: 0, format: input.mimeType },
            });

            await publishPipelineEvent({
              type: 'ENTITY_CREATED',
              projectId,
              teamId,
              userId,
              worldId,
              payload: [{
                entityId: fileId,
                entityType: 'file',
                entity: { id: fileId, projectId, name: input.fileName },
              }],
              timestamp: new Date().toISOString(),
            });

            return { mimeType: input.mimeType, fileId, publicUri: imagePublicUri, gcsUri: imageGcsUri };
          } catch (err) {
            console.error('[Router] Failed to upload image:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Unable to upload image.' });
          }
        }),

      // Accepts an array of character payloads matching CharacterBase schema
      generateCharacterImage: teamProcedure
        .input(z.array(
          z.object({
            characterId: z.uuid(),
            prompt: z.string(),
            numberOfOutputs: z.number(),
          })
        ))
        .mutation(async ({ ctx, input }) => {
          try {
            const projectId = (input[0] as any)?.projectId as string | undefined;
            if (!projectId) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'projectId is required.' });
            }
            await publishCommand({
              type: 'GENERATE_CHARACTER_IMAGES',
              projectId,
              worldId: ctx.worldId || '',
              teamId: ctx.teamId || '',
              userId: ctx.user!.id,
              commandId: generateId(),
              payload: input,
            });
            return {
              message: 'Character created. Image generation queued.',
              characterIds: input.map((c: any) => c.id),
            };
          } catch (err) {
            if (err instanceof TRPCError) throw err;
            console.error('[Router] Failed to create characters:', err);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: (err as any)?.message || 'Failed to create characters.',
            });
          }
        }),

      // Accepts an array of location payloads matching LocationBase schema
      generateLocationImage: teamProcedure
        .input(z.array(
          z.object({
            locationId: z.uuid(),
            prompt: z.string(),
            numberOfOutputs: z.number()
          })
        ))
        .mutation(async ({ ctx, input }) => {
          try {
            const projectId = (input[0] as any)?.projectId as string | undefined;
            if (!projectId) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'projectId is required.' });
            }
            await publishCommand({
              type: 'GENERATE_LOCATION_IMAGES',
              projectId,
              worldId: ctx.worldId || '',
              teamId: ctx.teamId || '',
              userId: ctx.user!.id,
              commandId: generateId(),
              payload: input,
            });
            return {
              message: 'Location Image generation queued.',
              locationIds: input.map((l) => l.locationId),
            };
          } catch (err) {
            if (err instanceof TRPCError) throw err;
            console.error('[Router] Failed to create locations:', err);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: (err as any)?.message || 'Failed to create locations.',
            });
          }
        }),
    }),

    // ════════════════════════════════════════════════════════════════════════
    // CANVAS
    // ════════════════════════════════════════════════════════════════════════

    canvas: router({
      get: protectedProcedure
        .input(z.object({ contextType: z.string(), contextId: z.string() }))
        .query(async ({ input }) => {
          try {
            return fetchCanvasLayouts(input.contextId);
          } catch (err) {
            console.error('[canvasRouter][fetchCanvasLayouts] Fetch error:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch canvas layouts.' });
          }
        }),

      // OCC-guarded batch upsert — raises CONFLICT on version mismatch
      batch: protectedProcedure
        .input(z.object({
          contextType: z.string(),
          contextId: z.string(),
          updates: z.array(z.any()),
        }))
        .mutation(async ({ input }) => {
          try {
            const newVersions = await upsertBatchCanvasLayouts(input.updates);
            return { success: true, newVersions };
          } catch (err) {
            if (err instanceof OCCConflictError) {
              // Surface OCC conflict details in the TRPCError cause so clients
              // can retry with the correct server version
              throw new TRPCError({
                code: 'CONFLICT',
                message: err.message,
                cause: {
                  entityId: err.entityId,
                  clientVersion: err.clientVersion,
                  serverVersion: err.serverVersion,
                },
              });
            }
            console.error('[canvasRouter][upsertBatch] Batch upsert error:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to persist layouts.' });
          }
        }),

      delete: protectedProcedure
        .input(z.object({
          contextType: z.string(),
          contextId: z.string(),
          entityId: z.string(),
        }))
        .mutation(async ({ input }) => {
          try {
            await deleteCanvasLayout(input.contextId, input.entityId);
            return { success: true };
          } catch (err) {
            console.error('[canvasRouter][deleteLayout] Delete error:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete canvas layout.' });
          }
        }),

      // Atomically commits entity updates + pending canvas changes in a single transaction
      confirmChanges: protectedProcedure
        .input(z.object({
          projectId: z.string(),
          updates: z.array(z.any()),
          pendingChanges: z.array(z.any()),
        }))
        .mutation(async ({ input }) => {
          try {
            const affectedVersions = await confirmCanvasChanges(
              input.projectId,
              input.updates,
              input.pendingChanges
            );
            return { success: true, newVersions: affectedVersions };
          } catch (err) {
            console.error('[canvasRouter][confirmChanges] Transaction failed:', err);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: (err as any)?.message || 'Failed to commit batch changes atomically.',
            });
          }
        }),
    }),

    // ════════════════════════════════════════════════════════════════════════
    // VIDEOS
    // ════════════════════════════════════════════════════════════════════════

    videos: router({
      list: protectedProcedure
        .input(VideoFilterSchema)
        .query(async ({ input }) => {
          try {
            const filters = input ?? {} as z.infer<typeof VideoFilterSchema>;
            const avm = new AssetVersionManager(projectRepository);
            const videos = await avm.getCompletedProjectVideos({
              ...filters,
              minDuration: filters?.minDuration ?? 12,
            });
            return { success: true, count: videos.length, data: videos };
          } catch (err) {
            console.error('[Router] Failed to get videos:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' });
          }
        }),
    }),

    // ════════════════════════════════════════════════════════════════════════
    // MENTIONS  (Tag Registry + KBHydration)
    // ════════════════════════════════════════════════════════════════════════

    mention: router({
      // Resolves @handle mentions in HTML input, hydrating them with KB data
      resolve: protectedProcedure
        .input(ResolveMentionsRequestSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return kbHydrator.execute({
              userId: ctx.user!.id,
              projectId: input.projectId,
              htmlInput: input.htmlInput,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error({ error: message }, 'Mention resolve endpoint failed');
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' });
          }
        }),

      // Returns filtered handle suggestions accessible to the calling user
      suggest: protectedProcedure
        .input(SuggestMentionsRequestSchema)
        .query(async ({ ctx, input }) => {
          try {
            const allSuggestions = await tagRegistryService.getAccessibleHandles(
              input.projectId,
              ctx.user!.id,
              db
            );
            const normalizedQuery = input.query?.toLowerCase() ?? '';
            const filtered = allSuggestions
              .filter(s => s.handle.toLowerCase().includes(normalizedQuery))
              .slice(0, input.limit);
            return { suggestions: filtered, totalAvailable: allSuggestions.length };
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error({ error: message }, 'Mention suggest endpoint failed');
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' });
          }
        }),

      // Registers a new handle in the tag registry — raises CONFLICT on duplicates
      register: protectedProcedure
        .input(RegisterHandleInputSchema)
        .mutation(async ({ input }) => {
          try {
            return tagRegistryService.registerHandle(input, db);
          } catch (err) {
            if (err instanceof Error && err.message.includes('already registered')) {
              throw new TRPCError({ code: 'CONFLICT', message: err.message });
            }
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error({ error: message }, 'Mention register endpoint failed');
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' });
          }
        }),

      // Removes a handle from the tag registry — raises NOT_FOUND if absent
      unregister: protectedProcedure
        .input(z.object({ handle: z.string() }))
        .mutation(async ({ input }) => {
          try {
            const deleted = await tagRegistryService.unregisterHandle(input.handle, db);
            if (!deleted) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'Handle not found.' });
            }
            return { success: true };
          } catch (err) {
            if (err instanceof TRPCError) throw err;
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error({ error: message }, 'Mention unregister endpoint failed');
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' });
          }
        }),

      // Fetches a single handle entry — raises NOT_FOUND if absent
      getHandle: protectedProcedure
        .input(z.object({ handle: z.string() }))
        .query(async ({ input }) => {
          try {
            const entry = await tagRegistryService.getHandle(input.handle, db);
            if (!entry) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'Handle not found.' });
            }
            return entry;
          } catch (err) {
            if (err instanceof TRPCError) throw err;
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error({ error: message }, 'Mention get endpoint failed');
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' });
          }
        }),
    }),

    // ════════════════════════════════════════════════════════════════════════
    // SCENE AS CODE (SAC)
    // ════════════════════════════════════════════════════════════════════════

    sac: router({
      // Creates a SAC git repo for a world and persists the repo metadata
      worldRepo: protectedProcedure
        .input(z.object({ worldId: z.string() }))
        .mutation(async ({ input }) => {
          try {
            const result = await sacService.createRepo(input.worldId);
            await usersAndTeamsDbService.updateWorldSacRepo(
              input.worldId,
              result.repoId,
              result.repoUrl
            );
            return result;
          } catch (err) {
            console.error('[canvasRouter][sacCreateRepo] Failed to create SAC repo:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create SAC repo.' });
          }
        }),

      // Forks a world repo into a project-scoped fork
      projectFork: protectedProcedure
        .input(z.object({ projectId: z.string(), worldId: z.string() }))
        .mutation(async ({ input }) => {
          try {
            return sacService.forkRepo(input.worldId, input.projectId);
          } catch (err) {
            console.error('[canvasRouter][sacForkRepo] Failed to fork SAC repo:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fork SAC repo.' });
          }
        }),

      // Commits a ledger snapshot to a SAC repo
      commit: protectedProcedure
        .input(z.object({
          repoId: z.string(),
          ledger: z.any(),
          message: z.string(),
        }))
        .mutation(async ({ input }) => {
          try {
            return sacService.commitLedger(input.repoId, input.ledger, input.message);
          } catch (err) {
            console.error('[canvasRouter][sacCommit] Failed to commit ledger:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to commit ledger.' });
          }
        }),

      // Lists all commits for a SAC repo
      commits: protectedProcedure
        .input(z.object({ repoId: z.string() }))
        .query(async ({ input }) => {
          try {
            return sacService.listCommits(input.repoId);
          } catch (err) {
            console.error('[canvasRouter][sacListCommits] Failed to fetch commit history:', err);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch commit history.' });
          }
        }),
    }),

    // ════════════════════════════════════════════════════════════════════════
    // EVENTS (SSE subscriptions)
    // ════════════════════════════════════════════════════════════════════════

    events: eventsRouter,

    // ════════════════════════════════════════════════════════════════════════
    // CHAT
    // ════════════════════════════════════════════════════════════════════════

    chat: chatRouter,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;