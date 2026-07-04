import useAuthStore from "@/stores/authStore";
import type { useQueryFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export interface Team {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
}

export const useGetTeams: useQueryFunctionType<undefined, Array<Team>> = (
  options?,
) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  async function getTeamsFn(): Promise<Array<Team>> {
    const response = await api.get<Array<Team>>(`${getURL("TEAMS")}`);

    const teams = response["data"];
    const store = useAuthStore.getState();
    store.setAvailableTeams(teams);

    // Fallback optimization: Default to first available team if activeTeamId is null
    if (!store.activeTeamId && teams.length > 0) {
      store.setActiveTeam(teams[0].id, teams[0].role);
    }

    return response.data;
  }

  // Ensure the query only runs when the user is explicitly authenticated
  const shouldBeEnabled = isAuthenticated && (options?.enabled ?? true);

  const queryResult = query(["useGetTeams"], getTeamsFn, {
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: 1000 * 60 * 5, // 5 minutes cache viability
    ...options,
    enabled: shouldBeEnabled,
  });

  return queryResult;
};
