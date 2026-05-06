import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorldBuilder } from "#client/pages/worlds/WorldBuilder.js";
import { createMockWorld } from "#shared/mocks/mock-world.ts";

vi.mock("#client/components/Header.tsx", () => {
  return {
    default: vi.fn(),
  };
});

vi.mock("@tanstack/react-query", () => ({
  QueryClient: vi.fn(),
  useQuery: vi.fn().mockReturnValue({
    data: {
      worlds: [createMockWorld(), createMockWorld()],
    },
    error: null,
    isLoading: false,
  }),
}));

vi.mock("#client/lib/api.js", () => ({
  patchAsset: vi.fn(),
}));

describe("WorldBuilder", () => {
  it("should render the World Builder interface", () => {
    render(<WorldBuilder onBack={vi.fn()} />);
    expect(screen.getByText("Exit Builder")).toBeInTheDocument();
  });

  it("should call onBack when Exit Builder is clicked", () => {
    const onBack = vi.fn();
    render(<WorldBuilder onBack={onBack} />);

    fireEvent.click(screen.getByText("Exit Builder"));
    expect(onBack).toHaveBeenCalled();
  });
});
