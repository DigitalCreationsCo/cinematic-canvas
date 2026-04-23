import { z } from 'zod';
import { router, protectedProcedure, teamProcedure } from './trpc.js';
import { generateId } from '../../shared/utils/id.js';
import { ProjectRepository } from '../../shared/services/project-repository.js';
import { WorldRepository } from '../../shared/services/world-repository.js';
import { usersAndTeamsDbService } from '../../shared/services/usersAndTeamsDbService.js';
import { AssetVersionManager } from '../../shared/services/asset-version-manager.js';
import { db } from '../../shared/db/index.js';
import { eq, and, inArray, desc } from 'drizzle-orm';
import * as schema from '../../shared/db/schema.js';
import type { ActiveJobRecord } from '../../shared/services/job-control-plane.js';
import { ACTIVE_JOB_STATES } from '../../shared/types/job.types.js';
import { IEventBus } from '#shared/messaging/event-bus.types.js';

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

interface RouterDependencies {
  eventBus: IEventBus;
}

export function createAppRouter(deps: RouterDependencies) {

  const eventBus = deps.eventBus;
  const projectRepository = new ProjectRepository();
  const worldRepository = new WorldRepository();

  async function publishCommand<T extends { type: string; commandId: string }>(
    command: Omit<T, 'timestamp'>
  ): Promise<string> {
    if (!eventBus) return generateId();
    const commandWithTimestamp = {
      ...command,
      timestamp: new Date().toISOString(),
      commandId: command.commandId || generateId(),
    } as T & { timestamp: string };
    return eventBus.publishCommand(commandWithTimestamp as any);
  }

  return router({
    teams: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        const teams = await usersAndTeamsDbService.getTeams(ctx.user!.id);
        return { teams };
      }),
      joinOrCreate: protectedProcedure
        .input(z.object({ name: z.string().min(1).max(100) }))
        .mutation(async ({ ctx, input }) => {
          const { id, name } = await usersAndTeamsDbService.joinOrCreateTeam(
            ctx.user!.id,
            ctx.user!.email!,
            input.name
          );
          return { id, name };
        }),
    }),

    worlds: router({
      list: teamProcedure.query(async ({ ctx }) => {
        const worlds = await worldRepository.getWorldsForUser(ctx.user!.id);
        return { worlds };
      }),
      create: teamProcedure
        .input(z.object({ name: z.string().min(1).max(200), description: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
          const world = await worldRepository.createWorld({
            name: input.name,
            description: input.description,
            teamId: ctx.teamId!,
            userId: ctx.user!.id,
          });
          return world;
        }),
      get: teamProcedure
        .input(z.object({ worldId: z.string() }))
        .query(async ({ input }) => ({ id: input.worldId, name: '' })),
      entities: teamProcedure
        .input(z.object({ worldId: z.string() }))
        .query(async ({ input }) => worldRepository.getWorldEntities(input.worldId)),
      access: teamProcedure
        .input(z.object({ worldId: z.string() }))
        .query(async () => ({ canEdit: true, role: 'owner' as const })),
    }),

    projects: router({
      list: teamProcedure
        .input(z.object({ worldId: z.string().optional() }))
        .query(async ({ ctx, input }) => ({
          projects: await projectRepository.getProjectsForUser(ctx.user!.id, input.worldId),
        })),
      create: teamProcedure
        .input(z.object({
          title: z.string().optional(),
          initialPrompt: z.string().optional(),
          teamId: z.string(),
          audioGcsUri: z.string().optional(),
          audioPublicUri: z.string().optional(),
          worldId: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          const projectId = generateId();
          const initialProject = await projectRepository.buildInitialProject(projectId, { ...input, projectId });
          const project = await projectRepository.createProject(initialProject);
          return { id: project.id, title: project.title, createdAt: project.createdAt.toISOString() };
        }),
      get: teamProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ input }) => ({ id: input.projectId, title: '', worldId: undefined, teamId: '' })),
      start: teamProcedure
        .input(z.object({ projectId: z.string().optional(), initialPrompt: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
          const commandId = generateId();
          const projectId = ctx.projectId || input.projectId;
          if (!input.initialPrompt) throw new Error('initialPrompt is required');
          await publishCommand({ type: 'START_PIPELINE', projectId: projectId!, worldId: ctx.worldId || '', teamId: ctx.teamId || '', userId: ctx.user!.id, payload: { initialPrompt: input.initialPrompt }, commandId });
          return { projectId: projectId!, message: 'Pipeline start command issued.', commandId };
        }),
      stop: teamProcedure
        .input(z.object({ projectId: z.string() }))
        .mutation(async ({ ctx, input }) => {
          const commandId = generateId();
          await publishCommand({ type: 'STOP_PIPELINE', projectId: input.projectId, teamId: ctx.teamId || '', userId: ctx.user!.id, worldId: ctx.worldId || '', commandId });
          return { projectId: input.projectId, message: 'Pipeline stop command issued.', commandId };
        }),
      resume: teamProcedure
        .input(z.object({ projectId: z.string(), commandId: z.string().optional(), payload: z.any().optional() }))
        .mutation(async ({ ctx, input }) => {
          const commandId = input.commandId || generateId();
          await publishCommand({ type: 'RESUME_PIPELINE', projectId: input.projectId, teamId: ctx.teamId || '', userId: ctx.user!.id, worldId: ctx.worldId || '', commandId, payload: input.payload });
          return { projectId: input.projectId, message: 'Pipeline resume command issued.', commandId };
        }),
      requestState: teamProcedure
        .input(z.object({ projectId: z.string(), commandId: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
          const commandId = input.commandId || generateId();
          await publishCommand({ type: 'REQUEST_FULL_STATE', projectId: input.projectId, worldId: ctx.worldId || '', teamId: ctx.teamId || '', userId: ctx.user!.id, commandId });
          return { projectId: input.projectId, message: 'Full state request command issued.', commandId };
        }),
      regenerateScene: teamProcedure
        .input(z.object({ projectId: z.string(), payload: z.object({ sceneId: z.string() }) }))
        .mutation(async ({ ctx, input }) => {
          const commandId = generateId();
          await publishCommand({ type: 'GENERATE_SCENE_VIDEO', projectId: input.projectId, worldId: ctx.worldId || '', teamId: ctx.teamId || '', userId: ctx.user!.id, payload: input.payload, commandId });
          return { projectId: input.projectId, message: 'Scene regeneration command issued.', commandId };
        }),
      regenerateFrame: teamProcedure
        .input(z.object({ projectId: z.string(), payload: z.object({ sceneId: z.string(), assetKeys: z.array(z.string()) }) }))
        .mutation(async ({ ctx, input }) => {
          const commandId = generateId();
          await publishCommand({ type: 'GENERATE_SCENE_FRAMES', projectId: input.projectId, worldId: ctx.worldId || '', teamId: ctx.teamId || '', userId: ctx.user!.id, payload: input.payload, commandId });
          return { projectId: input.projectId, message: 'Frame regeneration command issued.', commandId };
        }),
      resolveIntervention: teamProcedure
        .input(z.object({ projectId: z.string(), payload: z.object({ action: z.string() }) }))
        .mutation(async ({ ctx, input }) => {
          const commandId = generateId();
          await publishCommand({ type: 'RESOLVE_INTERVENTION', projectId: input.projectId, worldId: ctx.worldId || '', teamId: ctx.teamId || '', userId: ctx.user!.id, payload: input.payload, commandId });
          return { projectId: input.projectId, message: 'Intervention resolution command issued.', commandId };
        }),
      generateComposites: teamProcedure
        .input(z.object({ projectId: z.string(), payload: z.object({ imageId: z.string(), inputImages: z.array(z.string()), prompt: z.string() }) }))
        .mutation(async ({ ctx, input }) => {
          const commandId = generateId();
          await publishCommand({ type: 'GENERATE_COMPOSITES', projectId: input.projectId, worldId: ctx.worldId || '', teamId: ctx.teamId || '', userId: ctx.user!.id, payload: input.payload, commandId });
          return { projectId: input.projectId, message: 'Composite generation queued.', imageId: input.payload.imageId, commandId };
        }),
      command: teamProcedure
        .input(z.object({ projectId: z.string(), commandId: z.string() }))
        .query(async () => ({})),
      assets: teamProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ input }) => new AssetVersionManager(projectRepository).getAllProjectAssets(input.projectId)),
      sceneAssets: teamProcedure
        .input(z.object({ projectId: z.string(), sceneId: z.string() }))
        .query(async ({ input }) => new AssetVersionManager(projectRepository).getAllSceneAssets(input.sceneId)),
      characterAssets: teamProcedure
        .input(z.object({ projectId: z.string(), characterId: z.string() }))
        .query(async ({ input }) => new AssetVersionManager(projectRepository).getAllCharacterAssets(input.characterId)),
      locationAssets: teamProcedure
        .input(z.object({ projectId: z.string(), locationId: z.string() }))
        .query(async ({ input }) => new AssetVersionManager(projectRepository).getAllLocationAssets(input.locationId)),
    }),

    jobs: router({
      list: teamProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ input }) => {
          const cached = getJobsCache(input.projectId);
          if (cached) return { jobs: cached };
          const activeJobs = await db.select({
            id: schema.jobs.id, type: schema.jobs.type, state: schema.jobs.state, projectId: schema.jobs.projectId,
            userId: schema.jobs.userId, teamId: schema.jobs.teamId, workflowId: schema.jobs.workflowId,
            error: schema.jobs.error, createdAt: schema.jobs.createdAt, updatedAt: schema.jobs.updatedAt,
          }).from(schema.jobs).where(and(eq(schema.jobs.projectId, input.projectId), inArray(schema.jobs.state, ACTIVE_JOB_STATES))).orderBy(desc(schema.jobs.createdAt));
          setJobsCache(input.projectId, activeJobs as ActiveJobRecord[]);
          return { jobs: activeJobs };
        }),
      cancel: teamProcedure
        .input(z.object({ projectId: z.string(), jobId: z.string() }))
        .mutation(async ({ input }) => {
          const [cancelled] = await db.update(schema.jobs).set({ state: 'CANCELLED', updatedAt: new Date() })
            .where(and(eq(schema.jobs.id, input.jobId), eq(schema.jobs.projectId, input.projectId), eq(schema.jobs.state, 'PENDING'))).returning();
          if (cancelled) { invalidateJobsCache(input.projectId); return { success: true }; }
          return { success: false };
        }),
    }),

    entities: router({
      list: protectedProcedure.query(async () => []),
      create: protectedProcedure.input(z.any()).mutation(async () => ({ success: true })),
      patch: protectedProcedure
        .input(z.object({ projectId: z.string(), updates: z.array(z.any()) }))
        .mutation(async ({ input }) => { await usersAndTeamsDbService.patchEntities(input.updates); return { success: true }; }),
      delete: protectedProcedure
        .input(z.object({ entityId: z.string(), entityType: z.enum(['scene', 'character', 'location']) }))
        .mutation(async ({ input }) => usersAndTeamsDbService.deleteEntity(input.entityId, input.entityType)),
    }),

    assets: router({
      list: protectedProcedure.query(async () => []),
      get: protectedProcedure.input(z.object({ entityId: z.string() })).query(async () => ({})),
      patch: protectedProcedure
        .input(z.object({ entityId: z.string(), entityType: z.enum(['scene', 'character', 'location', 'project']), assetKey: z.string(), version: z.number().nullable(), projectId: z.string() }))
        .mutation(async () => ({ success: true })),
      uploadAudio: protectedProcedure.input(z.any()).mutation(async () => ({ audioPublicUri: '', audioGcsUri: '' })),
      uploadImage: protectedProcedure.input(z.any()).mutation(async () => ({ imagePublicUri: '', imageGcsUri: '' })),
      generateCharacterImage: protectedProcedure.input(z.object({ projectId: z.string(), name: z.string(), description: z.string() })).mutation(async () => ({ message: '', characterId: '' })),
      generateLocationImage: protectedProcedure.input(z.object({ projectId: z.string(), name: z.string(), description: z.string() })).mutation(async () => ({ message: '', locationId: '' })),
    }),

    canvasData: router({
      get: protectedProcedure.input(z.object({ contextType: z.string(), contextId: z.string() })).query(async () => []),
      batch: protectedProcedure.input(z.object({ contextType: z.string(), contextId: z.string(), updates: z.array(z.any()) })).mutation(async () => ({ success: true })),
      delete: protectedProcedure.input(z.object({ contextType: z.string(), contextId: z.string(), entityId: z.string() })).mutation(async () => ({ success: true })),
      confirmChanges: protectedProcedure.input(z.any()).mutation(async () => ({ success: true })),
    }),

    events: router({
      project: protectedProcedure.input(z.object({ projectId: z.string() })).query(async () => []),
    }),

    videos: router({
      list: protectedProcedure.query(async () => []),
    }),

    mention: router({
      resolve: protectedProcedure
        .input(z.object({ htmlInput: z.string(), projectId: z.string(), options: z.object({ includeUnauthorized: z.boolean().optional() }).optional() }))
        .mutation(async () => ({ success: true, prompt: null as string | null, unauthorizedHandles: [] as string[], errors: [] as string[], metadata: { resolvedCount: 0, unauthorizedCount: 0, processingTimeMs: 0 } })),
      suggest: protectedProcedure
        .input(z.object({ projectId: z.string(), query: z.string().optional(), limit: z.number().optional() }))
        .query(async () => ({ suggestions: [] as any[], totalAvailable: 0 })),
      register: protectedProcedure
        .input(z.object({ handle: z.string(), entityId: z.string(), entityType: z.enum(['character', 'location', 'prop']), projectId: z.string().optional(), worldId: z.string().optional() }))
        .mutation(async () => ({ handle: '', entityId: '', entityType: '' })),
      unregister: protectedProcedure.input(z.object({ handle: z.string() })).mutation(async () => ({ success: true })),
      getHandle: protectedProcedure.input(z.object({ handle: z.string() })).query(async () => null),
    }),

    sac: router({
      worldRepo: protectedProcedure.input(z.object({ worldId: z.string(), payload: z.any().optional() })).mutation(async () => ({ repoId: '' })),
      projectFork: protectedProcedure.input(z.object({ projectId: z.string(), worldId: z.string() })).mutation(async () => ({ forkedProjectId: '' })),
      repoCommit: protectedProcedure.input(z.object({ repoId: z.string(), payload: z.any().optional() })).mutation(async () => ({ commitId: '' })),
      repoCommits: protectedProcedure.input(z.object({ repoId: z.string() })).query(async () => []),
    }),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;