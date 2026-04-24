import { create } from 'zustand';

export const MESSAGES_SIDEBAR_WIDTH = 320;
export const TOOLS_SIDEBAR_WIDTH = 220;

type AuxiliarySidebar = 'messages' | 'tools' | null;

interface UIMenuState {
  /** Whether any dropdown menu is currently open (e.g., AddNodeDropdown) */
  isDropdownOpen: boolean;
  /** Which auxiliary right sidebar is currently open */
  activeAuxiliarySidebar: AuxiliarySidebar;
  /** Currently active workspace tools */
  activeTools: string[];
  /** Set to true when a dropdown opens - this will trigger CanvasContextMenu to close */
  setDropdownOpen: (open: boolean) => void;
  openMessagesSidebar: () => void;
  closeMessagesSidebar: () => void;
  toggleMessagesSidebar: () => void;
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
  setDropdownOpen: (open) => set({ isDropdownOpen: open }),
  openMessagesSidebar: () => set({
    activeAuxiliarySidebar: 'messages',
  }),
  closeMessagesSidebar: () => set((state) => ({
    activeAuxiliarySidebar: state.activeAuxiliarySidebar === 'messages' ? null : state.activeAuxiliarySidebar,
  })),
  toggleMessagesSidebar: () => set((state) => ({
    activeAuxiliarySidebar: state.activeAuxiliarySidebar === 'messages' ? null : 'messages',
  })),
  openWorkspaceToolsSidebar: (activeTools) => set((state) => ({
    activeAuxiliarySidebar: 'tools',
    activeTools: activeTools ?? state.activeTools,
  })),
  closeWorkspaceToolsSidebar: () => set((state) => ({
    activeAuxiliarySidebar: state.activeAuxiliarySidebar === 'tools' ? null : state.activeAuxiliarySidebar,
  })),
  toggleWorkspaceToolsSidebar: (activeTools) => set((state) => ({
    activeAuxiliarySidebar: state.activeAuxiliarySidebar === 'tools' ? null : 'tools',
    activeTools: activeTools ?? state.activeTools,
  })),
  setActiveTools: (activeTools) => set({ activeTools }),
  toggleActiveTool: (toolId) => set((state) => ({
    activeTools: state.activeTools.includes(toolId)
      ? state.activeTools.filter((activeToolId) => activeToolId !== toolId)
      : [...state.activeTools, toolId],
    activeAuxiliarySidebar: 'tools',
  })),
}));

export const selectMessagesSidebarOpen = (state: UIMenuState) => state.activeAuxiliarySidebar === 'messages';

export const selectWorkspaceToolsSidebarOpen = (state: UIMenuState) => state.activeAuxiliarySidebar === 'tools';

export const selectAuxiliarySidebarWidth = (state: UIMenuState) => {
  if (state.activeAuxiliarySidebar === 'messages') {
    return MESSAGES_SIDEBAR_WIDTH;
  }

  if (state.activeAuxiliarySidebar === 'tools') {
    return TOOLS_SIDEBAR_WIDTH;
  }

  return 0;
};
