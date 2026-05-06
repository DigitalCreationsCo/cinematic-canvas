// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StartModal } from "../StartModal.js";

vi.mock("#client/components/ui/dialog.js", () => ({
  Dialog: ({ children, open }: any) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <h1>{children}</h1>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));

vi.mock("#client/components/ui/button.js", () => ({
  Button: ({ children, onClick, className }: any) => (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

vi.mock("lucide-react", () => ({
  Plus: () => <span data-testid="icon-plus">Plus</span>,
  FolderOpen: () => <span data-testid="icon-folder">FolderOpen</span>,
  Film: () => <span data-testid="icon-film">Film</span>,
  Sparkles: () => <span data-testid="icon-sparkles">Sparkles</span>,
  Wand2: () => <span data-testid="icon-wand2">Wand2</span>,
  Compass: () => <span data-testid="icon-compass">Compass</span>,
  ArrowRight: () => <span data-testid="icon-arrow-right">ArrowRight</span>,
}));

describe("StartModal", () => {
  const mockOnSelectAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders correctly when open", () => {
    render(<StartModal isOpen={true} onSelectAction={mockOnSelectAction} />);

    expect(screen.getByTestId("dialog")).toBeInTheDocument();
    expect(screen.getByText("Welcome to Cinematic Canvas")).toBeInTheDocument();
    expect(screen.getByText("How would you like to begin?")).toBeInTheDocument();

    // Check for the three main buttons
    expect(screen.getByText("Dream a new world")).toBeInTheDocument();
    expect(screen.getByText("Explore an existing world")).toBeInTheDocument();
    expect(screen.getByText("Load a cinematic project")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<StartModal isOpen={false} onSelectAction={mockOnSelectAction} />);
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  it('calls onSelectAction with "new-world" when New World is clicked', () => {
    render(<StartModal isOpen={true} onSelectAction={mockOnSelectAction} />);

    fireEvent.click(screen.getByText("Dream a new world"));

    expect(mockOnSelectAction).toHaveBeenCalledTimes(1);
    expect(mockOnSelectAction).toHaveBeenCalledWith("new-world");
  });

  it('calls onSelectAction with "load-world" when Load World is clicked', () => {
    render(<StartModal isOpen={true} onSelectAction={mockOnSelectAction} />);

    fireEvent.click(screen.getByText("Explore an existing world"));

    expect(mockOnSelectAction).toHaveBeenCalledTimes(1);
    expect(mockOnSelectAction).toHaveBeenCalledWith("load-world");
  });

  it('calls onSelectAction with "project" when Projects is clicked', () => {
    render(<StartModal isOpen={true} onSelectAction={mockOnSelectAction} />);

    fireEvent.click(screen.getByText("Load a cinematic project"));

    expect(mockOnSelectAction).toHaveBeenCalledTimes(1);
    expect(mockOnSelectAction).toHaveBeenCalledWith("project");
  });
});
