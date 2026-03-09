import useSWR from 'swr';
import { apiFetch } from '#/lib/api.js';

const fetcher = (url: string) => apiFetch(url);

export function useProjects(worldId: string | null) {
  const url = worldId ? `/projects?worldId=${worldId}` : "/projects";
  const { data, error, isLoading } = useSWR<{ projects: any[]; }>(url, fetcher);

  return {
    data,
    isLoading,
    isError: error,
  };
}

export function useStopPipeline() {
  const { mutate: swrMutate } = useSWR<{ projects: any[]; }>("/projects", fetcher);

  const stopPipeline = async (projectId: string) => {
    await swrMutate(
      async () => {
        const response = await fetch('/api/project/stop', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ projectId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `API Error: ${response.statusText}`);
        }
        return response.json();
      },
      {
        revalidate: true
      }
    );
  };
  return stopPipeline;
}

export function useWorlds() {
  const { data, error, isLoading } = useSWR<{ worlds: any[]; }>("/worlds", fetcher);

  return {
    worlds: data?.worlds || [],
    isLoading,
    isError: error,
  };
}
