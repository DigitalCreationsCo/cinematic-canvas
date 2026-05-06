// src/client/src/store/tests/useMentionStore.test.ts
// Vitest tests for useMentionStore

import { describe, it, expect, beforeEach } from 'vitest';
import { useMentionStore } from '../useMentionStore.js';
import type { MentionSuggestion } from '../../../../shared/types/mention.types.js';

const PROJECT_A = 'project-a';
const PROJECT_B = 'project-b';

const suggestionsA: MentionSuggestion[] = [
  { handle: '@LukeSkywalker', displayName: 'Luke Skywalker', entityType: 'character', scope: 'project' },
  { handle: '@HanSolo', displayName: 'Han Solo', entityType: 'character', scope: 'project' },
  { handle: '@LeiaOrgana', displayName: 'Leia Organa', entityType: 'character', scope: 'project' },
  { handle: '@Tatooine', displayName: 'Tatooine', entityType: 'location', scope: 'world' },
  { handle: '@Hoth', displayName: 'Hoth', entityType: 'location', scope: 'world' },
  { handle: '@Bespin', displayName: 'Bespin', entityType: 'location', scope: 'world' },
  { handle: '@DeathStar', displayName: 'Death Star', entityType: 'location', scope: 'project' },
  { handle: '@MillenniumFalcon', displayName: 'Millennium Falcon', entityType: 'vehicle', scope: 'project' },
  { handle: '@XWing', displayName: 'X-Wing', entityType: 'vehicle', scope: 'project' },
  { handle: '@Yoda', displayName: 'Yoda', entityType: 'character', scope: 'project' },
  { handle: '@ObiWan', displayName: 'Obi-Wan Kenobi', entityType: 'character', scope: 'project' },
];

const suggestionsB: MentionSuggestion[] = [
  { handle: '@Frodo', displayName: 'Frodo Baggins', entityType: 'character', scope: 'project' },
  { handle: '@Gandalf', displayName: 'Gandalf', entityType: 'character', scope: 'project' },
];

