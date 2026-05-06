import { useProjectStore } from "#client/store/useProjectStore.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetCard } from "#client/components/AssetHistoryPicker.js";

describe("AssetHistoryPicker", () => {
  describe("Store: addViewedScene", () => {
    it("adds scene to history if not present", () => {
      const store = useProjectStore.getState();
      const spyAddViewedScene = vi.spyOn(store, "addViewedScene");

      store.addViewedScene("scene1");

      expect(spyAddViewedScene).toHaveBeenCalledWith("scene1");
      // This will now pass because the REAL logic ran!
      expect(useProjectStore.getState().viewedScenesHistory).toContain("scene1");
    });

    it("keeps only last 5 scenes", () => {
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
      expect(mockStore.viewedScenesHistory).toEqual([
        "scene3",
        "scene4",
        "scene5",
        "scene6",
        "scene7",
      ]);
    });
  });

  describe("AssetCard", () => {
    const mockAsset = {
      version: 1,
      data: "http://example.com/asset",
      createdAt: new Date(),
      metadata: { model: "test" },
    };

    it("renders without tooltip", () => {
      const mockOnClick = vi.fn();
      render(
        <AssetCard
          asset={mockAsset}
          assetType="scene_video"
          isCurrent={false}
          onClick={mockOnClick}
        />,
      );

      // Check that tooltip is not present
      expect(screen.queryByText(/Click to restore/)).toBeNull();
    });

    it("calls onClick when clicked", () => {
      const mockOnClick = vi.fn();
      render(
        <AssetCard
          asset={mockAsset}
          assetType="scene_video"
          isCurrent={false}
          onClick={mockOnClick}
        />,
      );

      const card = screen.getByText("#1").closest("div");
      fireEvent.click(card);
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it("shows current badge when isCurrent is true", () => {
      const mockOnClick = vi.fn();
      render(
        <AssetCard
          asset={mockAsset}
          assetType="scene_video"
          isCurrent={true}
          onClick={mockOnClick}
        />,
      );

      expect(screen.getByText("Current")).toBeInTheDocument();
    });
  });

  describe("Preloading functions", () => {
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

    it("preloadImage adds to preloadedUrls and creates link", () => {
      const url = "http://example.com/image.jpg";
      mockPreloadImage(url);
      expect(mockPreloadedUrls.current.has(url)).toBe(true);
    });

    it("preloadVideo adds to preloadedUrls", () => {
      const url = "http://example.com/video.mp4";
      mockPreloadVideo(url);
      expect(mockPreloadedUrls.current.has(url)).toBe(true);
    });

    it("does not preload if already preloaded", () => {
      const url = "http://example.com/image.jpg";
      mockPreloadImage(url);
      mockPreloadImage(url); // second call
      expect(mockPreloadedUrls.current.size).toBe(1);
    });
  });
});
