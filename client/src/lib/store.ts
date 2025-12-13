import { create } from 'zustand';
import { type PipelineStatus } from '@shared/pipeline-types';

interface AppState {
  selectedProject: string | null; // Allow null for initial state
  isDark: boolean;
  pipelineStatus: PipelineStatus;
  selectedSceneId: number | null;
  activeTab: string;
  currentPlaybackTime: number;
  audioUrl: string | undefined;
  creativePrompt: string; // Add creativePrompt

  setSelectedProject: (selectedProject: string | null) => void;
  setIsDark: (isDark: boolean) => void;
  setPipelineStatus: (status: PipelineStatus) => void;
  setSelectedSceneId: (id: number | null) => void;
  setActiveTab: (tab: string) => void;
  setCurrentPlaybackTime: (time: number) => void;
  setAudioUrl: (url: string | undefined) => void;
  setCreativePrompt: (prompt: string) => void; // Add setCreativePrompt
  resetDashboard: () => void;
}

export const useStore = create<AppState>((set) => ({
  selectedProject: null, // Initial state can be null
  isDark: false,
  pipelineStatus: "idle", // Initial status should be idle
  selectedSceneId: null,
  activeTab: "scenes",
  currentPlaybackTime: 0,
  audioUrl: undefined,
  creativePrompt: "", // Initial creativePrompt

  setSelectedProject: (selectedProject) => set({
    selectedProject
  }),
  setIsDark: (isDark) => set({ isDark }),
  setPipelineStatus: (pipelineStatus) => set({ pipelineStatus }),
  setSelectedSceneId: (selectedSceneId) => set({ selectedSceneId }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setCurrentPlaybackTime: (currentPlaybackTime) => set({ currentPlaybackTime }),
  setAudioUrl: (audioUrl) => set({ audioUrl }),
  setCreativePrompt: (creativePrompt) => set({ creativePrompt }), // Set creativePrompt
  resetDashboard: () => set({ 
    pipelineStatus: "idle", 
    selectedSceneId: null,
    currentPlaybackTime: 0,
    creativePrompt: "", // Reset creativePrompt
  }),
}));
