import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { CanvasToolbar } from "#client/components/canvas/toolbar/CanvasToolbar.js";
import { TooltipProvider } from "#client/components/ui/tooltip.tsx";
import { useProjectStore } from "#client/store/useProjectStore.js";
import { useCanvasUIStore } from "#client/store/useCanvasUIStore.js";
import { useCanvasInteractionStore } from "#client/store/useCanvasInteractionStore.js";
import { usePipelineStore } from "#client/store/usePipelineStore.js";
import { useUIMenuStore } from "#client/store/useUIMenuStore.js";
import { useNodeStore } from "#client/store/useNodeStore.js";

// ── Lucide-react mock ──────────────────────────────────────────────────────
vi.mock("lucide-react", () => {
  const createIcon = (name: string) => {
    const Icon = (props: any) => (
      <span data-testid={`icon-${name.toLowerCase()}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    Play: createIcon("Play"),
    Square: createIcon("Square"),
    Undo: createIcon("Undo"),
    Redo: createIcon("Redo"),
    LayoutGrid: createIcon("LayoutGrid"),
    Eye: createIcon("Eye"),
    EyeOff: createIcon("EyeOff"),
    GitBranch: createIcon("GitBranch"),
    Loader2: createIcon("Loader2"),
    AlertCircle: createIcon("AlertCircle"),
    Check: createIcon("Check"),
    Plus: createIcon("Plus"),
    User: createIcon("User"),
    MapPin: createIcon("MapPin"),
    Clapperboard: createIcon("Clapperboard"),
    Music: createIcon("Music"),
    FileImage: createIcon("FileImage"),
    Layers: createIcon("Layers"),
    Loader: createIcon("Loader"),
    X: createIcon("X"),
    ChevronRight: createIcon("ChevronRight"),
    Circle: createIcon("Circle"),
  };
});

// ── Module-level mocks ─────────────────────────────────────────────────────

vi.mock("#client/store/useWorldStore.js", () => ({
  useWorldStore: vi.fn((selector) => {
    const state = { worldName: "Test World" };
    if (selector === undefined) return state;
    if (typeof selector === "function") return selector(state);
    return state.worldName;
  }),
}));

vi.mock("#client/components/ui/button.js", () => ({
  Button: ({ children, className, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} className={className} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("#client/components/canvas/panels/NewEntityModal.js", () => ({
  NewEntityModal: vi.fn(({ isOpen, onClose, entityType }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="new-entity-modal">
        <div data-testid="modal-entity-type">{entityType}</div>
        <button data-testid="modal-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }),
}));

// Radix DropdownMenu uses Portal for content, but happy-dom doesn't reliably
// propagate click events through portal boundaries.  Mock the dropdown-menu
// module with simple state-managed components that render in-tree.
vi.mock("#client/components/ui/dropdown-menu.tsx", async () => {
  const React = await import("react");

  const DropdownMenuCtx = React.createContext<{
    open: boolean;
    setOpen: (v: boolean) => void;
  }>({ open: false, setOpen: () => {} });

  const DropdownMenu = ({ children, onOpenChange }: any) => {
    const [open, setOpen] = React.useState(false);
    return (
      <DropdownMenuCtx.Provider
        value={{
          open,
          setOpen: (v: boolean) => {
            setOpen(v);
            onOpenChange?.(v);
          },
        }}
      >
        {children}
      </DropdownMenuCtx.Provider>
    );
  };

  const DropdownMenuTrigger = ({ children, asChild, ...props }: any) => {
    const { open, setOpen } = React.useContext(DropdownMenuCtx);
    return (
      <button
        type="button"
        onClick={() => setOpen(!open)}
        data-state={open ? "open" : "closed"}
        aria-expanded={open}
        aria-haspopup="menu"
        {...props}
      >
        {children}
      </button>
    );
  };

  const DropdownMenuContent = ({ children, className, ...props }: any) => {
    const { open } = React.useContext(DropdownMenuCtx);
    if (!open) return null;
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  };

  const DropdownMenuItem = React.forwardRef(
    ({ children, onClick, className, inset, ...props }: any, ref: any) => (
      <div
        role="menuitem"
        className={className}
        onClick={onClick}
        ref={ref}
        tabIndex={-1}
        {...props}
      >
        {children}
      </div>
    ),
  );

  const DropdownMenuSeparator = () => <hr />;

  const DropdownMenuLabel = ({ children, className, ...props }: any) => (
    <div className={className} {...props}>
      {children}
    </div>
  );

  // Stubs for exports not exercised by AddNodeDropdown
  const Passthrough = ({ children }: any) => <>{children}</>;

  return {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuLabel,
    DropdownMenuGroup: Passthrough,
    DropdownMenuPortal: Passthrough,
    DropdownMenuSub: Passthrough,
    DropdownMenuSubContent: Passthrough,
    DropdownMenuSubTrigger: Passthrough,
    DropdownMenuRadioGroup: Passthrough,
    DropdownMenuRadioItem: Passthrough,
    DropdownMenuCheckboxItem: Passthrough,
    DropdownMenuShortcut: ({ children }: any) => <span>{children}</span>,
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────

const HANDLERS = { handleStart: vi.fn(), handleStop: vi.fn(), handleResume: vi.fn() };

function renderToolbar(overrides: Record<string, any> = {}) {
  const user = userEvent.setup();
  const result = render(
    <CanvasToolbar
      handleStart={HANDLERS.handleStart}
      handleStop={HANDLERS.handleStop}
      handleResume={HANDLERS.handleResume}
      projectId="test-project"
      {...overrides}
    />,
    { wrapper: ({ children }) => <TooltipProvider delayDuration={0}>{children}</TooltipProvider> },
  );
  return { user, ...result };
}

function resetAllStores() {
  useProjectStore.setState({
    scenes: new Map(),
    metadata: { title: "Test Project" },
    selectedProjectId: "test-project",
  });
  useCanvasUIStore.setState({
    autoLayout: false,
    snapToGrid: false,
    lastSaved: null,
    saveError: null,
    isSaving: false,
    isDark: false,
  });
  useCanvasInteractionStore.setState({
    edgeVisibilityMode: "all",
    pendingChanges: new Map(),
    nodesWithPendingChanges: new Set(),
  });
  usePipelineStore.setState({ status: "idle" });
  useUIMenuStore.setState({
    isDropdownOpen: false,
    activeAuxiliarySidebar: null,
    activeTools: [],
  });
  useNodeStore.setState({ nodes: [], edges: [] });
}

/** Find the button element that contains an icon with the given testid. */
function findButtonWithIcon(iconTestId: string): HTMLButtonElement | null {
  const icon = screen.queryByTestId(iconTestId);
  if (!icon) return null;
  return icon.closest("button");
}

/** Hover the button that contains the given icon testid. */
async function hoverIconButton(user: ReturnType<typeof userEvent.setup>, iconTestId: string) {
  const btn = findButtonWithIcon(iconTestId);
  if (!btn) throw new Error(`Button with icon ${iconTestId} not found`);
  await user.hover(btn);
}

/** Click the button that contains the given icon testid. */
async function clickIconButton(user: ReturnType<typeof userEvent.setup>, iconTestId: string) {
  const btn = findButtonWithIcon(iconTestId);
  if (!btn) throw new Error(`Button with icon ${iconTestId} not found`);
  await user.click(btn);
}

/**
 * Radix TooltipContent renders the tooltip text both in a visible div
 * AND in a hidden accessible <span role="tooltip">.  Use this helper
 * to assert the tooltip content exists without tripping over duplicates.
 */
function expectTooltip(text: string) {
  // Use getAllByText to handle Radix's visible + accessible tooltip rendering
  const matches = screen.getAllByText(text);
  expect(matches.length).toBeGreaterThan(0);
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe("CanvasToolbar", () => {
  beforeEach(() => {
    HANDLERS.handleStart.mockReset();
    HANDLERS.handleStop.mockReset();
    HANDLERS.handleResume.mockReset();
    resetAllStores();

    const slot = document.createElement("div");
    slot.id = "canvas-toolbar-slot";
    document.body.appendChild(slot);
  });

  afterEach(() => {
    document.getElementById("canvas-toolbar-slot")?.remove();
  });

  // ==========================================================================
  // RENDERING
  // ==========================================================================

  describe("rendering", () => {
    it("renders project title", () => {
      renderToolbar();
      expect(screen.getByText(/Test Project/i)).toBeInTheDocument();
    });

    it("renders world name", () => {
      renderToolbar();
      expect(screen.getByText(/Test World/i)).toBeInTheDocument();
    });

    it("renders without crashing when no projectId is given", () => {
      renderToolbar({ projectId: undefined });
      expect(screen.getByText(/Test Project/i)).toBeInTheDocument();
    });

    it("does not render when portal slot is missing", () => {
      document.getElementById("canvas-toolbar-slot")?.remove();
      const { container } = renderToolbar();
      expect(container.innerHTML).toBe("");
    });
  });

  // ==========================================================================
  // SAVE STATUS
  // ==========================================================================

  describe("SaveStatus", () => {
    it("shows save error when saveError is set", () => {
      useCanvasUIStore.setState({ saveError: "Something went wrong" });
      renderToolbar();
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    });

    it("shows saved indicator with time when lastSaved is recent", () => {
      const now = new Date();
      useCanvasUIStore.setState({ lastSaved: now, saveError: null });
      renderToolbar();
      expect(screen.getByText(/Saved just now/i)).toBeInTheDocument();
    });

    it("shows seconds ago when saved a few seconds ago", () => {
      const past = new Date(Date.now() - 10000);
      useCanvasUIStore.setState({ lastSaved: past, saveError: null });
      renderToolbar();
      expect(screen.getByText(/10s ago/i)).toBeInTheDocument();
    });

    it("shows minutes ago when saved minutes ago", () => {
      const past = new Date(Date.now() - 120000);
      useCanvasUIStore.setState({ lastSaved: past, saveError: null });
      renderToolbar();
      expect(screen.getByText(/2m ago/i)).toBeInTheDocument();
    });

    it("renders nothing when lastSaved is null and no error", () => {
      useCanvasUIStore.setState({ lastSaved: null, saveError: null });
      renderToolbar();
      expect(screen.queryByText(/Saved/i)).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // PENDING CHANGES INDICATOR
  // ==========================================================================

  describe("pending changes indicator", () => {
    const makeChange = (id: string) => ({
      edgeId: id,
      changeType: "add" as const,
      sourceId: "node-a",
      targetId: "node-b",
      sourceHandle: "src",
      targetHandle: "tgt",
      edgeType: "character_in_scene" as const,
      timestamp: Date.now(),
    });

    it("shows pending changes count when there are pending changes", () => {
      useCanvasInteractionStore.setState({
        pendingChanges: new Map([["edge-1", makeChange("edge-1")]]),
      });
      renderToolbar();
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText(/unsaved/i)).toBeInTheDocument();
    });

    it("does not show pending section when count is 0", () => {
      renderToolbar();
      expect(screen.queryByText(/unsaved/i)).not.toBeInTheDocument();
    });

    it("shows correct tooltip for multiple pending changes", async () => {
      useCanvasInteractionStore.setState({
        pendingChanges: new Map([
          ["edge-1", makeChange("edge-1")],
          ["edge-2", makeChange("edge-2")],
        ]),
      });
      const { user } = renderToolbar();
      const branchIcon = screen.getByTestId("icon-gitbranch");
      await user.hover(branchIcon);
      await waitFor(() => {
        expectTooltip(
          "2 unsaved changes — use the canvas bar to Save or Discard",
        );
      });
    });
  });

  // ==========================================================================
  // ADD NODE DROPDOWN
  // ==========================================================================

  describe("AddNodeDropdown", () => {
    it("opens the dropdown menu when Add Node button is clicked", async () => {
      const { user } = renderToolbar();
      await user.click(screen.getByText("Add Node"));

      await waitFor(() => {
        expect(screen.getByText("Character")).toBeInTheDocument();
        expect(screen.getByText("Location")).toBeInTheDocument();
        expect(screen.getByText("Scene")).toBeInTheDocument();
        expect(screen.getByText("Audio Track")).toBeInTheDocument();
        expect(screen.getByText("Image")).toBeInTheDocument();
        expect(screen.getByText("Composite")).toBeInTheDocument();
        expect(screen.getByText("Render Output")).toBeInTheDocument();
      });
    });

    it("has the correct tooltip on the Add Node button", async () => {
      const { user } = renderToolbar();
      await user.hover(screen.getByText("Add Node"));
      await waitFor(() => {
        expectTooltip("Add Node To Canvas");
      });
    });

    // ── Modal node types ─────────────────────────────────────────────────

    it("opens the NewEntityModal when Character is clicked", async () => {
      const { user } = renderToolbar();
      await user.click(screen.getByText("Add Node"));
      await waitFor(() => expect(screen.getByText("Character")).toBeInTheDocument());
      await user.click(screen.getByText("Character"));
      await waitFor(() => {
        expect(screen.getByTestId("new-entity-modal")).toBeInTheDocument();
        expect(screen.getByTestId("modal-entity-type")).toHaveTextContent("character");
      });
    });

    it("opens the NewEntityModal when Location is clicked", async () => {
      const { user } = renderToolbar();
      await user.click(screen.getByText("Add Node"));
      await waitFor(() => expect(screen.getByText("Location")).toBeInTheDocument());
      await user.click(screen.getByText("Location"));
      await waitFor(() => {
        expect(screen.getByTestId("new-entity-modal")).toBeInTheDocument();
        expect(screen.getByTestId("modal-entity-type")).toHaveTextContent("location");
      });
    });

    it("opens the NewEntityModal when Scene is clicked", async () => {
      const { user } = renderToolbar();
      await user.click(screen.getByText("Add Node"));
      await waitFor(() => expect(screen.getByText("Scene")).toBeInTheDocument());
      await user.click(screen.getByText("Scene"));
      await waitFor(() => {
        expect(screen.getByTestId("new-entity-modal")).toBeInTheDocument();
        expect(screen.getByTestId("modal-entity-type")).toHaveTextContent("scene");
      });
    });

    // ── Direct-create node types ─────────────────────────────────────────

    it("creates an audio node directly when Audio Track is clicked", async () => {
      const { user } = renderToolbar();
      await user.click(screen.getByText("Add Node"));
      await waitFor(() => expect(screen.getByText("Audio Track")).toBeInTheDocument());
      await user.click(screen.getByText("Audio Track"));
      await waitFor(() => {
        const nodes = useNodeStore.getState().nodes;
        expect(nodes.length).toBe(1);
        expect(nodes[0].type).toBe("audio");
      });
    });

    it("creates an image node directly when Image is clicked", async () => {
      const { user } = renderToolbar();
      await user.click(screen.getByText("Add Node"));
      await waitFor(() => expect(screen.getByText("Image")).toBeInTheDocument());
      await user.click(screen.getByText("Image"));
      await waitFor(() => {
        const nodes = useNodeStore.getState().nodes;
        expect(nodes.length).toBe(1);
        expect(nodes[0].type).toBe("image");
      });
    });

    it("creates a composite node directly when Composite is clicked", async () => {
      const { user } = renderToolbar();
      await user.click(screen.getByText("Add Node"));
      await waitFor(() => expect(screen.getByText("Composite")).toBeInTheDocument());
      await user.click(screen.getByText("Composite"));
      await waitFor(() => {
        const nodes = useNodeStore.getState().nodes;
        expect(nodes.length).toBe(1);
        expect(nodes[0].type).toBe("composite");
      });
    });

    it("creates a render output node directly when Render Output is clicked", async () => {
      const { user } = renderToolbar();
      await user.click(screen.getByText("Add Node"));
      await waitFor(() => expect(screen.getByText("Render Output")).toBeInTheDocument());
      await user.click(screen.getByText("Render Output"));
      await waitFor(() => {
        const nodes = useNodeStore.getState().nodes;
        expect(nodes.length).toBe(1);
        expect(nodes[0].type).toBe("render");
      });
    });

    it("creates nodes with the correct context type and scope", async () => {
      const { user } = renderToolbar();
      await user.click(screen.getByText("Add Node"));
      await waitFor(() => expect(screen.getByText("Audio Track")).toBeInTheDocument());
      await user.click(screen.getByText("Audio Track"));
      await waitFor(() => {
        const node = useNodeStore.getState().nodes[0];
        expect(node.data.contextType).toBe("project");
        expect(node.data.scope).toBe("project");
      });
    });
  });

  // ==========================================================================
  // UNDO / REDO
  // ==========================================================================

  describe("Undo / Redo tooltips", () => {
    it("shows Undo tooltip when hovering the Undo button", async () => {
      const { user } = renderToolbar();
      await hoverIconButton(user, "icon-undo");
      await waitFor(() => {
        expectTooltip("Undo");
      });
    });

    it("shows Redo tooltip when hovering the Redo button", async () => {
      const { user } = renderToolbar();
      await hoverIconButton(user, "icon-redo");
      await waitFor(() => {
        expectTooltip("Redo");
      });
    });
  });

  // ==========================================================================
  // CANVAS LAYOUT — TOOLTIPS
  // ==========================================================================

  describe("Snap-to-grid tooltip", () => {
    it('shows "Turn On Snap To Grid" when autoLayout is off', async () => {
      useCanvasUIStore.setState({ autoLayout: false });
      const { user } = renderToolbar();
      await hoverIconButton(user, "icon-layoutgrid");
      await waitFor(() => {
        expectTooltip("Turn On Snap To Grid");
      });
    });

    it('shows "Turn Off Snap To Grid" when autoLayout is on', async () => {
      useCanvasUIStore.setState({ autoLayout: true });
      const { user } = renderToolbar();
      await hoverIconButton(user, "icon-layoutgrid");
      await waitFor(() => {
        expectTooltip("Turn Off Snap To Grid");
      });
    });
  });

  describe("Edge visibility tooltip", () => {
    it('shows "Hide Connections" when edges are visible', async () => {
      useCanvasInteractionStore.setState({ edgeVisibilityMode: "all" });
      const { user } = renderToolbar();
      await hoverIconButton(user, "icon-eye");
      await waitFor(() => {
        expectTooltip("Hide Connections");
      });
    });

    it('shows "Show Connections" when edges are hidden', async () => {
      useCanvasInteractionStore.setState({ edgeVisibilityMode: "none" });
      const { user } = renderToolbar();
      await hoverIconButton(user, "icon-eyeoff");
      await waitFor(() => {
        expectTooltip("Show Connections");
      });
    });
  });

  // ==========================================================================
  // CANVAS LAYOUT — ACTIONS (verify store state changes)
  // ==========================================================================

  describe("canvas layout control actions", () => {
    it("clicking snap-to-grid toggles autoLayout and enables snapToGrid", async () => {
      // Start with autoLayout off
      useCanvasUIStore.setState({ autoLayout: false, snapToGrid: false });
      const { user } = renderToolbar();
      await clickIconButton(user, "icon-layoutgrid");
      // After click, autoLayout should be true (toggled) and snapToGrid should be true
      expect(useCanvasUIStore.getState().autoLayout).toBe(true);
      expect(useCanvasUIStore.getState().snapToGrid).toBe(true);
    });

    it("clicking edge visibility toggles the edge visibility mode", async () => {
      useCanvasInteractionStore.setState({ edgeVisibilityMode: "all" });
      const { user } = renderToolbar();
      await clickIconButton(user, "icon-eye");
      expect(useCanvasInteractionStore.getState().edgeVisibilityMode).toBe("none");
    });
  });

  // ==========================================================================
  // THEME SWITCHING (useCanvasUIStore.isDark)
  // ==========================================================================

  describe("theme switching", () => {
    it("starts with isDark set to false by default", () => {
      renderToolbar();
      expect(useCanvasUIStore.getState().isDark).toBe(false);
    });

    it("sets isDark to true via setIsDark", () => {
      renderToolbar();
      useCanvasUIStore.getState().setIsDark(true);
      expect(useCanvasUIStore.getState().isDark).toBe(true);
    });

    it("toggles between light and dark correctly", () => {
      renderToolbar();
      expect(useCanvasUIStore.getState().isDark).toBe(false);
      useCanvasUIStore.getState().setIsDark(true);
      expect(useCanvasUIStore.getState().isDark).toBe(true);
      useCanvasUIStore.getState().setIsDark(false);
      expect(useCanvasUIStore.getState().isDark).toBe(false);
    });
  });

  // ==========================================================================
  // TOOLS SIDEBAR (useUIMenuStore)
  // ==========================================================================

  describe("tools sidebar (useUIMenuStore)", () => {
    it("opens workspace tools sidebar via openWorkspaceToolsSidebar", () => {
      renderToolbar();
      useUIMenuStore.getState().openWorkspaceToolsSidebar();
      expect(useUIMenuStore.getState().activeAuxiliarySidebar).toBe("tools");
    });

    it("toggles workspace tools sidebar", () => {
      renderToolbar();
      useUIMenuStore.getState().openWorkspaceToolsSidebar();
      expect(useUIMenuStore.getState().activeAuxiliarySidebar).toBe("tools");
      useUIMenuStore.getState().closeWorkspaceToolsSidebar();
      expect(useUIMenuStore.getState().activeAuxiliarySidebar).toBeNull();
    });
  });

  // ==========================================================================
  // MESSAGES SIDEBAR (useUIMenuStore)
  // ==========================================================================

  describe("messages sidebar (useUIMenuStore)", () => {
    it("opens messages sidebar via openMessagesSidebar", () => {
      renderToolbar();
      useUIMenuStore.getState().openMessagesSidebar();
      expect(useUIMenuStore.getState().activeAuxiliarySidebar).toBe("messages");
    });

    it("toggles messages sidebar between open and closed", () => {
      renderToolbar();
      expect(useUIMenuStore.getState().activeAuxiliarySidebar).toBeNull();
      useUIMenuStore.getState().toggleMessagesSidebar();
      expect(useUIMenuStore.getState().activeAuxiliarySidebar).toBe("messages");
      useUIMenuStore.getState().toggleMessagesSidebar();
      expect(useUIMenuStore.getState().activeAuxiliarySidebar).toBeNull();
    });
  });
});
