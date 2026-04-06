// store/useMentionStore.ts
// Global cache for accessible mention handles, keyed by projectId.
// All suggestion UI state (open/closed, selectedIndex, query) lives in useMentionInput — not here.

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { MentionSuggestion } from '../../../shared/types/mention.types.js';

interface MentionStoreState {
  /** Loaded handle lists, keyed by projectId. Populated once per project per session. */
  handleCache: Record<string, MentionSuggestion[]>;

  setHandles: (projectId: string, handles: MentionSuggestion[]) => void;
  getFiltered: (projectId: string, query: string) => MentionSuggestion[];
  hasLoaded: (projectId: string) => boolean;
}

export const useMentionStore = create<MentionStoreState>()(
  immer((set, get) => ({
    handleCache: {},

    setHandles: (projectId, handles) =>
      set((state) => {
        state.handleCache[projectId] = handles;
      }),

    /**
     * Returns up to 8 handles when query is empty, up to 10 filtered by query.
     * Matches against both handle and displayName.
     */
    getFiltered: (projectId, query) => {
      const handles = get().handleCache[projectId] ?? [];
      const q = query.toLowerCase();
      if (!q) return handles.slice(0, 8);
      return handles
        .filter(
          (s) =>
            s.handle.toLowerCase().includes(q) ||
            s.displayName.toLowerCase().includes(q)
        )
        .slice(0, 10);
    },

    hasLoaded: (projectId) => projectId in get().handleCache,
  }))
);