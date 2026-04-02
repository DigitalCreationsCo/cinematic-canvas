import { create } from 'zustand';

interface UIMenuState {
  /** Whether any dropdown menu is currently open (e.g., AddNodeDropdown) */
  isDropdownOpen: boolean;
  /** Set to true when a dropdown opens - this will trigger CanvasContextMenu to close */
  setDropdownOpen: (open: boolean) => void;
}

export const useUIMenuStore = create<UIMenuState>((set) => ({
  isDropdownOpen: false,
  setDropdownOpen: (open) => set({ isDropdownOpen: open }),
}));
