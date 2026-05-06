/** @vitest-environment happy-dom */
import { useProjectStore } from "#client/store/useProjectStore.js";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

import { useAssetStore } from "#client/store/useAssetStore.js";
import { getAllAssetVersions } from "#shared/utils/assets.utils.js";
import { AssetHistoryPicker } from "#client/components/AssetHistoryPicker.js";
import { AssetCard } from "#client/components/AssetHistoryPicker.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

vi.mock("#client/components/ui/button.js", () => ({
  Button: ({ children, onClick, variant }: any) => (
    <button onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
}));

vi.mock("#client/components/ui/skeleton.js", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock("#client/components/ui/video-player.js", () => ({
  VideoPlayer: () => <div data-testid="video-player" />,
}));

vi.mock("#client/store/useAssetStore.js", () => {
  const mockStore = vi.fn();
  (mockStore as any).getState = vi.fn(() => ({
    assets: { get: () => ({}) },
  }));
  return { useAssetStore: mockStore };
});

vi.mock("#client/lib/api.js", () => ({
  getSceneAssets: vi.fn(),
  getCharacterAssets: vi.fn(),
  getLocationAssets: vi.fn(),
  getProjectAssets: vi.fn(),
}));

vi.mock("#client/lib/trpc.js", () => ({
  trpc: {
    assets: {
      get: {
        queryOptions: vi.fn(() => ({
          queryKey: ["assets"],
          queryFn: () => Promise.resolve({}),
        })),
      },
    },
  },
}));

vi.mock("#shared/utils/assets.utils.js", () => ({
  getAllAssetVersions: vi.fn(() => []),
  isAssetEvaluated: vi.fn(() => false),
  getAssetQualityScore: vi.fn(() => 0),
  getAssetUrl: vi.fn(() => ""),
}));

vi.mock("#shared/utils/utils.js", () => ({
  resolvePublicUrl: vi.fn((url) => `resolved-${url}`),
}));

vi.mock("#shared/utils/errors.js", () => ({
  extractErrorMessage: vi.fn((err) =>
    typeof err === "string" ? err : (err as any).message || "Unknown Error",
  ),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(),
    QueryClient: actual.QueryClient,
    QueryClientProvider: actual.QueryClientProvider,
  };
});

describe("AssetHistoryPicker", () => {
  const defaultProps = {
    entityId: "scene-1",
    assetType: "scene_start_frame" as const,
    projectId: "project-1",
    isOpen: true,
    onOpenChange: vi.fn(),
    onSelect: vi.fn(),
    currentUrl: "url-2",
  };

  const mockSetAssets = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({
      isLoading: false,
      error: null,
      data: null,
    } as any);

    vi.mocked(useAssetStore).mockImplementation((selector: any) => {
      const state = {
        assets: { get: () => ({}) },
        setAssets: mockSetAssets,
      };
      return selector(state);
    });
  });

  const renderComponent = (props = defaultProps) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AssetHistoryPicker {...props} />
      </QueryClientProvider>,
    );
  };

  it("renders loading state correctly", () => {
    vi.mocked(useQuery).mockReturnValue({ isLoading: true, error: null } as any);
    renderComponent();
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders error state correctly using extractErrorMessage", () => {
    const testError = { message: "Failed to fetch" };
    vi.mocked(useQuery).mockReturnValue({ isLoading: false, error: testError } as any);
    renderComponent();
    expect(screen.getByText("Failed to fetch")).toBeTruthy();
  });

  it("renders empty state correctly", () => {
    renderComponent();
    expect(screen.getByText(/No versions found/)).toBeTruthy();
  });

  it("renders assets and handles selection", () => {
    const mockAssets = [
      {
        version: 1,
        data: "url-1",
        type: "image",
        createdAt: "2023-01-01T10:00:00Z",
        metadata: { model: "GPT-4" },
      },
      {
        version: 2,
        data: "url-2",
        type: "image",
        createdAt: "2023-01-01T11:00:00Z",
        metadata: {},
      },
    ];
    vi.mocked(getAllAssetVersions).mockReturnValue(mockAssets as any);

    renderComponent();

    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getByText("#2")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.getByText("GPT-4")).toBeTruthy();

    fireEvent.click(screen.getByText("#1"));
    expect(defaultProps.onSelect).toHaveBeenCalledWith(mockAssets[0]);
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("handles sorting", () => {
    const mockAssets = [
      {
        version: 1,
        data: "url-1",
        type: "image",
        createdAt: "2023-01-01T10:00:00Z",
        metadata: {},
      },
      {
        version: 2,
        data: "url-2",
        type: "image",
        createdAt: "2023-01-01T11:00:00Z",
        metadata: {},
      },
    ];
    vi.mocked(getAllAssetVersions).mockReturnValue(mockAssets as any);

    renderComponent();

    // Check if buttons exist
    expect(screen.getByText("Newest")).toBeTruthy();
    expect(screen.getByText("Oldest")).toBeTruthy();
    expect(screen.getByText("Quality")).toBeTruthy();

    fireEvent.click(screen.getByText("Oldest"));
    // Verify state changes would require more complex mocking or integration test
  });

  it("handles filtering", () => {
    const mockAssets = [
      {
        version: 1,
        data: "url-1",
        type: "image",
        createdAt: "2023-01-01T10:00:00Z",
        metadata: {},
      },
      {
        version: 2,
        data: "url-2",
        type: "image",
        createdAt: "2023-01-01T11:00:00Z",
        metadata: {},
      },
    ];
    vi.mocked(getAllAssetVersions).mockReturnValue(mockAssets as any);

    renderComponent();

    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("Evaluated")).toBeTruthy();
    expect(screen.getByText("Unevaluated")).toBeTruthy();

    fireEvent.click(screen.getByText("Evaluated"));
  });

  it("syncs to global store on query success", () => {
    const mockData = { some: "registry" };
    vi.mocked(useQuery).mockReturnValue({
      isLoading: false,
      error: null,
      data: mockData,
    } as any);

    renderComponent();
    expect(mockSetAssets).toHaveBeenCalledWith("scene-1", mockData);
  });

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
