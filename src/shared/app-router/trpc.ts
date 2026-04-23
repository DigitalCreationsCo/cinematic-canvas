/**
 * tRPC Server Initialization
 *
 * Base tRPC configuration with procedures and middleware for Cinematic Canvas API.
 * Provides end-to-end type safety without schema generation.
 */
import { initTRPC, TRPCError } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { createClient } from "@supabase/supabase-js";
import { usersAndTeamsDbService } from "#shared/services/usersAndTeamsDbService.js";
import { z } from 'zod';
import superjson from 'superjson';

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey);

export const createContext = async ({
  req,
  res,
  info,
}: trpcExpress.CreateExpressContextOptions) => {
  const connectionParams = info.connectionParams ?? {};

  const authHeader =
    typeof req.headers.authorization === "string"
      ? req.headers.authorization
      : typeof connectionParams.Authorization === "string"
        ? connectionParams.Authorization
        : typeof connectionParams.authorization === "string"
          ? connectionParams.authorization
          : undefined;

  const headerTeamId =
    typeof req.headers["x-team-id"] === "string"
      ? req.headers["x-team-id"]
      : typeof connectionParams["x-team-id"] === "string"
        ? connectionParams["x-team-id"]
        : undefined;
  if (headerTeamId && typeof headerTeamId !== "string") {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Team ID must be string' });
  }

  const headerWorldId =
    typeof req.headers["x-world-id"] === "string"
      ? req.headers["x-world-id"]
      : typeof connectionParams["x-world-id"] === "string"
        ? connectionParams["x-world-id"]
        : undefined;
  if (headerWorldId && typeof headerWorldId !== "string") {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'World ID must be string' });
  }

  const headerProjectId =
    typeof req.headers["x-project-id"] === "string"
      ? req.headers["x-project-id"]
      : typeof connectionParams["x-project-id"] === "string"
        ? connectionParams["x-project-id"]
        : undefined;
  if (headerProjectId && typeof headerProjectId !== "string") {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Project ID must be string' });
  }

  // Authentication is optional in context creation
  // The isAuthed middleware will enforce auth for protected procedures
  let user = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const { data: { user: authUser }, error } = await supabaseAdmin.auth.getUser(token);
    user = authUser;
  }

  return {
    user,
    teamId: headerTeamId,
    worldId: headerWorldId,
    projectId: headerProjectId,
    headers: req.headers,
  };
}
export type Context = Awaited<ReturnType<typeof createContext>>;


const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof z.ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const procedure = t.procedure;

interface RecordCacheMembership {
  isMemberDbResult: boolean;
  expiresAtMs: number;
}
const mapCacheMemberships = new Map<string, RecordCacheMembership>();

const TTL_CACHE_MEMBERSHIP_MS = 5 * 60 * 1000; // 5 minutes balances performance with revocation latency
const LIMIT_MAX_CACHE_ENTRIES = 10000; // Prevents OOM attacks via infinite unique header generation

/**
 * Protected procedure - requires authentication
 */
const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * Team-middleware - requires team context
 */
const requireTeam = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user?.id || !ctx.teamId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Team ID required' });
  }

  const keyCacheMembership = `${ctx.user.id}::${ctx.teamId}`;
  const recordCacheCurrent = mapCacheMemberships.get(keyCacheMembership);
  const timeNowMs = Date.now();

  // cache hit
  if (recordCacheCurrent && recordCacheCurrent.expiresAtMs > timeNowMs) {
    console.debug(`[requireTeam] TRACE - Cache hit for key: ${keyCacheMembership}. isMember: ${recordCacheCurrent.isMemberDbResult}`);

    if (!recordCacheCurrent.isMemberDbResult) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Forbidden: Access denied to team resources' });
    }
    return next({
      ctx: {
        ...ctx,
        teamId: ctx.teamId,
      },
    });
  }

  // cache miss
  const isMemberDbResult = await usersAndTeamsDbService.isUserMemberOfTeam(ctx.user.id, ctx.teamId);
  if (mapCacheMemberships.size >= LIMIT_MAX_CACHE_ENTRIES) {
    console.warn(`[requireTeam] Cache limit reached (${LIMIT_MAX_CACHE_ENTRIES}). Purging oldest 10%.`);
    const iteratorKeys = mapCacheMemberships.keys();
    for (let i = 0; i < LIMIT_MAX_CACHE_ENTRIES * 0.1; i++) {
      mapCacheMemberships.delete(iteratorKeys.next().value!);
    }
  }

  // update cache
  mapCacheMemberships.set(keyCacheMembership, {
    isMemberDbResult,
    expiresAtMs: timeNowMs + TTL_CACHE_MEMBERSHIP_MS,
  });

  if (!isMemberDbResult) {
    console.warn(`[requireTeam] Access denied. idUser: ${ctx.user.id} is not a member of headerTeamId: ${ctx.teamId}`);
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Forbidden: Access denied to team resources' });
  }

  return next({
    ctx: {
      ...ctx,
      teamId: ctx.teamId,
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthed);
export const teamProcedure = protectedProcedure.use(requireTeam);
