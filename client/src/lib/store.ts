import { create } from 'zustand';
import { type PipelineStatus } from '@shared/pipeline-types';

interface AppState {
  selectedProject: string;
  isDark: boolean;
  pipelineStatus: PipelineStatus;
  selectedSceneId: number | null;
  activeTab: string;
  currentPlaybackTime: number;
  audioUrl: string | undefined;

  setSelectedProject: (selectedProject: string) => void;
  setIsDark: (isDark: boolean) => void;
  setPipelineStatus: (status: PipelineStatus) => void;
  setSelectedSceneId: (id: number | null) => void;
  setActiveTab: (tab: string) => void;
  setCurrentPlaybackTime: (time: number) => void;
  setAudioUrl: (url: string | undefined) => void;
  resetDashboard: () => void;
}

export const useStore = create<AppState>((set) => ({
  selectedProject: "",
  isDark: false,
  pipelineStatus: "generating",
  selectedSceneId: 1,
  activeTab: "scenes",
  currentPlaybackTime: 0,
  audioUrl: undefined,

  setSelectedProject: (selectedProject) => set({
    selectedProject
  }),
  setIsDark: (isDark) => set({ isDark }),
  setPipelineStatus: (pipelineStatus) => set({ pipelineStatus }),
  setSelectedSceneId: (selectedSceneId) => set({ selectedSceneId }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setCurrentPlaybackTime: (currentPlaybackTime) => set({ currentPlaybackTime }),
  setAudioUrl: (audioUrl) => set({ audioUrl }),
  resetDashboard: () => set({ 
    pipelineStatus: "idle", 
    selectedSceneId: null,
    currentPlaybackTime: 0 
  }),
}));
