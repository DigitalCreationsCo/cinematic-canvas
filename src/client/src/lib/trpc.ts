import type { AppRouter } from '#shared/app-router/index.js';
import { createTRPCClient, httpBatchLink, httpLink, httpSubscriptionLink, isNonJsonSerializable, loggerLink, splitLink } from '@trpc/client';
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import superjson from 'superjson';
import { createClient } from "@supabase/supabase-js";
import { EventSource } from 'eventsource';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);


export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

async function getTrpcRequestContext() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || "";

  const { getActiveTeamId } = await import('./auth-context.js');
  const { getActiveWorldId } = await import('../store/useWorldStore.js');
  const { getActiveProjectId } = await import('../store/useProjectStore.js');

  const activeTeamId = getActiveTeamId();
  const worldId = getActiveWorldId();
  const projectId = getActiveProjectId();

  return {
    token,
    activeTeamId,
    worldId,
    projectId,
  };
}


export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    loggerLink(),
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({
        url: `${API_BASE_URL}/trpc`,
        EventSource: EventSource,
        connectionParams: async () => {
          const { token, activeTeamId, worldId, projectId } = await getTrpcRequestContext();
          const connectionParams: Record<string, string> = {};
          if (token) connectionParams["Authorization"] = `Bearer ${token}`;
          if (activeTeamId) connectionParams["x-team-id"] = activeTeamId;
          if (worldId) connectionParams["x-world-id"] = worldId;
          if (projectId) connectionParams["x-project-id"] = projectId;
          return connectionParams;
        },
        transformer: superjson,
      }),
      false: splitLink({
        condition: (op) => op.input instanceof FormData,
        true: httpLink({
          url: `${API_BASE_URL}/trpc`,
          async headers() {
            const { token, activeTeamId, worldId, projectId } = await getTrpcRequestContext();
            const headers: Record<string, string> = {};
            if (token) headers["Authorization"] = `Bearer ${token}`;
            if (activeTeamId) headers["x-team-id"] = activeTeamId;
            if (worldId) headers["x-world-id"] = worldId;
            if (projectId) headers["x-project-id"] = projectId;
            return headers;
          },
          transformer: {
            serialize: (data) => data,
            deserialize: (data) => superjson.deserialize(data),
            unstable_serializeNonJsonTypes: true,
          },
        }),
        false: httpBatchLink({
          url: `${API_BASE_URL}/trpc`,
          async headers() {
            const { token, activeTeamId, worldId, projectId } = await getTrpcRequestContext();
            const headers: Record<string, string> = {};
            if (token) headers["Authorization"] = `Bearer ${token}`;
            if (activeTeamId) headers["x-team-id"] = activeTeamId;
            if (worldId) headers["x-world-id"] = worldId;
            if (projectId) headers["x-project-id"] = projectId;
            return headers;
          },
          transformer: superjson,
        }),
      })
    })
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
