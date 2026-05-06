// @vitest-environment jsdom
import { createMockLocation } from "#shared/mocks/mock-location.js";

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LocationDetailPanel from "#client/components/LocationDetailPanel.js";
import { useLocationAssets } from "#client/store/useAssetStore.js";
import { generateLocationImage } from "#client/lib/api.js";
import { usePipelineStore } from "#client/store/usePipelineStore.js";

vi.mock("#client/store/useAssetStore.js", () => ({
  useAssetStore: vi.fn(() => ({
    setAssets: vi.fn(),
  })),
  useLocationAssets: vi.fn(),
}));

vi.mock("#client/lib/api.js", () => ({
  patchAsset: vi.fn(),
  generateCharacterImage: vi.fn(),
  generateLocationImage: vi.fn(),
}));

const pushEventSpy = vi.fn();
vi.mock("#client/store/usePipelineStore.js", () => ({
  usePipelineStore: vi.fn((selector) => {
    const mockState = {
      pushEvent: pushEventSpy,
    };
    return selector ? selector(mockState) : mockState;
  }),
}));

vi.mock("#client/components/AssetHistoryPicker.js", () => ({
  AssetHistoryPicker: () => null,
}));

vi.mock("#client/components/ui/tooltip.js", () => ({
  Tooltip: ({ children }) => <div>{children}</div>,
  TooltipContent: ({ children }) => <div>{children}</div>,
  TooltipTrigger: ({ children }) => <div>{children}</div>,
}));

describe("LocationDetailPanel", () => {
  const mockLocation = createMockLocation({
    id: "loc-1",
    name: "Test Location",
    type: "Forest",
    mood: "Spooky",
    architecture: ["Trees"],
    naturalElements: ["Bushes"],
    manMadeObjects: ["Path"],
  });

  beforeEach(() => {
    vi.mocked(useLocationAssets).mockReturnValue({
      bestAssets: {},
      assets: {},
    } as any);
  });

  it("renders location details correctly", () => {
    render(<LocationDetailPanel location={mockLocation} projectId="proj-1" />);

    expect(screen.getAllByText("Test Location")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Forest")[0]).toBeInTheDocument();

    // Check attributes
    expect(screen.getAllByText("Spooky")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Trees")[0]).toBeInTheDocument();
  });

  it("renders navigation buttons enabled when props provided", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    render(
      <LocationDetailPanel
        location={mockLocation}
        projectId="proj-1"
        onNext={onNext}
        onPrevious={onPrev}
        hasNext={true}
        hasPrevious={true}
      />,
    );

    const nextBtn = screen.getByTitle("Next Location");
    const prevBtn = screen.getByTitle("Previous Location");

    expect(nextBtn).toBeEnabled();
    expect(prevBtn).toBeEnabled();

    fireEvent.click(nextBtn);
    expect(onNext).toHaveBeenCalled();

    fireEvent.click(prevBtn);
    expect(onPrev).toHaveBeenCalled();
  });

  it("disables navigation buttons when hasNext/hasPrevious are false", () => {
    render(
      <LocationDetailPanel
        location={mockLocation}
        projectId="proj-1"
        hasNext={false}
        hasPrevious={false}
      />,
    );

    expect(screen.queryByTitle("Next Location")).toBeNull();
    expect(screen.queryByTitle("Previous Location")).toBeNull();
  });

  it("handles location image generation", async () => {
    const generateLocationImageMock = vi.mocked(generateLocationImage);
    generateLocationImageMock.mockResolvedValue({
      message: "",
      locationIds: [],
    });

    const pushEventMock = vi.mocked(usePipelineStore((state) => state.pushEvent));

    render(<LocationDetailPanel location={mockLocation} projectId="proj-1" />);

    const regenerateBtn = screen.getByTestId("button-generate");
    fireEvent.click(regenerateBtn);

    await vi.waitFor(() => {
      expect(generateLocationImageMock).toHaveBeenCalledWith([
        expect.objectContaining({
          locationId: "loc-1",
          prompt: "Forest location with Spooky mood, featuring Bushes and Path",
        }),
      ]);
    });

    expect(pushEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        message: "Location image generation queued.",
      }),
    );
  });
});
