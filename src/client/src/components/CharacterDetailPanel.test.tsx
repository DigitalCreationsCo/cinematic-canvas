// @vitest-environment jsdom
import { createMockCharacter } from "#shared/mocks/mock-character.js";

import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CharacterDetailPanel from "#client/components/CharacterDetailPanel.js";
import { useCharacterAssets } from "#client/store/useAssetStore.js";
import { generateCharacterImage } from "#client/lib/api.js";
import { usePipelineStore } from "#client/store/usePipelineStore.js";

vi.mock("#client/store/useAssetStore.js", () => ({
  useAssetStore: vi.fn(() => ({
    setAssets: vi.fn(),
  })),
  useCharacterAssets: vi.fn(),
}));

vi.mock("#client/lib/api.js", () => ({
  patchAsset: vi.fn(),
  generateCharacterImage: vi.fn(),
  generateLocationImage: vi.fn(),
}));

vi.mock("#client/components/ui/tooltip.js", () => ({
  Tooltip: ({ children }) => <div>{children}</div>,
  TooltipContent: ({ children }) => <div>{children}</div>,
  TooltipTrigger: ({ children }) => <div>{children}</div>,
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

describe("CharacterDetailPanel", () => {
  const mockCharacter = createMockCharacter({
    id: "char-1",
    name: "Test Character",
    physicalTraits: {
      age: "30",
      build: "Athletic",
    },
  });

  beforeEach(() => {
    vi.mocked(useCharacterAssets).mockReturnValue({
      bestAssets: {},
      assets: {},
    } as any);
  });

  it("renders character details correctly", () => {
    render(<CharacterDetailPanel character={mockCharacter} projectId="proj-1" />);

    expect(screen.getAllByText("Test Character")[0]).toHaveProperty(
      "textContent",
      "Test Character",
    );

    const panel = screen.getByTestId(`panel-character-detail-char-1`);
    expect(
      within(panel).getByRole("heading", { name: /test character/i }),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/30 • Athletic/i)).toBeInTheDocument();
    const traitsCard = within(panel).getByText("Physical Traits").closest(".card"); // Or use a test-id
    expect(within(panel).getByText(/Hair:/i)).toBeInTheDocument();
    expect(
      within(panel).getByText(mockCharacter.physicalTraits.hair),
    ).toBeInTheDocument();
    mockCharacter.physicalTraits.clothing.forEach((item) => {
      expect(within(panel).getByText(item)).toBeInTheDocument();
    });
  });

  it("renders navigation buttons enabled when props provided", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    render(
      <CharacterDetailPanel
        character={mockCharacter}
        projectId="proj-1"
        onNext={onNext}
        onPrevious={onPrev}
        hasNext={true}
        hasPrevious={true}
      />,
    );

    const nextBtn = screen.getByTitle("Next Character");
    const prevBtn = screen.getByTitle("Previous Character");

    expect(nextBtn).toHaveProperty("disabled", false);
    expect(prevBtn).toHaveProperty("disabled", false);

    fireEvent.click(nextBtn);
    expect(onNext).toHaveBeenCalled();

    fireEvent.click(prevBtn);
    expect(onPrev).toHaveBeenCalled();
  });

  it("disables navigation buttons when hasNext/hasPrevious are false", () => {
    render(
      <CharacterDetailPanel
        character={mockCharacter}
        projectId="proj-1"
        hasNext={false}
        hasPrevious={false}
      />,
    );

    expect(screen.queryByTitle("Next Location")).toBeNull();
    expect(screen.queryByTitle("Previous Location")).toBeNull();
  });

  it("handles character image generation", async () => {
    const generateCharacterImageMock = vi.mocked(generateCharacterImage);
    generateCharacterImageMock.mockResolvedValue({
      message: "Character created. Image generation queued.",
      characterIds: ["char-1"],
    });

    const pushEventMock = vi.mocked(usePipelineStore((state) => state.pushEvent));

    render(<CharacterDetailPanel character={mockCharacter} projectId="proj-1" />);

    const regenerateBtn = screen.getByTestId("button-generate");
    fireEvent.click(regenerateBtn);

    await vi.waitFor(() => {
      expect(generateCharacterImageMock).toHaveBeenCalledWith([
        expect.objectContaining({
          characterId: "char-1",
        }),
      ]);
    });

    expect(pushEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        message: "Character image generation queued.",
      }),
    );
  });
});
