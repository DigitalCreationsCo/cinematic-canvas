// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LocationDetailPanel from "./LocationDetailPanel";
import { useLocationAssets } from "../store/useAssetStore.js";

// Mock store and api
vi.mock("../store/useAssetStore.js", () => ({
    useAssetStore: vi.fn(() => ({
        setAssets: vi.fn(),
    })),
    useLocationAssets: vi.fn(),
}));

vi.mock("#/lib/api.js", () => ({
    patchAsset: vi.fn(),
}));

vi.mock("#/hooks/use-toast.js", () => ({
    useToast: () => ({ toast: vi.fn() }),
}));

// Mock child components
vi.mock("./FramePreview.js", () => ({
    default: ({ title }: any) => <div data-testid="frame-preview">{ title }</div>,
}));

vi.mock("./AssetHistoryPicker.js", () => ({
    AssetHistoryPicker: () => null,
}));

describe("LocationDetailPanel", () => {
    const mockLocation = {
        id: "loc-1",
        name: "Test Location",
        type: "Forest",
        mood: "Spooky",
        architecture: [ "Trees" ],
        naturalElements: [ "Bushes" ],
        manMadeObjects: [ "Path" ],
        state: {
            timeOfDay: "Night",
            weather: "Foggy",
            season: "autumn",
            groundCondition: { wetness: "damp" },
            lighting: { type: "moonlight", quality: { softness: "soft" }, source: "moon", colorTemp: "cool" },
        },
        lightingConditions: { type: "moonlight", quality: { softness: "soft" } } // Fallback/base
    } as any;

    beforeEach(() => {
        vi.mocked(useLocationAssets).mockReturnValue({
            bestAssets: {},
            assets: {},
        } as any);
    });

    it("renders location details correctly", () => {
        render(<LocationDetailPanel location={ mockLocation } projectId="proj-1" />);

        expect(screen.getAllByText("Test Location")[ 0 ]).toBeInTheDocument();
        expect(screen.getAllByText("Forest")[ 0 ]).toBeInTheDocument();

        // Check attributes
        expect(screen.getAllByText("Spooky")[ 0 ]).toBeInTheDocument();
        expect(screen.getAllByText("Trees")[ 0 ]).toBeInTheDocument();
    });

    it("renders navigation buttons enabled when props provided", () => {
        const onNext = vi.fn();
        const onPrev = vi.fn();
        render(
            <LocationDetailPanel
                location={ mockLocation }
                projectId="proj-1"
                onNext={ onNext }
                onPrevious={ onPrev }
                hasNext={ true }
                hasPrevious={ true }
            />
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
                location={ mockLocation }
                projectId="proj-1"
                hasNext={ false }
                hasPrevious={ false }
            />
        );

        expect(screen.getByTitle("Next Location")).toBeDisabled();
        expect(screen.getByTitle("Previous Location")).toBeDisabled();
    });
});
