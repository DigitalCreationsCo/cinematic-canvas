import { useQuery } from "@tanstack/react-query";
import { trpc } from "#client/lib/trpc.js";

export function useWorlds() {
  const { data, error, isLoading } = useQuery(trpc.worlds.list.queryOptions());
  return {
    worlds: data?.worlds || [],
    isLoading,
    isError: error,
  };
}

export function useWorldAccess(worldId: string | undefined) {
  const { data, error, isLoading } = useQuery(
    trpc.worlds.access.queryOptions({
      worldId: worldId || "",
    }),
  );
  return {
    data,
    isLoading,
    isError: error,
  };
}
