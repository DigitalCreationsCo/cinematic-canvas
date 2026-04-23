import { api } from '#client/lib/api.js';
import { useQuery } from '@tanstack/react-query';
import { trpc } from '#client/lib/trpc.js';

export function useProjects(worldId: string | undefined) {
  // const url = worldId ? `/projects?worldId=${worldId}` : "/projects";
  const { data, error, isLoading } = useQuery(trpc.projects.list.queryOptions({ worldId: worldId }));

  return {
    data,
    isLoading,
    isError: error,
  };
};
