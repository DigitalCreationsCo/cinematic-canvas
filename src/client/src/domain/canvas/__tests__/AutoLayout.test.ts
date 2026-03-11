import { describe, it, expect } from 'vitest';
import { computeAutoLayout, computeSpawnPosition } from '../AutoLayout.js';

describe('AutoLayout', () => {
  describe('computeSpawnPosition', () => {
    it('returns the correct row Y coordinate based on node type', () => {
      expect(computeSpawnPosition('metadata', []).y).toBe(0);
      expect(computeSpawnPosition('character', []).y).toBe(200);
      expect(computeSpawnPosition('location', []).y).toBe(400);
      expect(computeSpawnPosition('scene', []).y).toBe(800);
      expect(computeSpawnPosition('audio', []).y).toBe(0);
      expect(computeSpawnPosition('composite', []).y).toBe(600);
      expect(computeSpawnPosition('render', []).y).toBe(800);
    });

    it('differentiates X coordinate minimally based on ID hash to avoid exact overlap', () => {
      const pos1 = computeSpawnPosition('scene', []);
      const pos2 = computeSpawnPosition('scene', [{ id: '1', position: pos1, type: 'scene', data: {} as any }]);
      expect(pos1.x).not.toBe(pos2.x);
    });
  });
});
