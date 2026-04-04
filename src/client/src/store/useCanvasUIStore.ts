// src/client/src/store/useCanvasUIStore.ts
// Transient UI state for the canvas (panel visibility, selected tabs, modes).

import { create } from 'zustand';
import {
  hydrateUIPreferences,
  persistUIPreference,
  flushUIPreferences,
} from './middleware/uiPreferencesPersistence.js';

// Shared sidebar layout constants
export const BASE_OFFSET = 16;
export const SIDEBAR_GAP = 16;
export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 320;
export const MESSAGES_SIDEBAR_WIDTH = 320;

export type ToolPanelSection = 'characters' | 'locations' | 'audio' | 'style' | 'props' | 'lore';
export type LayoutMode = 'freeform' | 'timeline';
type SequenceMode = 'canvas' | 'explicit';

interface CanvasUIStoreState {
  selectedNodeId: string | null;
  lastTouchedNodeId: string | null;
  rightSidebarOpen: boolean;
  messagesSidebarOpen: boolean;
  openToolSections: ToolPanelSection[];
  layoutMode: LayoutMode;
  sequenceMode: SequenceMode;
  snapToGrid: boolean;
  autoLayout: boolean;

  deleteDialogOpen: boolean;
  pendingDeleteNodeId: string | null;
  editingSceneId: string | null;

  // Canvas loading state (previously in store.ts)
  isHydrated: boolean;
  isLoading: boolean;
  error: string | null;

  // Layout save state for Header display
  isSaving: boolean;
  setIsSaving: (v: boolean) => void;

  lastSaved: Date | null;
  setLastSaved: (date: Date | null) => void;

  saveError: string | null;
  setSaveError: (e: string | null) => void;

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
  toggleMessagesSidebar: () => void;
  toggleToolSection: (section: ToolPanelSection) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setSequenceMode: (mode: SequenceMode) => void;
  setSnapToGrid: (snap: boolean) => void;
  setAutoLayout: (auto: boolean) => void;
  toggleAutoLayout: () => void;

  setIsHydrated: (v: boolean) => void;
  setIsLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setPropertiesPanelTab: (tab: CanvasUIStoreState['propertiesPanelTab']) => void;
  setCurrentPlaybackTime: (time: number) => void;
  setIsPlaying: (v: boolean) => void;
  setActiveTab: (tab: string) => void;
  setIsDark: (v: boolean) => void;
  openDeleteDialog: (nodeId: string) => void;
  closeDeleteDialog: () => void;
  setEditingSceneId: (id: string | null) => void;
}

const persistedPrefs = hydrateUIPreferences();

export const useCanvasUIStore = create<CanvasUIStoreState>()((set) => ({
  selectedNodeId: null,
  lastTouchedNodeId: null,
  rightSidebarOpen: false,
  messagesSidebarOpen: false,
  openToolSections: persistedPrefs.openToolSections,
  layoutMode: persistedPrefs.layoutMode,
  sequenceMode: 'canvas',
  snapToGrid: persistedPrefs.snapToGrid,
  autoLayout: persistedPrefs.autoLayout,
  deleteDialogOpen: false,
  pendingDeleteNodeId: null,
  editingSceneId: null,
  isHydrated: false,
  isLoading: false,
  error: null,
  isSaving: false,
  setIsSaving: (v) => set({ isSaving: v }),
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

  toggleMessagesSidebar: () => set((state) => ({
    messagesSidebarOpen: !state.messagesSidebarOpen
  })),

  toggleToolSection: (section) => set((state) => {
    const open = state.openToolSections.includes(section);
    const newSections = open
      ? state.openToolSections.filter((s) => s !== section)
      : [...state.openToolSections, section];
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
  openDeleteDialog: (nodeId) => set({ deleteDialogOpen: true, pendingDeleteNodeId: nodeId }),
  closeDeleteDialog: () => set({ deleteDialogOpen: false, pendingDeleteNodeId: null }),
  setEditingSceneId: (id) => set({ editingSceneId: id }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushUIPreferences);
}

export const selectNodeGraphRightOffset = (state: CanvasUIStoreState) =>
  BASE_OFFSET +
  (state.rightSidebarOpen ? RIGHT_SIDEBAR_DEFAULT_WIDTH + SIDEBAR_GAP : 0) +
  (state.messagesSidebarOpen ? MESSAGES_SIDEBAR_WIDTH + SIDEBAR_GAP : 0);

export const selectRightPanelOffset = (state: CanvasUIStoreState) =>
  BASE_OFFSET +
  (state.messagesSidebarOpen ? MESSAGES_SIDEBAR_WIDTH + SIDEBAR_GAP : 0);
