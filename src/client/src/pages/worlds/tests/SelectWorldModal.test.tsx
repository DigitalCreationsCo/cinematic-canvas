/** @vitest-environment happy-dom */
import { createMockWorld } from "#shared/mocks/mock-world.js";

vi.mock("#client/components/ui/button.js", () => ({
  Button: ({ children, onClick, variant, className }: any) => (
    <button
      type="button"
      onClick={onClick}
      className={className}
      data-testid="button"
      data-variant={variant}
    >
      {children}
    </button>
  ),
}));

vi.mock("@tanstack/react-query", async () => {
  return {
    QueryClient: vi.fn(),
    useQuery: vi.fn().mockReturnValue({
      data: {
        worlds: [],
      },
      error: null,
      isLoading: false,
    }),
  };
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";

describe("SelectWorldModal", () => {
  const mockOnBack = vi.fn();
  const mockOnSelectWorld = vi.fn();
  const mockOnShowProjects = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders correctly when open", async () => {
    vi.mocked(useQuery).mockReturnValue({
      data: {
        worlds: [
          createMockWorld({
            name: "Cyberpunk City",
            description: "A futuristic metropolis",
          }),
          createMockWorld({ name: "Fantasy Realm", description: "Magical lands" }),
        ],
      },
      isLoading: false,
      error: null,
    } as any);

    const { SelectWorldModal } = await import("#client/pages/worlds/SelectWorldModal.js");

    render(
      <SelectWorldModal
        isOpen={true}
        onBack={mockOnBack}
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />,
    );

    expect(screen.getByTestId("select-world-modal")).toBeInTheDocument();
    expect(screen.getByText("Your Worlds")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Select an existing world to continue building or view its projects.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Cyberpunk City")).toBeInTheDocument();
    expect(screen.getByText("Fantasy Realm")).toBeInTheDocument();
    expect(screen.getByText("A futuristic metropolis")).toBeInTheDocument();
  });

  it("does not render when closed", async () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { worlds: [] },
      isLoading: false,
      error: null,
    } as any);

    const { SelectWorldModal } = await import("#client/pages/worlds/SelectWorldModal.js");

    render(
      <SelectWorldModal
        isOpen={false}
        onBack={mockOnBack}
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />,
    );
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  it("calls onBack when back button is clicked", async () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { worlds: [] },
      isLoading: false,
      error: null,
    } as any);

    const { SelectWorldModal } = await import("#client/pages/worlds/SelectWorldModal.js");

    render(
      <SelectWorldModal
        isOpen={true}
        onBack={mockOnBack}
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />,
    );

    fireEvent.click(screen.getByTestId("dialog-close"));
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it("shows loading state when worlds are loading", async () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { worlds: [] },
      isLoading: true,
      error: null,
    } as any);

    const { SelectWorldModal } = await import("#client/pages/worlds/SelectWorldModal.js");

    render(
      <SelectWorldModal
        isOpen={true}
        onBack={mockOnBack}
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />,
    );

    expect(screen.getByTestId("icon-loader")).toBeInTheDocument();
  });

  it("shows error state when worlds fail to load", async () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { worlds: [] },
      isLoading: false,
      error: new Error("Error"),
    } as any);

    const { SelectWorldModal } = await import("#client/pages/worlds/SelectWorldModal.js");

    render(
      <SelectWorldModal
        isOpen={true}
        onBack={mockOnBack}
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />,
    );

    expect(
      screen.getByText("Failed to load worlds. Please try again."),
    ).toBeInTheDocument();
  });

  it("renders worlds correctly", async () => {
    vi.mocked(useQuery).mockReturnValue({
      data: {
        worlds: [
          {
            id: "world-1",
            name: "Cyberpunk City",
            description: "A futuristic metropolis",
          },
          { id: "world-2", name: "Fantasy Realm", description: "Magical lands" },
        ],
      },
      isLoading: false,
      error: null,
    } as any);

    const { SelectWorldModal } = await import("#client/pages/worlds/SelectWorldModal.js");

    render(
      <SelectWorldModal
        isOpen={true}
        onBack={mockOnBack}
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />,
    );

    expect(screen.getByText("Cyberpunk City")).toBeInTheDocument();
    expect(screen.getByText("Fantasy Realm")).toBeInTheDocument();
    expect(screen.getByText("A futuristic metropolis")).toBeInTheDocument();
    expect(screen.getByText("Magical lands")).toBeInTheDocument();
  });
});
