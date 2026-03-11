import { describe, it, expect } from 'vitest';
import { screenToWorld } from '../CoordinateSystem.js';

describe('CoordinateSystem', () => {
  describe('screenToWorld', () => {
    it('converts correctly at zoom level 1.0 with no pan', () => {
      const viewport = { x: 0, y: 0, zoom: 1 };
      const worldPos = screenToWorld(100, 200, viewport);
      expect(worldPos).toEqual({ x: 100, y: 200 });
    });

    it('accounts for pan offset', () => {
      // User panned left 50px and up 50px
      const viewport = { x: -50, y: -50, zoom: 1 };
      const worldPos = screenToWorld(100, 200, viewport);
      expect(worldPos).toEqual({ x: 150, y: 250 });
    });

    it('accounts for zoom scale', () => {
      // User zoomed in to 200%
      const viewport = { x: 0, y: 0, zoom: 2 };
      const worldPos = screenToWorld(100, 200, viewport);
      // coordinate should be halved in world space
      expect(worldPos).toEqual({ x: 50, y: 100 });
    });

    it('accounts for both pan and zoom simultaneously', () => {
      const viewport = { x: 200, y: 100, zoom: 0.5 };
      const worldPos = screenToWorld(300, 200, viewport);
      // x: (300 - 200) / 0.5 = 200
      // y: (200 - 100) / 0.5 = 200
      expect(worldPos).toEqual({ x: 200, y: 200 });
    });
  });
});
