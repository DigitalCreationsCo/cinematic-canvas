/**
 * tRPC Server Initialization
 *
 * Base tRPC configuration with procedures and middleware for Cinematic Canvas API.
 * Provides end-to-end type safety without schema generation.
 */
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

// Context type - inferred from Express middleware
export interface Context {
  user?: {
    id: string;
    email?: string;
    teamId?: string;
  };
  teamId?: string;
  worldId?: string;
  projectId?: string;
  headers: Record<string, string | undefined>;
}

const t = initTRPC.context<Context>().create({
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

/**
 * Protected procedure - requires authentication
 */
const isAuthed = t.middleware(({ ctx, next }) => {
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
const requireTeam = t.middleware(({ ctx, next }) => {
  if (!ctx.teamId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Team ID required' });
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