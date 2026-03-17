// src/client/src/store/usePipelineStore.ts

import { create } from 'zustand';
import { InterruptValueType } from '../../../shared/types/workflow.types.js';

export type PipelineStatus =
  | 'idle' | 'analyzing' | 'generating' | 'evaluating'
  | 'error' | 'complete' | 'paused';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export interface PipelineEvent {
  id: string;
  type: 'info' | 'warn' | 'error' | 'success';
  message: string;
  timestamp: Date;
  sceneId?: string;
}

export interface PipelineIntervention {
  jobType: string;
  sceneId?: string;
  commandId: string;
  error: string;
  originalParams: Record<string, any>;
  currentParams?: any; // For editing in ResolveIntervention dialog
  functionName?: string;
  type?: InterruptValueType;
  nodeName?: string;
}

interface PipelineStoreState {
  status: PipelineStatus;
  connectionStatus: ConnectionStatus;
  events: PipelineEvent[];     // max 100 — covers old 'messages' + 'events'
  interrupt: PipelineIntervention | null;

  setStatus: (status: PipelineStatus) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  pushEvent: (event: PipelineEvent) => void;
  setInterrupt: (interrupt: PipelineIntervention | null) => void;
  clearEvents: () => void;
  clearAll: () => void;  // called by useSignOut
}

export const usePipelineStore = create<PipelineStoreState>((set) => ({
  status: 'idle',
  connectionStatus: 'disconnected',
  events: [],
  interrupt: null,

  setStatus: (status) => set({ status }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  pushEvent: (event) => set((state) => ({
    events: [event, ...state.events].slice(0, 100),
  })),

  setInterrupt: (interrupt) => set({ interrupt }),
  clearEvents: () => set({ events: [] }),

  clearAll: () => set({
    status: 'idle',
    events: [],
    interrupt: null,
    connectionStatus: 'disconnected',
  }),
}));
