// src/client/src/store/useCanvasUIStore.ts
// Transient UI state for the canvas (panel visibility, selected tabs, modes).

import { create } from 'zustand';
import {
  hydrateUIPreferences,
  persistUIPreference,
  flushUIPreferences,
} from './middleware/uiPreferencesPersistence.js';

export type ToolPanelSection = 'characters' | 'locations' | 'audio' | 'style' | 'props' | 'lore';
export type LayoutMode = 'freeform' | 'timeline';
type SequenceMode = 'canvas' | 'explicit';

interface CanvasUIStoreState {
  selectedNodeId: string | null;
  lastTouchedNodeId: string | null;
  rightSidebarOpen: boolean;
  openToolSections: ToolPanelSection[];
  layoutMode: LayoutMode;
  sequenceMode: SequenceMode;
  snapToGrid: boolean;
  autoLayout: boolean;

  // Canvas loading state (previously in store.ts)
  isHydrated: boolean;
  isLoading: boolean;
  error: string | null;

  // Layout save state for Header display
  lastSaved: Date | null;
  saveError: string | null;

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
  setLastTouchedNode: (id: string | null) => void;
  toggleRightSidebar: () => void;
  toggleToolSection: (section: ToolPanelSection) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setSequenceMode: (mode: SequenceMode) => void;
  setSnapToGrid: (snap: boolean) => void;
  setAutoLayout: (auto: boolean) => void;
  toggleAutoLayout: () => void;

  setIsHydrated: (v: boolean) => void;
  setIsLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setLastSaved: (date: Date | null) => void;
  setSaveError: (e: string | null) => void;
  setPropertiesPanelTab: (tab: CanvasUIStoreState[ 'propertiesPanelTab' ]) => void;
  setCurrentPlaybackTime: (time: number) => void;
  setIsPlaying: (v: boolean) => void;
  setActiveTab: (tab: string) => void;
  setIsDark: (v: boolean) => void;
}

const persistedPrefs = hydrateUIPreferences();

export const useCanvasUIStore = create<CanvasUIStoreState>()((set) => ({
  selectedNodeId: null,
  lastTouchedNodeId: null,
  rightSidebarOpen: false,
  openToolSections: persistedPrefs.openToolSections,
  layoutMode: persistedPrefs.layoutMode,
  sequenceMode: 'canvas',
  snapToGrid: persistedPrefs.snapToGrid,
  autoLayout: persistedPrefs.autoLayout,
  isHydrated: false,
  isLoading: false,
  error: null,
  lastSaved: null,
  saveError: null,
  propertiesPanelTab: 'prompt',
  currentPlaybackTime: 0,
  isPlaying: false,
  activeTab: 'scenes',
  isDark: persistedPrefs.isDark,

  selectNode: (id) => set({
    selectedNodeId: id,
    rightSidebarOpen: id !== null
  }),

  setLastTouchedNode: (id) => set({ lastTouchedNodeId: id }),

  toggleRightSidebar: () => set((state) => ({
    rightSidebarOpen: !state.rightSidebarOpen
  })),

  toggleToolSection: (section) => set((state) => {
    const open = state.openToolSections.includes(section);
    const newSections = open
      ? state.openToolSections.filter((s) => s !== section)
      : [ ...state.openToolSections, section ];
    persistUIPreference({ openToolSections: newSections });
    return { openToolSections: newSections };
  }),

  setLayoutMode: (mode) => {
    persistUIPreference({ layoutMode: mode });
    set({ layoutMode: mode });
  },
  setSequenceMode: (mode) => set({ sequenceMode: mode }),
  setSnapToGrid: (snap) => {
    persistUIPreference({ snapToGrid: snap });
    set({ snapToGrid: snap });
  },
  setAutoLayout: (auto) => {
    persistUIPreference({ autoLayout: auto });
    set({ autoLayout: auto });
  },
  toggleAutoLayout: () => set((state) => {
    const newValue = !state.autoLayout;
    persistUIPreference({ autoLayout: newValue });
    return { autoLayout: newValue };
  }),

  setIsHydrated: (v) => set({ isHydrated: v }),
  setIsLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e }),
  setLastSaved: (date) => set({ lastSaved: date, saveError: null }),
  setSaveError: (e) => set({ saveError: e }),
  setPropertiesPanelTab: (tab) => set({ propertiesPanelTab: tab }),
  setCurrentPlaybackTime: (time) => set({ currentPlaybackTime: time }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setIsDark: (v) => {
    persistUIPreference({ isDark: v });
    set({ isDark: v });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushUIPreferences);
}
