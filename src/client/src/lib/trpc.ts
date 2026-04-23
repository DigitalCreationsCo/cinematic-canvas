import type { AppRouter } from '#shared/app-router/index.js';
import { createTRPCClient, httpBatchLink, httpSubscriptionLink, loggerLink, splitLink } from '@trpc/client';
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import superjson from 'superjson';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    loggerLink(),
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({
        url: `${API_BASE_URL}/trpc`,
        transformer: superjson,
      }),
      false: httpBatchLink({
        url: `${API_BASE_URL}/trpc`,
        headers() {
          return {};
        },
        transformer: superjson,
      }),
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});