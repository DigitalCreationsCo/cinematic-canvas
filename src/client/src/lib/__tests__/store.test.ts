import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStore } from '../../../src/client/src/lib/store.js';
import { AssetHistory, AssetVersion, AssetKey } from '../../../src/shared/types/assets.types.js';

// Mock immer and zustand
vi.mock('zustand', () => ({
  create: vi.fn().mockImplementation((createState) => {
    let state = createState();
    return {
      getState: () => state,
      setState: (updater) => {
        state = typeof updater === 'function' ? updater(state) : updater;
        return state;
      },
      subscribe: vi.fn(),
      destroy: vi.fn(),
    };
  }),
}));

vi.mock('zustand/middleware/immer', () => ({
  immer: vi.fn().mockImplementation((createState) => createState),
}));

vi.mock('zustand/middleware', () => ({
  subscribeWithSelector: vi.fn().mockImplementation((createState) => createState),
}));

describe('Asset Store Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mergeAssetHistories', () => {
    it('should replace entire history for asset key', () => {
      const { result } = renderHook(() => useStore());
      
      const entityId = 'scene-1';
      const assetKey: AssetKey = 'scene_start_frame';
      
      // Set initial state
      act(() => {
        result.current.setAssets(entityId, {
          [assetKey]: {
            head: 1,
            best: 1,
            versions: [{
              version: 1,
              data: 'old-url',
              type: 'image',
              metadata: { model: 'old-model' },
              createdAt: new Date('2024-01-01')
            }]
          }
        });
      });

      // Merge new history (should replace, not merge)
      const newHistory: AssetHistory = {
        head: 2,
        best: 2,
        versions: [
          {
            version: 2,
            data: 'new-url',
            type: 'image',
            metadata: { model: 'new-model' },
            createdAt: new Date('2024-01-02')
          }
        ]
      };

      act(() => {
        result.current.mergeAssetHistories([{
          entityId,
          assetKey,
          history: newHistory
        }]);
      });

      const assets = result.current.assets.get(entityId);
      expect(assets?.[assetKey]).toEqual(newHistory);
    });

    it('should preserve other asset keys when merging', () => {
      const { result } = renderHook(() => useStore());
      
      const entityId = 'scene-1';
      const assetKey1: AssetKey = 'scene_start_frame';
      const assetKey2: AssetKey = 'scene_end_frame';
      
      // Set initial state with multiple asset keys
      act(() => {
        result.current.setAssets(entityId, {
          [assetKey1]: {
            head: 1,
            best: 1,
            versions: [{ version: 1, data: 'url1', type: 'image', metadata: {}, createdAt: new Date() }]
          },
          [assetKey2]: {
            head: 1,
            best: 1,
            versions: [{ version: 1, data: 'url2', type: 'image', metadata: {}, createdAt: new Date() }]
          }
        });
      });

      // Update only one asset key
      const newHistory: AssetHistory = {
        head: 2,
        best: 2,
        versions: [{ version: 2, data: 'new-url1', type: 'image', metadata: {}, createdAt: new Date() }]
      };

      act(() => {
        result.current.mergeAssetHistories([{
          entityId,
          assetKey: assetKey1,
          history: newHistory
        }]);
      });

      const assets = result.current.assets.get(entityId);
      expect(assets?.[assetKey1]).toEqual(newHistory);
      expect(assets?.[assetKey2]).toEqual({
        head: 1,
        best: 1,
        versions: [{ version: 1, data: 'url2', type: 'image', metadata: {}, createdAt: new Date() }]
      });
    });

    it('should handle multiple entities and asset keys', () => {
      const { result } = renderHook(() => useStore());
      
      const histories = [
        {
          entityId: 'scene-1',
          assetKey: 'scene_start_frame' as AssetKey,
          history: {
            head: 1,
            best: 1,
            versions: [{ version: 1, data: 'url1', type: 'image', metadata: {}, createdAt: new Date() }]
          }
        },
        {
          entityId: 'scene-2',
          assetKey: 'scene_end_frame' as AssetKey,
          history: {
            head: 1,
            best: 1,
            versions: [{ version: 1, data: 'url2', type: 'image', metadata: {}, createdAt: new Date() }]
          }
        }
      ];

      act(() => {
        result.current.mergeAssetHistories(histories);
      });

      expect(result.current.assets.get('scene-1')?.['scene_start_frame']).toEqual(histories[0].history);
      expect(result.current.assets.get('scene-2')?.['scene_end_frame']).toEqual(histories[1].history);
    });
  });

  describe('mergeAssets', () => {
    it('should merge registries preserving existing keys', () => {
      const { result } = renderHook(() => useStore());
      
      const entityId = 'scene-1';
      
      // Set initial state
      act(() => {
        result.current.setAssets(entityId, {
          scene_start_frame: {
            head: 1,
            best: 1,
            versions: [{ version: 1, data: 'url1', type: 'image', metadata: {}, createdAt: new Date() }]
          }
        });
      });

      // Merge new registry with additional key
      const newRegistry = {
        scene_end_frame: {
          head: 1,
          best: 1,
          versions: [{ version: 1, data: 'url2', type: 'image', metadata: {}, createdAt: new Date() }]
        }
      };

      act(() => {
        result.current.mergeAssets(entityId, newRegistry);
      });

      const assets = result.current.assets.get(entityId);
      expect(assets).toEqual({
        scene_start_frame: {
          head: 1,
          best: 1,
          versions: [{ version: 1, data: 'url1', type: 'image', metadata: {}, createdAt: new Date() }]
        },
        scene_end_frame: {
          head: 1,
          best: 1,
          versions: [{ version: 1, data: 'url2', type: 'image', metadata: {}, createdAt: new Date() }]
        }
      });
    });

    it('should handle conflicting keys by merging histories', () => {
      const { result } = renderHook(() => useStore());
      
      const entityId = 'scene-1';
      const assetKey: AssetKey = 'scene_start_frame';
      
      // Set initial state
      act(() => {
        result.current.setAssets(entityId, {
          [assetKey]: {
            head: 1,
            best: 1,
            versions: [{ version: 1, data: 'url1', type: 'image', metadata: {}, createdAt: new Date() }]
          }
        });
      });

      // Merge registry with conflicting key
      const newRegistry = {
        [assetKey]: {
          head: 2,
          best: 2,
          versions: [
            { version: 1, data: 'url1', type: 'image', metadata: {}, createdAt: new Date() },
            { version: 2, data: 'url2', type: 'image', metadata: {}, createdAt: new Date() }
          ]
        }
      };

      act(() => {
        result.current.mergeAssets(entityId, newRegistry);
      });

      const assets = result.current.assets.get(entityId);
      expect(assets?.[assetKey]).toEqual(newRegistry[assetKey]);
    });
  });

  describe('asset normalization', () => {
    it('should normalize project assets correctly', () => {
      const { result } = renderHook(() => useStore());
      
      const project = {
        id: 'proj-1',
        assets: {
          storyboard: {
            head: 1,
            best: 1,
            versions: [{ version: 1, data: 'story', type: 'text', metadata: {}, createdAt: new Date() }]
          }
        },
        scenes: [
          {
            id: 'scene-1',
            assets: {
              scene_start_frame: {
                head: 1,
                best: 1,
                versions: [{ version: 1, data: 'url', type: 'image', metadata: {}, createdAt: new Date() }]
              }
            }
          }
        ],
        characters: [],
        locations: []
      };

      act(() => {
        result.current.setProject(project as any);
      });

      // Project should have no assets property
      expect(result.current.project?.assets).toBeUndefined();
      
      // Assets should be in the map
      expect(result.current.assets.get('proj-1')?.['storyboard']).toBeDefined();
      expect(result.current.assets.get('scene-1')?.['scene_start_frame']).toBeDefined();
      
      // Scene should have no assets property
      expect(result.current.project?.scenes[0]?.assets).toBeUndefined();
    });
  });

  describe('optimistic updates', () => {
    it('should track optimistic updates correctly', () => {
      const { result } = renderHook(() => useStore());
      
      const updateId = 'update-1';
      const entityId = 'scene-1';
      const assetKey: AssetKey = 'scene_start_frame';
      
      act(() => {
        result.current.addOptimisticUpdate({
          id: updateId,
          entityId,
          assetKey,
          version: 2,
        });
      });

      expect(result.current.optimisticUpdates.has(updateId)).toBe(true);
      const update = result.current.optimisticUpdates.get(updateId);
      expect(update).toMatchObject({
        id: updateId,
        entityId,
        assetKey,
        version: 2,
      });
      expect(update?.timestamp).toBeTypeOf('number');
    });

    it('should confirm optimistic updates', () => {
      const { result } = renderHook(() => useStore());
      
      const updateId = 'update-1';
      
      // Add update
      act(() => {
        result.current.addOptimisticUpdate({
          id: updateId,
          entityId: 'scene-1',
          assetKey: 'scene_start_frame',
          version: 2,
        });
      });

      expect(result.current.optimisticUpdates.has(updateId)).toBe(true);

      // Confirm update
      act(() => {
        result.current.confirmOptimisticUpdate(updateId);
      });

      expect(result.current.optimisticUpdates.has(updateId)).toBe(false);
    });

    it('should revert optimistic updates', () => {
      const { result } = renderHook(() => useStore());
      
      const updateId = 'update-1';
      
      // Add update
      act(() => {
        result.current.addOptimisticUpdate({
          id: updateId,
          entityId: 'scene-1',
          assetKey: 'scene_start_frame',
          version: 2,
        });
      });

      expect(result.current.optimisticUpdates.has(updateId)).toBe(true);

      // Revert update
      act(() => {
        result.current.revertOptimisticUpdate(updateId);
      });

      expect(result.current.optimisticUpdates.has(updateId)).toBe(false);
    });
  });
});
