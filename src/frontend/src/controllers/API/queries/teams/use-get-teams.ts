import { useLocation } from "react-router-dom";
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
  const location = useLocation();

  async function getTeamsFn(): Promise<Array<Team>> {
    const response = await api.get<{ total_count: number; teams: Array<Team> }>(
      `${getURL("TEAMS")}`,
    );

    const teams = response.data.teams;
    const store = useAuthStore.getState();
    store.setAvailableTeams(teams);

    // Fallback optimization: Default to first available team if activeTeamId is null
    if (!store.activeTeamId && teams.length > 0) {
      store.setActiveTeam(teams[0].id, teams[0].role);
    }

    return teams;
  }

  // Disable query on create-team and join-team pages to prevent 403 loops
  const isOnboardingPage =
    location.pathname.includes("/create-team") ||
    location.pathname.includes("/join-team");

  // Ensure the query only runs when the user is explicitly authenticated and not on onboarding pages
  const shouldBeEnabled =
    isAuthenticated && !isOnboardingPage && (options?.enabled ?? true);

  const queryResult = query(["useGetTeams"], getTeamsFn, {
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: 1000 * 60 * 5, // 5 minutes cache viability
    retry: (failureCount, error: any) => {
      // Don't retry on 403 or 401
      if (error?.response?.status === 403 || error?.response?.status === 401) {
        return false;
      }
      return failureCount < 3;
    },
    ...options,
    enabled: shouldBeEnabled,
  });

  return queryResult;
};
