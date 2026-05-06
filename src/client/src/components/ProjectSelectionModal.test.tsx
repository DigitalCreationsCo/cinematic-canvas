import "#client/mocks/mock-api.js";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectSelectionModal } from "#client/components/ProjectSelectionModal.js";
import { useProjects } from "#client/hooks/useProjects.js";
import { useProjectStore } from "#client/store/useProjectStore.js";
import { usePipelineStore } from "#client/store/usePipelineStore.js";
import { useWorldStore } from "#client/store/useWorldStore.js";
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

vi.mock("#client/hooks/useProjects.js", () => ({
  useProjects: vi.fn(),
}));

vi.mock("../store/usePipelineStore.js", () => ({
  usePipelineStore: vi.fn(),
}));

vi.mock("../store/useWorldStore.js", () => ({
  useWorldStore: vi.fn(),
}));

vi.mock("#client/lib/auth-context.js", () => ({
  useAuth: vi.fn(),
}));

describe("ProjectSelectionModal", () => {
  const mockOnConfirm = vi.fn();
  const mockOnClose = vi.fn();
  const mockHydrateProject = vi.fn();
  const mockSetStatus = vi.fn();

  const defaultMocks = () => {
    vi.mocked(useProjects).mockReturnValue({
      data: { projects: [] },
      isLoading: false,
      isError: false,
    } as any);

    vi.mocked(useProjectStore).mockImplementation((selector: any) => {
      const state = { hydrateProject: mockHydrateProject };
      return selector ? selector(state) : state;
    });

    vi.mocked(usePipelineStore).mockImplementation((selector: any) => {
      const state = { setStatus: mockSetStatus };
      return selector ? selector(state) : state;
    });

    vi.mocked(useWorldStore).mockImplementation((selector: any) => {
      const state = { worldId: "test-world-id" };
      return selector ? selector(state) : state;
    });

    vi.mocked(useAuth).mockReturnValue({ activeTeamId: "test-team-id" } as any);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    defaultMocks();
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
