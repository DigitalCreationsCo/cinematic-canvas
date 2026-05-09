
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddNodeDropdown } from "#client/components/canvas/toolbar/AddNodeDropdown.js";
import { TooltipProvider } from "#client/components/ui/tooltip.js";
import { NodeCreationMenu } from "#client/components/canvas/context-menu/CanvasContextMenu.js";
import { useUIMenuStore } from "#client/store/useUIMenuStore.js";

vi.mock("#client/store/useNodeStore.js", () => ({
  useNodeStore: vi.fn(() => ({ nodes: [] })),
}));
vi.mock("#client/store/useCanvasUIStore.js", () => ({
  useCanvasUIStore: vi.fn((selector) => selector({ autoLayout: false })),
}));
vi.mock("#client/store/useUIMenuStore.js", () => ({
  useUIMenuStore: vi.fn(),
}));
vi.mock("#client/store/useProjectStore.js", () => ({
  useProjectStore: vi.fn((selector) => selector({ selectedProjectId: "project-1" })),
}));
vi.mock("#client/components/canvas/context-menu/CanvasContextMenu.js", () => ({
  NodeCreationMenu: vi.fn(),
}));
vi.mock("#client/components/canvas/panels/NewEntityModal.js", () => ({
  NewEntityModal: ({ isOpen, onClose, entityType }: any) => {
    if (!isOpen) return null;
    return (
      <div data-testid="new-entity-modal">
        <div data-testid="modal-title">New {entityType} Modal</div>
        <input data-testid="modal-name-input" placeholder="Name" onChange={() => {}} />
        <button data-testid="modal-create-btn" onClick={() => {}}>
          Create
        </button>
        <button data-testid="modal-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    );
  },
}));

describe("AddNodeDropdown", () => {
  it("opens modal and closes dropdown when a modal-requiring item is clicked", async () => {
    const user = userEvent.setup();
    const mockSetDropdownOpen = vi.fn();

    // Start with dropdown open so we can interact with menu items directly
    vi.mocked(useUIMenuStore).mockImplementation((selector) =>
      selector({ setDropdownOpen: mockSetDropdownOpen, isDropdownOpen: true }),
    );

    vi.mocked(NodeCreationMenu).mockImplementation(({ onOpenModal }: any) => {
      return (
        <div>
          <button
            data-testid="mock-character-btn"
            onClick={() => onOpenModal && onOpenModal("character")}
          >
            Character
          </button>
        </div>
      );
    });

    render(
      <TooltipProvider>
        <AddNodeDropdown contextType="project" />
      </TooltipProvider>,
    );

    // Dropdown is already open — click the mock character item
    const charBtn = screen.getByTestId("mock-character-btn");
    await user.click(charBtn);

    // Should have closed the dropdown via setDropdownOpen(false)
    expect(mockSetDropdownOpen).toHaveBeenCalledWith(false);

    // Modal should be rendered (outside the dropdown, so it survives close)
    expect(screen.getByTestId("new-entity-modal")).toBeInTheDocument();
    expect(screen.getByTestId("new-entity-modal")).toHaveTextContent("New character Modal");
  });

  it("modal stays open when clicking inside it after opening from dropdown", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const mockSetDropdownOpen = vi.fn();

    vi.mocked(useUIMenuStore).mockImplementation((selector) =>
      selector({ setDropdownOpen: mockSetDropdownOpen, isDropdownOpen: true }),
    );

    vi.mocked(NodeCreationMenu).mockImplementation(({ onOpenModal }: any) => {
      return (
        <div>
          <button
            data-testid="mock-character-btn"
            onClick={() => onOpenModal && onOpenModal("character")}
          >
            Character
          </button>
        </div>
      );
    });

    render(
      <TooltipProvider>
        <AddNodeDropdown contextType="project" />
      </TooltipProvider>,
    );

    // Open the modal from dropdown
    await user.click(screen.getByTestId("mock-character-btn"));
    expect(screen.getByTestId("new-entity-modal")).toBeInTheDocument();

    // Click the title — modal stays open
    await user.click(screen.getByTestId("modal-title"));
    expect(screen.getByTestId("new-entity-modal")).toBeInTheDocument();

    // Click the name input — modal stays open
    await user.click(screen.getByTestId("modal-name-input"));
    expect(screen.getByTestId("new-entity-modal")).toBeInTheDocument();

    // Click the Create button — modal stays open
    await user.click(screen.getByTestId("modal-create-btn"));
    expect(screen.getByTestId("new-entity-modal")).toBeInTheDocument();

    // Click the Close button — modal explicitly closes
    await user.click(screen.getByTestId("modal-close-btn"));
    expect(screen.queryByTestId("new-entity-modal")).not.toBeInTheDocument();
  });

  it("calls onClose for non-modal types via NodeCreationMenu", async () => {
    const user = userEvent.setup();
    const mockSetDropdownOpen = vi.fn();

    vi.mocked(useUIMenuStore).mockImplementation((selector) =>
      selector({ setDropdownOpen: mockSetDropdownOpen, isDropdownOpen: true }),
    );

    let capturedOnClose: (() => void) | null = null;

    vi.mocked(NodeCreationMenu).mockImplementation(({ onClose }: any) => {
      capturedOnClose = onClose;
      return <div data-testid="mock-menu-content">Menu Content</div>;
    });

    render(
      <TooltipProvider>
        <AddNodeDropdown contextType="project" />
      </TooltipProvider>,
    );

    // Verify onClose was passed and it calls setDropdownOpen(false)
    expect(capturedOnClose).not.toBeNull();
    capturedOnClose!();
    expect(mockSetDropdownOpen).toHaveBeenCalledWith(false);
  });
});
