// src/client/src/store/useCanvasUIStore.ts
// Transient UI state for the canvas (panel visibility, selected tabs, modes).

import { create } from 'zustand';

type ToolPanelSection = 'characters' | 'locations' | 'audio' | 'style' | 'props' | 'lore';
type LayoutMode = 'freeform' | 'timeline';
type SequenceMode = 'canvas' | 'explicit';

interface CanvasUIStoreState {
  selectedNodeId: string | null;
  rightSidebarOpen: boolean;
  openToolSections: ToolPanelSection[];
  layoutMode: LayoutMode;
  sequenceMode: SequenceMode;
  snapToGrid: boolean;

  // Canvas loading state (previously in store.ts)
  isHydrated: boolean;
  isLoading: boolean;
  error: string | null;

  // Right sidebar active tab
  propertiesPanelTab:
  | 'prompt'
  | 'camera'
  | 'gen'
  | 'traits'
  | 'attributes'
  | 'composite'
  | 'details'
  | 'quality'
  | 'continuity';

  // Playback state (previously in store.ts)
  currentPlaybackTime: number;
  isPlaying: boolean;

  // App-level UI (previously in store.ts)
  activeTab: string;
  isDark: boolean;

  selectNode: (id: string | null) => void;
  toggleRightSidebar: () => void;
  toggleToolSection: (section: ToolPanelSection) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setSequenceMode: (mode: SequenceMode) => void;
  setSnapToGrid: (snap: boolean) => void;

  setIsHydrated: (v: boolean) => void;
  setIsLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setPropertiesPanelTab: (tab: CanvasUIStoreState[ 'propertiesPanelTab' ]) => void;
  setCurrentPlaybackTime: (time: number) => void;
  setIsPlaying: (v: boolean) => void;
  setActiveTab: (tab: string) => void;
  setIsDark: (v: boolean) => void;
}

export const useCanvasUIStore = create<CanvasUIStoreState>((set) => ({
  selectedNodeId: null,
  rightSidebarOpen: false,
  openToolSections: [ 'characters', 'locations' ], // Default open sections
  layoutMode: 'freeform',
  sequenceMode: 'canvas',
  snapToGrid: false,
  isHydrated: false,
  isLoading: false,
  error: null,
  propertiesPanelTab: 'prompt',
  currentPlaybackTime: 0,
  isPlaying: false,
  activeTab: 'scenes',
  isDark: true,

  selectNode: (id) => set({
    selectedNodeId: id,
    rightSidebarOpen: id !== null // Auto-open sidebar when selected
  }),

  toggleRightSidebar: () => set((state) => ({
    rightSidebarOpen: !state.rightSidebarOpen
  })),

  toggleToolSection: (section) => set((state) => {
    const open = state.openToolSections.includes(section);
    return {
      openToolSections: open
        ? state.openToolSections.filter((s) => s !== section)
        : [ ...state.openToolSections, section ]
    };
  }),

  setLayoutMode: (mode) => set({ layoutMode: mode }),
  setSequenceMode: (mode) => set({ sequenceMode: mode }),
  setSnapToGrid: (snap) => set({ snapToGrid: snap }),

  setIsHydrated: (v) => set({ isHydrated: v }),
  setIsLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e }),
  setPropertiesPanelTab: (tab) => set({ propertiesPanelTab: tab }),
  setCurrentPlaybackTime: (time) => set({ currentPlaybackTime: time }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setIsDark: (v) => set({ isDark: v }),
}));
