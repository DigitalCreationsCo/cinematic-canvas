import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '#shared/api/contract.js';
import { httpBatchLink } from '@trpc/client';
import { QueryClient } from '@tanstack/react-query';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const trpc = createTRPCReact<AppRouter>();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${API_BASE_URL}/trpc`,
      headers() {
        return {};
      },
    }),
  ],
});