describe('useMentionStore', () => {
  beforeEach(() => {
    useMentionStore.setState({ handleCache: {} });
  });

  describe('handleCache', () => {
    it('should start with empty handleCache', () => {
      const state = useMentionStore.getState();
      expect(state.handleCache).toEqual({});
    });

    it('should store handles keyed by projectId', () => {
      useMentionStore.getState().setHandles(PROJECT_A, suggestionsA);
      const state = useMentionStore.getState();
      expect(state.handleCache[PROJECT_A]).toEqual(suggestionsA);
    });

    it('should store handles for multiple projects independently', () => {
      useMentionStore.getState().setHandles(PROJECT_A, suggestionsA);
      useMentionStore.getState().setHandles(PROJECT_B, suggestionsB);

      const state = useMentionStore.getState();
      expect(state.handleCache[PROJECT_A]).toEqual(suggestionsA);
      expect(state.handleCache[PROJECT_B]).toEqual(suggestionsB);
    });

    it('should overwrite handles when setHandles is called again for the same project', () => {
      useMentionStore.getState().setHandles(PROJECT_A, suggestionsA);
      const newHandles: MentionSuggestion[] = [
        { handle: '@NewChar', displayName: 'New Character', entityType: 'character', scope: 'project' },
      ];
      useMentionStore.getState().setHandles(PROJECT_A, newHandles);

      const state = useMentionStore.getState();
      expect(state.handleCache[PROJECT_A]).toEqual(newHandles);
      expect(state.handleCache[PROJECT_A]).toHaveLength(1);
    });
  });

  describe('setHandles', () => {
    it('should store an empty array for a project', () => {
      useMentionStore.getState().setHandles(PROJECT_A, []);
      const state = useMentionStore.getState();
      expect(state.handleCache[PROJECT_A]).toEqual([]);
    });

    it('should store handles with all MentionSuggestion fields preserved', () => {
      const handles: MentionSuggestion[] = [
        {
          handle: '@Tatooine',
          displayName: 'Tatooine',
          entityType: 'location',
          scope: 'world',
          avatarUrl: 'https://example.com/tatooine.jpg',
        },
      ];
      useMentionStore.getState().setHandles(PROJECT_A, handles);

      const state = useMentionStore.getState();
      expect(state.handleCache[PROJECT_A][0].avatarUrl).toBe('https://example.com/tatooine.jpg');
      expect(state.handleCache[PROJECT_A][0].scope).toBe('world');
    });
  });

  describe('getFiltered', () => {
    beforeEach(() => {
      useMentionStore.getState().setHandles(PROJECT_A, suggestionsA);
      useMentionStore.getState().setHandles(PROJECT_B, suggestionsB);
    });

    it('should return up to 8 handles when query is empty', () => {
      const result = useMentionStore.getState().getFiltered(PROJECT_A, '');
      expect(result).toHaveLength(8);
    });

    it('should return fewer than 8 if fewer handles are available', () => {
      const result = useMentionStore.getState().getFiltered(PROJECT_B, '');
      expect(result).toHaveLength(2);
    });

    it('should return empty array for project with no handles loaded', () => {
      const result = useMentionStore.getState().getFiltered('nonexistent-project', '');
      expect(result).toEqual([]);
    });

    it('should filter by handle match (case-insensitive)', () => {
      const result = useMentionStore.getState().getFiltered(PROJECT_A, 'luke');
      expect(result).toHaveLength(1);
      expect(result[0].handle).toBe('@LukeSkywalker');
    });

    it('should filter by displayName match (case-insensitive)', () => {
      const result = useMentionStore.getState().getFiltered(PROJECT_A, 'skywalker');
      expect(result).toHaveLength(1);
      expect(result[0].handle).toBe('@LukeSkywalker');
    });

    it('should match partial query against both handle and displayName', () => {
      const result = useMentionStore.getState().getFiltered(PROJECT_A, 'han');
      expect(result).toHaveLength(1);
      expect(result[0].handle).toBe('@HanSolo');
    });

    it('should return empty array when no matches found', () => {
      const result = useMentionStore.getState().getFiltered(PROJECT_A, 'Zelda');
      expect(result).toEqual([]);
    });

    it('should limit filtered results to 10', () => {
      const many: MentionSuggestion[] = Array.from({ length: 20 }, (_, i) => ({
        handle: `@Char${i}`,
        displayName: `Character ${i}`,
        entityType: 'character' as const,
        scope: 'project' as const,
      }));
      useMentionStore.getState().setHandles(PROJECT_A, many);

      const result = useMentionStore.getState().getFiltered(PROJECT_A, 'Char');
      expect(result).toHaveLength(10);
    });

    it('should return results only for the specified projectId', () => {
      const resultA = useMentionStore.getState().getFiltered(PROJECT_A, 'Frodo');
      const resultB = useMentionStore.getState().getFiltered(PROJECT_B, 'Frodo');

      expect(resultA).toHaveLength(0);
      expect(resultB).toHaveLength(1);
      expect(resultB[0].handle).toBe('@Frodo');
    });

    it('should match query against both handle and displayName and return combined unique results', () => {
      const handles: MentionSuggestion[] = [
        { handle: '@ObiWan', displayName: 'Obi-Wan Kenobi', entityType: 'character', scope: 'project' },
        { handle: '@ObiWan2', displayName: 'Obi-Wan Kenobi', entityType: 'character', scope: 'project' },
      ];
      useMentionStore.getState().setHandles(PROJECT_A, handles);

      const result = useMentionStore.getState().getFiltered(PROJECT_A, 'obi');
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((r) => r.handle.includes('Obi') || r.displayName.toLowerCase().includes('obi'))).toBe(true);
    });
  });

  describe('hasLoaded', () => {
    it('should return false for project with no handles loaded', () => {
      expect(useMentionStore.getState().hasLoaded(PROJECT_A)).toBe(false);
    });

    it('should return true after setHandles is called for a project', () => {
      useMentionStore.getState().setHandles(PROJECT_A, suggestionsA);
      expect(useMentionStore.getState().hasLoaded(PROJECT_A)).toBe(true);
    });

    it('should return false for a different project after loading one project', () => {
      useMentionStore.getState().setHandles(PROJECT_A, suggestionsA);
      expect(useMentionStore.getState().hasLoaded(PROJECT_B)).toBe(false);
    });

    it('should return true when setHandles is called with an empty array', () => {
      useMentionStore.getState().setHandles(PROJECT_A, []);
      expect(useMentionStore.getState().hasLoaded(PROJECT_A)).toBe(true);
    });
  });
});
