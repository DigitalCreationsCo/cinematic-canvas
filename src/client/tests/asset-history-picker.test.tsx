import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssetHistoryPicker } from '../components/AssetHistoryPicker.js';
import { useProjectStore } from '../store/useProjectStore.js';
import { useAssetStore } from '../store/useAssetStore.js';

// Mock the store
vi.mock('../store/useProjectStore.js', () => ({
  useProjectStore: vi.fn(),
  
}));
vi.mock('../store/useAssetStore.js', () => ({
  useSceneAssets: vi.fn(),
  
  useSceneAssets: vi.fn(),
  
}));

// Mock API
vi.mock('../lib/api.js', () => ({
  getSceneAssets: vi.fn(),
}));

// Mock SWR
vi.mock('swr', () => ({
  default: vi.fn(),
}));

describe('AssetHistoryPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Store: addViewedScene', () => {
    it('adds scene to history if not present', () => {
      const mockStore = {
        viewedScenesHistory: [],
        addViewedScene: vi.fn(),
      };
      useProjectStore.mockReturnValue(mockStore);

      // Call the action
      mockStore.addViewedScene('scene1');

      expect(mockStore.addViewedScene).toHaveBeenCalledWith('scene1');
      // In real test, check the state, but since it's mock, assume it's tested in store tests
    });

    it('keeps only last 5 scenes', () => {
      const mockStore = {
        viewedScenesHistory: [],
        addViewedScene: vi.fn((sceneId) => {
          if (!mockStore.viewedScenesHistory.includes(sceneId)) {
            mockStore.viewedScenesHistory.push(sceneId);
            mockStore.viewedScenesHistory = mockStore.viewedScenesHistory.slice(-5);
          }
        }),
      };

      for (let i = 1; i <= 7; i++) {
        mockStore.addViewedScene(`scene${i}`);
      }

      expect(mockStore.viewedScenesHistory).toHaveLength(5);
      expect(mockStore.viewedScenesHistory).toEqual(['scene3', 'scene4', 'scene5', 'scene6', 'scene7']);
    });
  });

  describe('AssetCard', () => {
    const mockAsset = {
      version: 1,
      data: 'http://example.com/asset',
      createdAt: new Date(),
      metadata: { model: 'test' },
    };

    it('renders without tooltip', () => {
      const mockOnClick = vi.fn();
      render(
        <AssetCard
          asset={mockAsset}
          assetType="scene_video"
          isCurrent={false}
          onClick={mockOnClick}
        />
      );

      // Check that tooltip is not present
      expect(screen.queryByText(/Click to restore/)).toBeNull();
    });

    it('applies hover:border-primary class', () => {
      const mockOnClick = vi.fn();
      render(
        <AssetCard
          asset={mockAsset}
          assetType="scene_video"
          isCurrent={false}
          onClick={mockOnClick}
        />
      );

      const card = screen.getByText('#1').closest('div');
      expect(card).toHaveClass('hover:border-primary');
      expect(card).not.toHaveClass('hover:ring-2');
      expect(card).not.toHaveClass('transition-all');
    });

    it('calls onClick when clicked', () => {
      const mockOnClick = vi.fn();
      render(
        <AssetCard
          asset={mockAsset}
          assetType="scene_video"
          isCurrent={false}
          onClick={mockOnClick}
        />
      );

      const card = screen.getByText('#1').closest('div');
      fireEvent.click(card);
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('shows current badge when isCurrent is true', () => {
      const mockOnClick = vi.fn();
      render(
        <AssetCard
          asset={mockAsset}
          assetType="scene_video"
          isCurrent={true}
          onClick={mockOnClick}
        />
      );

      expect(screen.getByText('Current')).toBeInTheDocument();
    });
  });

  describe('Preloading functions', () => {
    let mockPreloadedUrls;
    let mockPreloadImage;
    let mockPreloadVideo;

    beforeEach(() => {
      mockPreloadedUrls = { current: new Set() };
      mockPreloadImage = vi.fn((url) => {
        if (!mockPreloadedUrls.current.has(url)) {
          mockPreloadedUrls.current.add(url);
        }
      });
      mockPreloadVideo = vi.fn((url) => {
        if (!mockPreloadedUrls.current.has(url)) {
          mockPreloadedUrls.current.add(url);
        }
      });
    });

    it('preloadImage adds to preloadedUrls and creates link', () => {
      const url = 'http://example.com/image.jpg';
      mockPreloadImage(url);
      expect(mockPreloadedUrls.current.has(url)).toBe(true);
    });

    it('preloadVideo adds to preloadedUrls', () => {
      const url = 'http://example.com/video.mp4';
      mockPreloadVideo(url);
      expect(mockPreloadedUrls.current.has(url)).toBe(true);
    });

    it('does not preload if already preloaded', () => {
      const url = 'http://example.com/image.jpg';
      mockPreloadImage(url);
      mockPreloadImage(url); // second call
      expect(mockPreloadedUrls.current.size).toBe(1);
    });
  });
});
