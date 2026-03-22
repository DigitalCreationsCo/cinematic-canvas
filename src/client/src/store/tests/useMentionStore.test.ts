// src/client/src/store/tests/useMentionStore.test.ts
// Vitest tests for useMentionStore

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useMentionStore } from '../useMentionStore.js';
import type { MentionSuggestion, EntityType } from '../../../../shared/types/mention.types.js';

describe('useMentionStore', () => {
  const mockSuggestions: MentionSuggestion[] = [
    {
      handle: '@LukeSkywalker',
      displayName: 'Luke Skywalker',
      entityType: 'character',
      scope: 'project',
    },
    {
      handle: '@HanSolo',
      displayName: 'Han Solo',
      entityType: 'character',
      scope: 'project',
    },
    {
      handle: '@Tatooine',
      displayName: 'Tatooine',
      entityType: 'location',
      scope: 'world',
      avatarUrl: 'https://example.com/tatooine.jpg',
    },
  ];

  beforeEach(() => {
    useMentionStore.getState().clearCache();
    useMentionStore.setState({
      accessibleHandles: mockSuggestions,
      isSuggestionOpen: false,
      suggestionQuery: '',
      suggestions: [],
      suggestionIndex: 0,
      pendingMentions: new Set(),
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    useMentionStore.getState().clearCache();
  });

  describe('accessibleHandles', () => {
    it('should store accessible handles', () => {
      const state = useMentionStore.getState();
      expect(state.accessibleHandles).toHaveLength(3);
      expect(state.accessibleHandles[0].handle).toBe('@LukeSkywalker');
    });

    it('should update accessible handles', () => {
      const newHandles: MentionSuggestion[] = [
        {
          handle: '@NewCharacter',
          displayName: 'New Character',
          entityType: 'character',
          scope: 'project',
        },
      ];

      useMentionStore.getState().setAccessibleHandles(newHandles);

      const state = useMentionStore.getState();
      expect(state.accessibleHandles).toHaveLength(1);
      expect(state.accessibleHandles[0].handle).toBe('@NewCharacter');
    });
  });

  describe('mentionCache', () => {
    it('should add spans to cache', () => {
      const store = useMentionStore.getState();
      store.addToCache({
        handle: '@LukeSkywalker',
        entityId: 'uuid-123',
        entityType: 'character',
      });

      const cached = store.mentionCache.get('@LukeSkywalker');
      expect(cached).toBeDefined();
      expect(cached?.entityId).toBe('uuid-123');
    });

    it('should remove spans from cache', () => {
      const store = useMentionStore.getState();
      store.addToCache({
        handle: '@LukeSkywalker',
        entityId: 'uuid-123',
        entityType: 'character',
      });

      store.removeFromCache('@LukeSkywalker');

      const cached = store.mentionCache.get('@LukeSkywalker');
      expect(cached).toBeUndefined();
    });
  });

  describe('suggestions', () => {
    it('should filter suggestions based on query', () => {
      const state = useMentionStore.getState();
      const filtered = state.getFilteredSuggestions('Luke');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].handle).toBe('@LukeSkywalker');
    });

    it('should be case-insensitive', () => {
      const state = useMentionStore.getState();
      const filtered = state.getFilteredSuggestions('luke');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].handle).toBe('@LukeSkywalker');
    });

    it('should return empty array for no matches', () => {
      const state = useMentionStore.getState();
      const filtered = state.getFilteredSuggestions('Zelda');

      expect(filtered).toHaveLength(0);
    });

    it('should limit suggestions to 10', () => {
      const manySuggestions: MentionSuggestion[] = Array.from({ length: 20 }, (_, i) => ({
        handle: `@Char${i}`,
        displayName: `Character ${i}`,
        entityType: 'character' as EntityType,
        scope: 'project' as const,
      }));

      useMentionStore.getState().setAccessibleHandles(manySuggestions);

      const state = useMentionStore.getState();
      const filtered = state.getFilteredSuggestions('Char');

      expect(filtered).toHaveLength(10);
    });
  });

  describe('suggestion popup state', () => {
    it('should open suggestions with query', () => {
      const store = useMentionStore.getState();
      store.openSuggestions('Luke');

      const state = useMentionStore.getState();
      expect(state.isSuggestionOpen).toBe(true);
      expect(state.suggestionQuery).toBe('Luke');
      expect(state.suggestionIndex).toBe(0);
    });

    it('should close suggestions', () => {
      const store = useMentionStore.getState();
      store.openSuggestions('Luke');
      store.closeSuggestions();

      const state = useMentionStore.getState();
      expect(state.isSuggestionOpen).toBe(false);
      expect(state.suggestionQuery).toBe('');
      expect(state.suggestions).toHaveLength(0);
    });

    it('should update suggestions list', () => {
      const store = useMentionStore.getState();
      store.updateSuggestions(mockSuggestions);

      const state = useMentionStore.getState();
      expect(state.suggestions).toHaveLength(3);
    });

    it('should select suggestion by index', () => {
      const store = useMentionStore.getState();
      store.selectSuggestion(2);

      const state = useMentionStore.getState();
      expect(state.suggestionIndex).toBe(2);
    });
  });

  describe('pending mentions', () => {
    it('should mark handle as pending', () => {
      const store = useMentionStore.getState();
      store.markPending('@LukeSkywalker');

      const state = useMentionStore.getState();
      expect(state.pendingMentions.has('@LukeSkywalker')).toBe(true);
    });

    it('should resolve pending handle', () => {
      const store = useMentionStore.getState();
      store.markPending('@LukeSkywalker');
      store.resolvePending('@LukeSkywalker');

      const state = useMentionStore.getState();
      expect(state.pendingMentions.has('@LukeSkywalker')).toBe(false);
    });
  });

  describe('loading and error state', () => {
    it('should set loading state', () => {
      const store = useMentionStore.getState();
      store.setLoading(true);

      const state = useMentionStore.getState();
      expect(state.isLoading).toBe(true);
    });

    it('should set error state', () => {
      const store = useMentionStore.getState();
      store.setError('Something went wrong');

      const state = useMentionStore.getState();
      expect(state.error).toBe('Something went wrong');
    });

    it('should clear error state', () => {
      const store = useMentionStore.getState();
      store.setError('Something went wrong');
      store.setError(null);

      const state = useMentionStore.getState();
      expect(state.error).toBeNull();
    });
  });

  describe('clearCache', () => {
    it('should clear all cached data', () => {
      const store = useMentionStore.getState();
      store.addToCache({
        handle: '@LukeSkywalker',
        entityId: 'uuid-123',
        entityType: 'character',
      });
      store.markPending('@LukeSkywalker');
      store.clearCache();

      const state = useMentionStore.getState();
      expect(state.mentionCache.size).toBe(0);
      expect(state.pendingMentions.size).toBe(0);
    });
  });
});
