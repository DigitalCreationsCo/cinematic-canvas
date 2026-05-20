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
  availableTeams: Array<{ id: string; name: string }> | null;
  setActiveTeamId: (teamId: string | null) => void;
  setAvailableTeams: (
    teams: Array<{ id: string; name: string }> | null,
  ) => void;
}

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

  activeTeamId: null,
  availableTeams: null,

  setIsAdmin: (isAdmin) => set({ isAdmin }),
  setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setUserData: (userData) => set({ userData }),
  setAutoLogin: (autoLogin) => set({ autoLogin }),
  setApiKey: (apiKey) => set({ apiKey }),
  setAuthenticationErrorCount: (authenticationErrorCount) =>
    set({ authenticationErrorCount }),

  setActiveTeamId: (activeTeamId) => set({ activeTeamId }),
  setAvailableTeams: (availableTeams) => set({ availableTeams }),

  logout: async () => {
    localStorage.removeItem(PORTALS_ACCESS_TOKEN);
    localStorage.removeItem(PORTALS_API_TOKEN);
    localStorage.removeItem(PORTALS_REFRESH_TOKEN);

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
