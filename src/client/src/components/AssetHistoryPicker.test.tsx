/** @vitest-environment happy-dom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssetHistoryPicker } from "#client/components/AssetHistoryPicker.js";
import { render, screen, fireEvent } from "@testing-library/react";
import { useAssetStore } from "#client/store/useAssetStore.js";
import { getAllAssetVersions } from "#shared/utils/assets.utils.js";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

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
});
