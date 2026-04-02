import useSWR from 'swr';
import { apiFetch } from '#client/lib/api.js';

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

export function useWorlds() {
  const { data, error, isLoading } = useSWR<{ worlds: any[]; }>("/worlds", fetcher);

  return {
    worlds: data?.worlds || [],
    isLoading,
    isError: error,
  };
}

export function useWorldAccess(worldId: string | null) {
  const url = worldId ? `/worlds/${worldId}/access` : null;
  const { data, error, isLoading } = useSWR<{ role: string; licenseType: string | null; }>(url, fetcher);

  return {
    data,
    isLoading,
    isError: error,
  };
}
