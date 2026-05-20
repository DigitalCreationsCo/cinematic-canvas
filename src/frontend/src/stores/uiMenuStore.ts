import { create } from "zustand";

export const CHAT_SIDEBAR_WIDTH = 360;
export const TOOLS_SIDEBAR_WIDTH = 280;

type AuxiliarySidebar = "chat" | "tools" | null;

interface UIMenuState {
  /** Whether any dropdown menu is currently open (e.g., AddNodeDropdown) */
  isDropdownOpen: boolean;
  /** Which auxiliary right sidebar is currently open */
  activeAuxiliarySidebar: AuxiliarySidebar;
  /** Currently active workspace tools */
  activeTools: string[];
  /** Whether the notifications panel is open */
  notificationsPanelOpen: boolean;
  /** Set to true when a dropdown opens - this will trigger CanvasContextMenu to close */
  setDropdownOpen: (open: boolean) => void;
  openChatSidebar: () => void;
  closeChatSidebar: () => void;
  toggleChatSidebar: () => void;
  openNotificationsPanel: () => void;
  closeNotificationsPanel: () => void;
  toggleNotificationsPanel: () => void;
  openWorkspaceToolsSidebar: (activeTools?: string[]) => void;
  closeWorkspaceToolsSidebar: () => void;
  toggleWorkspaceToolsSidebar: (activeTools?: string[]) => void;
  setActiveTools: (activeTools: string[]) => void;
  toggleActiveTool: (toolId: string) => void;
}

export const useUIMenuStore = create<UIMenuState>((set) => ({
  isDropdownOpen: false,
  activeAuxiliarySidebar: null,
  activeTools: [],
  notificationsPanelOpen: false,
  setDropdownOpen: (open) => set({ isDropdownOpen: open }),
  openChatSidebar: () =>
    set({
      activeAuxiliarySidebar: "chat",
    }),
  closeChatSidebar: () =>
    set((state) => ({
      activeAuxiliarySidebar:
        state.activeAuxiliarySidebar === "chat"
          ? null
          : state.activeAuxiliarySidebar,
    })),
  toggleChatSidebar: () =>
    set((state) => ({
      activeAuxiliarySidebar:
        state.activeAuxiliarySidebar === "chat" ? null : "chat",
    })),
  openNotificationsPanel: () => set({ notificationsPanelOpen: true }),
  closeNotificationsPanel: () => set({ notificationsPanelOpen: false }),
  toggleNotificationsPanel: () =>
    set((state) => ({
      notificationsPanelOpen: !state.notificationsPanelOpen,
    })),
  openWorkspaceToolsSidebar: (activeTools) =>
    set((state) => ({
      activeAuxiliarySidebar: "tools",
      activeTools: activeTools ?? state.activeTools,
    })),
  closeWorkspaceToolsSidebar: () =>
    set((state) => ({
      activeAuxiliarySidebar:
        state.activeAuxiliarySidebar === "tools"
          ? null
          : state.activeAuxiliarySidebar,
    })),
  toggleWorkspaceToolsSidebar: (activeTools) =>
    set((state) => ({
      activeAuxiliarySidebar:
        state.activeAuxiliarySidebar === "tools" ? null : "tools",
      activeTools: activeTools ?? state.activeTools,
    })),
  setActiveTools: (activeTools) => set({ activeTools }),
  toggleActiveTool: (toolId) =>
    set((state) => ({
      activeTools: state.activeTools.includes(toolId)
        ? state.activeTools.filter((activeToolId) => activeToolId !== toolId)
        : [...state.activeTools, toolId],
      activeAuxiliarySidebar: "tools",
    })),
}));

export const selectChatSidebarOpen = (state: UIMenuState) =>
  state.activeAuxiliarySidebar === "chat";

export const selectWorkspaceToolsSidebarOpen = (state: UIMenuState) =>
  state.activeAuxiliarySidebar === "tools";

export const selectAuxiliarySidebarWidth = (state: UIMenuState) => {
  if (state.activeAuxiliarySidebar === "chat") {
    return CHAT_SIDEBAR_WIDTH;
  }

  if (state.activeAuxiliarySidebar === "tools") {
    return TOOLS_SIDEBAR_WIDTH;
  }

  return 0;
};
