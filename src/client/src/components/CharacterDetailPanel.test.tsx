// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CharacterDetailPanel from "./CharacterDetailPanel";
import { useCharacterAssets } from "../store/useAssetStore.js";
import { patchAsset, generateCharacterImage } from "../lib/api.js";
import { usePipelineStore } from "../store/usePipelineStore.js";

// Mock store and api
vi.mock("../store/useAssetStore.js", () => ({
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

vi.mock("#client/store/usePipelineStore.js", () => ({
    usePipelineStore: () => ({
        pushEvent: vi.fn(),
    }),
}));

describe("CharacterDetailPanel", () => {
    const mockCharacter = {
        id: "char-1",
        name: "Test Character",
        physicalTraits: {
            // age lives inside physicalTraits — matches character.physicalTraits.age access in panel
            age: "30",
            hair: "Brown",
            clothing: ["Shirt", "Pants"],
            distinctiveFeatures: ["Scar"],
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
        render(<CharacterDetailPanel character={mockCharacter} projectId="proj-1" />);

        expect(screen.getAllByText("Test Character")[0]).toHaveProperty("textContent", "Test Character");
        expect(screen.getAllByText(/30/)[0]).toHaveProperty("textContent", "30");
        expect(screen.getAllByText(/Athletic/)[0]).toHaveProperty("textContent", "Athletic");

        // Check tabs content (default is details)
        // "Physical Traits" is in a CardTitle
        expect(screen.getAllByText("Physical Traits")[0]).toBeInTheDocument();
        // Check physical traits in default tab
        expect(screen.getAllByText("Brown")[0]).toBeInTheDocument();
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
            />
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
            />
        );

        expect(screen.getByTitle("Next Character")).toHaveProperty("disabled", true);
        expect(screen.getByTitle("Previous Character")).toHaveProperty("disabled", true);
    });

    it("handles character image generation", async () => {
        const generateCharacterImageMock = vi.mocked(generateCharacterImage);
        // Matches the new 202 async response shape from the refactored server route
        generateCharacterImageMock.mockResolvedValue({
            message: "Character created. Image generation queued.",
            characterId: "char-1",
        });

        const pushEventMock = vi.fn();
        vi.mocked(usePipelineStore).mockReturnValue({ pushEvent: pushEventMock } as any);

        render(<CharacterDetailPanel character={mockCharacter} projectId="proj-1" />);

        // Click the regenerate button
        const regenerateBtn = screen.getByTitle("Regenerate");
        fireEvent.click(regenerateBtn);

        // Wait for the async operation to complete
        await vi.waitFor(() => {
            expect(generateCharacterImageMock).toHaveBeenCalledWith(
                "proj-1",
                "Test Character",
                "30 year old Athletic with Brown hair, Shirt, Pants"
            );
        });

        // Verify the queued success message was pushed
        expect(pushEventMock).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "success",
                message: "Character image generation queued.",
            })
        );
    });
});