// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CharacterDetailPanel from "./CharacterDetailPanel";
import { useCharacterAssets } from "../store/useAssetStore.js";
import { patchAsset } from "#/lib/api.js";

// Mock store and api
vi.mock("../store/useAssetStore.js", () => ({
    useAssetStore: vi.fn(() => ({
        setAssets: vi.fn(),
    })),
    useCharacterAssets: vi.fn(),
}));

vi.mock("#/lib/api.js", () => ({
    patchAsset: vi.fn(),
}));

vi.mock("#/store/usePipelineStore.js", () => ({
    usePipelineStore: () => ({
        pushEvent: vi.fn(),
    }),
}));

// Mock child components
vi.mock("./FramePreview.js", () => ({
    default: ({ title, onRegenerate }: any) => (
        <div data-testid="frame-preview">
            { title }
            <button onClick={ onRegenerate } data-testid="regenerate-btn">Regenerate</button>
        </div>
    ),
}));

vi.mock("./AssetHistoryPicker.js", () => ({
    AssetHistoryPicker: ({ isOpen }: any) => (
        isOpen ? <div data-testid="asset-history-picker">History Picker</div> : null
    ),
}));

describe("CharacterDetailPanel", () => {
    const mockCharacter = {
        id: "char-1",
        name: "Test Character",
        age: "30",
        physicalTraits: {
            hair: "Brown",
            clothing: [ "Shirt", "Pants" ],
            distinctiveFeatures: [ "Scar" ],
            build: "Athletic",
            ethnicity: "Human",
            accessories: [],
        },
        state: {
            emotionalState: "Happy",
            dirtLevel: "clean",
            exhaustionLevel: "fresh",
            costumeCondition: { tears: [], stains: [], wetness: "dry" as any, damage: [] },
            hairCondition: { messiness: "pristine" as any, wetness: "dry" as any },
        }
    } as any;

    beforeEach(() => {
        vi.mocked(useCharacterAssets).mockReturnValue({
            bestAssets: {},
            assets: {},
        } as any);
    });

    it("renders character details correctly", () => {
        render(<CharacterDetailPanel character={ mockCharacter } projectId="proj-1" />);

        expect(screen.getAllByText("Test Character")[ 0 ]).toBeInTheDocument();
        expect(screen.getAllByText(/30/)[ 0 ]).toBeInTheDocument();
        expect(screen.getAllByText(/Athletic/)[ 0 ]).toBeInTheDocument();

        // Check tabs content (default is details)
        // "Physical Traits" is in a CardTitle
        expect(screen.getAllByText("Physical Traits")[ 0 ]).toBeInTheDocument();
        // Check physical traits in default tab
        expect(screen.getAllByText("Brown")[ 0 ]).toBeInTheDocument();
    });

    it("renders navigation buttons enabled when props provided", () => {
        const onNext = vi.fn();
        const onPrev = vi.fn();
        render(
            <CharacterDetailPanel
                character={ mockCharacter }
                projectId="proj-1"
                onNext={ onNext }
                onPrevious={ onPrev }
                hasNext={ true }
                hasPrevious={ true }
            />
        );

        const nextBtn = screen.getByTitle("Next Character");
        const prevBtn = screen.getByTitle("Previous Character");

        expect(nextBtn).toBeEnabled();
        expect(prevBtn).toBeEnabled();

        fireEvent.click(nextBtn);
        expect(onNext).toHaveBeenCalled();

        fireEvent.click(prevBtn);
        expect(onPrev).toHaveBeenCalled();
    });

    it("disables navigation buttons when hasNext/hasPrevious are false", () => {
        render(
            <CharacterDetailPanel
                character={ mockCharacter }
                projectId="proj-1"
                hasNext={ false }
                hasPrevious={ false }
            />
        );

        expect(screen.getByTitle("Next Character")).toBeDisabled();
        expect(screen.getByTitle("Previous Character")).toBeDisabled();
    });
});
