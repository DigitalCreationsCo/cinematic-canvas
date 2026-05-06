/** @vitest-environment happy-dom */

import "#client/mocks/mock-api.ts";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorldBuilder } from "../WorldBuilder.js";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

vi.mock("#client/store/useWorldStore.js", () => ({
  useWorldStore: vi.fn((selector) => {
    const state = {
      worldId: null,
      worldName: null,
      setWorld: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock("#client/lib/auth-context.js", () => ({
  useAuth: vi.fn(() => ({
    activeTeamId: "team-1",
    setActiveTeamId: vi.fn(),
  })),
}));

// Mock Header to avoid deep component testing
vi.mock("#client/components/Header.js", () => ({
  default: () => <div data-testid="mock-header">Header</div>,
}));

describe("WorldBuilder", () => {
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <WorldBuilder onBack={mockOnBack} />
      </QueryClientProvider>,
    );
  };

  it("renders correctly", () => {
    renderComponent();

    expect(screen.getByTestId("title-world-builder")).toBeDefined();
    expect(screen.getByTestId("caption-world-builder")).toBeDefined();
  });

  it("renders the back button and calls onBack when clicked", async () => {
    const user = userEvent.setup();
    renderComponent();
    const buttonBack = screen.getByTestId("button-back");

    expect(buttonBack).toBeDefined();
    await user.click(buttonBack);

    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });
});
