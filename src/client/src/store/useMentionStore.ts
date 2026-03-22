// src/client/src/store/useMentionStore.ts
// Zustand store for Entity Mention System (Local-First Architecture)

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { MentionSuggestion, EntityType } from '../../../shared/types/mention.types.js';

interface MentionSpan {
  handle: string;
  entityId: string;
  entityType: EntityType;
}

interface MentionStoreState {
  accessibleHandles: MentionSuggestion[];
  mentionCache: Map<string, MentionSpan>;
  isSuggestionOpen: boolean;
  suggestionQuery: string;
  suggestions: MentionSuggestion[];
  suggestionIndex: number;
  pendingMentions: Set<string>;
  isLoading: boolean;
  error: string | null;

  setAccessibleHandles: (handles: MentionSuggestion[]) => void;
  addToCache: (span: MentionSpan) => void;
  removeFromCache: (handle: string) => void;
  markPending: (handle: string) => void;
  resolvePending: (handle: string) => void;
  openSuggestions: (query: string) => void;
  closeSuggestions: () => void;
  updateSuggestions: (suggestions: MentionSuggestion[]) => void;
  selectSuggestion: (index: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  getFilteredSuggestions: (query: string) => MentionSuggestion[];
  clearCache: () => void;
}

export const useMentionStore = create<MentionStoreState>()(
  immer((set, get) => ({
    accessibleHandles: [],
    mentionCache: new Map(),
    isSuggestionOpen: false,
    suggestionQuery: '',
    suggestions: [],
    suggestionIndex: 0,
    pendingMentions: new Set(),
    isLoading: false,
    error: null,

    setAccessibleHandles: (handles) =>
      set((state) => {
        state.accessibleHandles = handles;
      }),

    addToCache: (span) =>
      set((state) => {
        state.mentionCache.set(span.handle, span);
      }),

    removeFromCache: (handle) =>
      set((state) => {
        state.mentionCache.delete(handle);
      }),

    markPending: (handle) =>
      set((state) => {
        state.pendingMentions.add(handle);
      }),

    resolvePending: (handle) =>
      set((state) => {
        state.pendingMentions.delete(handle);
      }),

    openSuggestions: (query) =>
      set((state) => {
        state.isSuggestionOpen = true;
        state.suggestionQuery = query;
        state.suggestionIndex = 0;
      }),

    closeSuggestions: () =>
      set((state) => {
        state.isSuggestionOpen = false;
        state.suggestionQuery = '';
        state.suggestions = [];
        state.suggestionIndex = 0;
      }),

    updateSuggestions: (suggestions) =>
      set((state) => {
        state.suggestions = suggestions;
      }),

    selectSuggestion: (index) =>
      set((state) => {
        state.suggestionIndex = index;
      }),

    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading;
      }),

    setError: (error) =>
      set((state) => {
        state.error = error;
      }),

    getFilteredSuggestions: (query) => {
      const normalizedQuery = query.toLowerCase();
      const { accessibleHandles } = get();
      return accessibleHandles
        .filter((s) => s.handle.toLowerCase().includes(normalizedQuery))
        .slice(0, 10);
    },

    clearCache: () =>
      set((state) => {
        state.mentionCache.clear();
        state.pendingMentions.clear();
      }),
  }))
);

export const selectMentionSuggestions = (state: MentionStoreState, query: string): MentionSuggestion[] =>
  state.getFilteredSuggestions(query);

export const selectHandleFromCache = (state: MentionStoreState, handle: string): MentionSpan | undefined =>
  state.mentionCache.get(handle);

export const selectIsPendingMention = (state: MentionStoreState, handle: string): boolean =>
  state.pendingMentions.has(handle);
