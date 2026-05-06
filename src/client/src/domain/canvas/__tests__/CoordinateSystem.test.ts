import { describe, it, expect } from 'vitest';
import { screenToWorld, snapToGrid, calculateAutoLayoutPosition, GRID_SIZE } from '../CoordinateSystem.js';

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

  describe('snapToGrid', () => {
    it('snaps position to nearest grid point', () => {
      const position = { x: 75, y: 90 };
      const snapped = snapToGrid(position, GRID_SIZE);
      expect(snapped.x).toBe(90);
      expect(snapped.y).toBe(90);
    });

    it('handles positions exactly on grid', () => {
      const position = { x: 120, y: 180 };
      const snapped = snapToGrid(position, GRID_SIZE);
      expect(snapped).toEqual({ x: 120, y: 180 });
    });

    it('handles negative positions', () => {
      const position = { x: -25, y: -35 };
      const snapped = snapToGrid(position, GRID_SIZE);
      expect(snapped.x).toBe(0);
      expect(snapped.y).toBe(0);
    });

    it('uses default GRID_SIZE when not specified', () => {
      const position = { x: 70, y: 70 };
      const snapped = snapToGrid(position);
      expect(snapped).toEqual({ x: 60, y: 60 });
    });

    it('works with custom grid size', () => {
      const position = { x: 25, y: 25 };
      const snapped = snapToGrid(position, 10);
      expect(snapped).toEqual({ x: 30, y: 30 });
    });
  });

  describe('calculateAutoLayoutPosition', () => {
    it('returns origin when no nodes exist', () => {
      const nodes: Array<{ type?: string; position: { x: number; y: number } }> = [];
      const position = calculateAutoLayoutPosition(nodes, 'scene', GRID_SIZE);
      expect(position).toEqual({ x: 0, y: 0 });
    });

    it('places new node to right of same-type node', () => {
      const nodes = [
        { type: 'scene', position: { x: 0, y: 0 } },
      ];
      const position = calculateAutoLayoutPosition(nodes, 'scene', GRID_SIZE);
      expect(position.x).toBe(295);
      expect(position.y).toBe(0);
    });

    it('places new node to right of bottom-most same-type node', () => {
      const nodes = [
        { type: 'scene', position: { x: 0, y: 0 } },
        { type: 'scene', position: { x: 0, y: 100 } },
        { type: 'scene', position: { x: 0, y: 200 } },
      ];
      const position = calculateAutoLayoutPosition(nodes, 'scene', GRID_SIZE);
      expect(position.x).toBe(295);
      expect(position.y).toBe(0);
    });

    it('ignores nodes of different types', () => {
      const nodes = [
        { type: 'scene', position: { x: 0, y: 0 } },
        { type: 'character', position: { x: 0, y: 100 } },
        { type: 'location', position: { x: 0, y: 200 } },
      ];
      const position = calculateAutoLayoutPosition(nodes, 'scene', GRID_SIZE);
      expect(position.x).toBe(295);
      expect(position.y).toBe(0);
    });

    it('snaps the result to grid', () => {
      const nodes = [
        { type: 'scene', position: { x: 10, y: 15 } },
      ];
      const position = calculateAutoLayoutPosition(nodes, 'scene', GRID_SIZE);
      expect(position.x % GRID_SIZE).toBe(5);
      expect(position.y % GRID_SIZE).toBe(15);
    });

    it('handles empty nodes array correctly', () => {
      const position = calculateAutoLayoutPosition([], 'scene', GRID_SIZE);
      expect(position).toEqual({ x: 0, y: 0 });
    });
  });
});
