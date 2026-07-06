import { create } from "zustand";
import {
  PORTALS_ACCESS_TOKEN,
  PORTALS_API_TOKEN,
  PORTALS_REFRESH_TOKEN,
} from "@/constants/constants";
import type { AuthStoreType } from "@/types/zustand/auth";
import { cookieManager } from "@/utils/cookie-manager";

interface TeamState {
  activeTeamId: string | null;
  availableTeams: Array<{
    id: string;
    name: string;
    role: "owner" | "admin" | "member";
  }> | null;
  setActiveTeam: (
    teamId: string | null,
    role: "owner" | "admin" | "member" | null,
  ) => void;
  setAvailableTeams: (
    teams: Array<{
      id: string;
      name: string;
      role: "owner" | "admin" | "member";
    }> | null,
  ) => void;
}

const PORTALS_ACTIVE_TEAM_ID = "portals_active_team_id";
const PORTALS_AVAILABLE_TEAMS = "portals_available_teams";

const useAuthStore = create<AuthStoreType & TeamState>((set, get) => ({
  isAdmin: false,
  // Authentication state is now determined by session validation, not cookie reads
  // This allows HttpOnly cookies to work properly
  isAuthenticated: false,
  accessToken: null,
  userData: null,
  autoLogin: null,
  apiKey: null,
  authenticationErrorCount: 0,

  activeTeamId: localStorage.getItem(PORTALS_ACTIVE_TEAM_ID) || null,
  availableTeams: JSON.parse(
    localStorage.getItem(PORTALS_AVAILABLE_TEAMS) || "null",
  ),
  activeTeamRole: null,

  setActiveTeam: (activeTeamId, activeTeamRole) => {
    if (activeTeamId) {
      localStorage.setItem(PORTALS_ACTIVE_TEAM_ID, activeTeamId);
    } else {
      localStorage.removeItem(PORTALS_ACTIVE_TEAM_ID);
    }
    set({ activeTeamId, activeTeamRole });
  },

  setIsAdmin: (isAdmin) => set({ isAdmin }),
  setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setUserData: (userData) => set({ userData }),
  setAutoLogin: (autoLogin) => set({ autoLogin }),
  setApiKey: (apiKey) => set({ apiKey }),
  setAuthenticationErrorCount: (authenticationErrorCount) =>
    set({ authenticationErrorCount }),

  setActiveTeamId: (activeTeamId) => {
    if (activeTeamId) {
      localStorage.setItem(PORTALS_ACTIVE_TEAM_ID, activeTeamId);
    } else {
      localStorage.removeItem(PORTALS_ACTIVE_TEAM_ID);
    }
    set({ activeTeamId });
  },

  setAvailableTeams: (availableTeams) => {
    if (availableTeams) {
      localStorage.setItem(
        PORTALS_AVAILABLE_TEAMS,
        JSON.stringify(availableTeams),
      );
    } else {
      localStorage.removeItem(PORTALS_AVAILABLE_TEAMS);
    }
    set({ availableTeams });
  },

  logout: async () => {
    localStorage.removeItem(PORTALS_ACCESS_TOKEN);
    localStorage.removeItem(PORTALS_API_TOKEN);
    localStorage.removeItem(PORTALS_REFRESH_TOKEN);
    localStorage.removeItem(PORTALS_ACTIVE_TEAM_ID);
    localStorage.removeItem(PORTALS_AVAILABLE_TEAMS);

    cookieManager.clearAuthCookies();

    get().setIsAuthenticated(false);
    get().setIsAdmin(false);

    set({
      isAdmin: false,
      userData: null,
      accessToken: null,
      isAuthenticated: false,
      autoLogin: false,
      apiKey: null,
      activeTeamId: null,
      availableTeams: null,
    });
  },
}));

export default useAuthStore;
