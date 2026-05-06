import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectSelectionModal } from "#client/components/ProjectSelectionModal.js";
import { useAuth } from "#client/lib/auth-context.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

vi.mock("#client/components/ui/button.js", () => ({
  Button: ({ children, onClick, disabled, className }: any) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

vi.mock("#client/lib/auth-context.js", () => ({ useAuth: vi.fn() }));

describe("ProjectSelectionModal", () => {
  const mockOnConfirm = vi.fn();
  const mockOnClose = vi.fn();
  const mockHydrateProject = vi.fn();
  const mockSetStatus = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ activeTeamId: "test-team-id" } as any);
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ProjectSelectionModal
          isOpen={true}
          onConfirm={mockOnConfirm}
          onClose={mockOnClose}
        />
      </QueryClientProvider>,
    );
  };

  it("renders dialog when open", () => {
    renderComponent();
    expect(screen.getByTestId("dialog-content")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ProjectSelectionModal
          isOpen={false}
          onConfirm={mockOnConfirm}
          onClose={mockOnClose}
        />
      </QueryClientProvider>,
    );

    expect(screen.queryByTestId("dialog-content")).not.toBeInTheDocument();
  });

  it("shows Resume Project button", () => {
    renderComponent();
    expect(screen.getByText("Resume Project")).toBeInTheDocument();
  });

  it("renders project select dropdown", () => {
    renderComponent();
    expect(screen.getAllByTestId("select-trigger").length).toBeGreaterThan(0);
  });
});
