import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { AssistantToolbar } from "#client/components/canvas/toolbar/AssistantToolbar.js";
import { TooltipProvider } from "#client/components/ui/tooltip.tsx";
import { useProjectStore } from "#client/store/useProjectStore.js";
import { usePipelineStore } from "#client/store/usePipelineStore.js";
import { useJobStore } from "#client/store/useJobStore.js";
import type { ClientJob } from "#client/store/useJobStore.js";

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
    Loader: createIcon("Loader"),
    X: createIcon("X"),
    ChevronRight: createIcon("ChevronRight"),
    Circle: createIcon("Circle"),
  };
});

// ── API mock (minimal — only jobs.cancel.mutate is used by AssistantToolbar) ─
vi.mock("#client/lib/api.js", () => ({
  api: {
    jobs: {
      cancel: {
        mutate: vi.fn().mockResolvedValue({}),
      },
    },
  },
}));

vi.mock("#client/components/ui/button.js", () => ({
  Button: ({ children, className, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} className={className} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const HANDLERS = { handleStart: vi.fn(), handleStop: vi.fn(), handleResume: vi.fn() };

function renderAssistantToolbar(overrides: Record<string, any> = {}) {
  const user = userEvent.setup();
  const result = render(
    <AssistantToolbar
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

function createMockJob(overrides: Partial<ClientJob> = {}): ClientJob {
  return {
    id: "job-abc-123",
    type: "GENERATE_SCENE_VIDEO",
    state: "PENDING",
    projectId: "test-project",
    userId: "user-1",
    teamId: "team-1",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function findButtonWithIcon(iconTestId: string): HTMLButtonElement | null {
  const icon = screen.queryByTestId(iconTestId);
  if (!icon) return null;
  return icon.closest("button");
}

/**
 * Radix TooltipContent renders the tooltip text both in a visible div
 * AND in a hidden accessible <span role="tooltip">.  This helper
 * asserts the tooltip content exists without tripping over duplicates.
 */
function expectTooltip(text: string) {
  const matches = screen.getAllByText(text);
  expect(matches.length).toBeGreaterThan(0);
}

/** Get the outermost toolbar container div for hover testing. */
function getToolbarContainer(): HTMLElement | null {
  // The root wrapper in AssistantToolbar is <div className="relative z-[100]">.
  // Look for any element that wraps the icon-loader or icon-play
  const icon = screen.queryByTestId("icon-loader") || screen.queryByTestId("icon-play");
  if (!icon) return null;
  // Walk up to find the outermost relative container
  let el: HTMLElement | null = icon.closest(".z-\\[100\\]") as HTMLElement;
  if (!el) {
    // Fallback: the parent chain from the icon
    el = icon.parentElement;
    while (el && el.parentElement && el.parentElement !== document.body) {
      el = el.parentElement;
    }
  }
  return el;
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe("AssistantToolbar", () => {
  beforeEach(() => {
    HANDLERS.handleStart.mockReset();
    HANDLERS.handleStop.mockReset();
    HANDLERS.handleResume.mockReset();

    // Reset stores to known defaults
    useProjectStore.setState({ scenes: new Map() });
    usePipelineStore.setState({ status: "idle" });
    useJobStore.setState({ jobs: {} });

    // happy-dom does not define window.confirm, so define it before spying
    if (typeof window.confirm !== "function") {
      window.confirm = vi.fn();
    }
    vi.spyOn(window, "confirm").mockReturnValue(true);

    if (typeof window.alert !== "function") {
      window.alert = vi.fn();
    }
    vi.spyOn(window, "alert").mockImplementation(() => {});

    // Create portal slot
    const slot = document.createElement("div");
    slot.id = "assistant-toolbar-slot";
    document.body.appendChild(slot);
  });

  afterEach(() => {
    document.getElementById("assistant-toolbar-slot")?.remove();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // RENDERING & PORTAL
  // ==========================================================================

  describe("rendering", () => {
    it("renders nothing when portal slot is missing", () => {
      document.getElementById("assistant-toolbar-slot")?.remove();
      const { container } = renderAssistantToolbar();
      expect(container.innerHTML).toBe("");
    });

    it("renders into the assistant-toolbar-slot portal", () => {
      renderAssistantToolbar();
      const slot = document.getElementById("assistant-toolbar-slot");
      expect(slot).toBeInTheDocument();
      expect(slot?.children.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // BUTTON TEXT STATE
  // ==========================================================================

  describe("button text state", () => {
    it('shows "Start" when there are no scenes and pipeline is idle', () => {
      useProjectStore.setState({ scenes: new Map() });
      usePipelineStore.setState({ status: "idle" });
      renderAssistantToolbar();
      expect(screen.getByText("Start")).toBeInTheDocument();
    });

    it('shows "Resume" when there are scenes and pipeline is idle', () => {
      const scenes = new Map();
      scenes.set("scene-1", { id: "scene-1" });
      useProjectStore.setState({ scenes });
      usePipelineStore.setState({ status: "idle" });
      renderAssistantToolbar();
      expect(screen.getByText("Resume")).toBeInTheDocument();
    });

    it('shows "Generating" when pipeline is active (analyzing)', () => {
      usePipelineStore.setState({ status: "analyzing" });
      renderAssistantToolbar();
      expect(screen.getByText("Generating")).toBeInTheDocument();
    });

    it('shows "Generating" when pipeline is generating', () => {
      usePipelineStore.setState({ status: "generating" });
      renderAssistantToolbar();
      expect(screen.getByText("Generating")).toBeInTheDocument();
    });

    it('shows "Generating" when pipeline is evaluating', () => {
      usePipelineStore.setState({ status: "evaluating" });
      renderAssistantToolbar();
      expect(screen.getByText("Generating")).toBeInTheDocument();
    });

    it('shows "Generating" when there are active jobs (even if pipeline is idle)', () => {
      usePipelineStore.setState({ status: "idle" });
      useJobStore.setState({
        jobs: { "job-1": createMockJob({ state: "RUNNING" }) },
      });
      renderAssistantToolbar();
      expect(screen.getByText("Generating")).toBeInTheDocument();
    });

    it('hides text when projectId is undefined (not loaded)', () => {
      renderAssistantToolbar({ projectId: undefined });
      expect(screen.queryByText("Start")).not.toBeInTheDocument();
      expect(screen.queryByText("Resume")).not.toBeInTheDocument();
      expect(screen.queryByText("Generating")).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // TOOLTIP STATE
  // ==========================================================================

  describe("tooltip state", () => {
    it('shows "Start Pipeline" tooltip when idle and no scenes', async () => {
      useProjectStore.setState({ scenes: new Map() });
      usePipelineStore.setState({ status: "idle" });
      const { user } = renderAssistantToolbar();
      const btn = findButtonWithIcon("icon-play");
      expect(btn).not.toBeNull();
      await user.hover(btn!);
      await waitFor(() => {
        expectTooltip("Start Pipeline");
      });
    });

    it('shows "Resume" tooltip when idle and has scenes', async () => {
      const scenes = new Map();
      scenes.set("scene-1", { id: "scene-1" });
      useProjectStore.setState({ scenes });
      usePipelineStore.setState({ status: "idle" });
      const { user } = renderAssistantToolbar();
      const btn = findButtonWithIcon("icon-play");
      await user.hover(btn!);
      await waitFor(() => {
        expectTooltip("Resume");
      });
    });

    it('shows "Stop Pipeline" tooltip when pipeline is generating', async () => {
      usePipelineStore.setState({ status: "generating" });
      const { user } = renderAssistantToolbar();
      const btn = findButtonWithIcon("icon-loader");
      await user.hover(btn!);
      await waitFor(() => {
        expectTooltip("Stop Pipeline");
      });
    });

    it('shows "Stop Pipeline" tooltip when there are active jobs', async () => {
      usePipelineStore.setState({ status: "idle" });
      useJobStore.setState({
        jobs: { "job-1": createMockJob({ state: "RUNNING" }) },
      });
      const { user } = renderAssistantToolbar();
      const btn = findButtonWithIcon("icon-loader");
      await user.hover(btn!);
      await waitFor(() => {
        expectTooltip("Stop Pipeline");
      });
    });
  });

  // ==========================================================================
  // CLICK ACTIONS
  // ==========================================================================

  describe("click actions", () => {
    it("calls handleStart when idle with no scenes and confirm returns true", async () => {
      useProjectStore.setState({ scenes: new Map() });
      usePipelineStore.setState({ status: "idle" });
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const { user } = renderAssistantToolbar();
      await user.click(findButtonWithIcon("icon-play")!);
      expect(HANDLERS.handleStart).toHaveBeenCalledTimes(1);
      expect(HANDLERS.handleResume).not.toHaveBeenCalled();
    });

    it("calls handleResume when idle with scenes and confirm returns true", async () => {
      const scenes = new Map();
      scenes.set("scene-1", { id: "scene-1" });
      useProjectStore.setState({ scenes });
      usePipelineStore.setState({ status: "idle" });
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const { user } = renderAssistantToolbar();
      await user.click(findButtonWithIcon("icon-play")!);
      expect(HANDLERS.handleResume).toHaveBeenCalledTimes(1);
      expect(HANDLERS.handleStart).not.toHaveBeenCalled();
    });

    it("calls handleStop when pipeline is generating and confirm returns true", async () => {
      usePipelineStore.setState({ status: "generating" });
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const { user } = renderAssistantToolbar();
      await user.click(findButtonWithIcon("icon-loader")!);
      expect(HANDLERS.handleStop).toHaveBeenCalledTimes(1);
    });

    it("does NOT call handleStart when confirm returns false", async () => {
      useProjectStore.setState({ scenes: new Map() });
      usePipelineStore.setState({ status: "idle" });
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const { user } = renderAssistantToolbar();
      await user.click(findButtonWithIcon("icon-play")!);
      expect(HANDLERS.handleStart).not.toHaveBeenCalled();
      expect(HANDLERS.handleResume).not.toHaveBeenCalled();
      expect(HANDLERS.handleStop).not.toHaveBeenCalled();
    });

    it("does NOT call handleStop when confirm returns false during active pipeline", async () => {
      usePipelineStore.setState({ status: "generating" });
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const { user } = renderAssistantToolbar();
      await user.click(findButtonWithIcon("icon-loader")!);
      expect(HANDLERS.handleStop).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // ACTIVE JOBS DROPDOWN
  // ==========================================================================

  describe("active jobs dropdown", () => {
    function hoverToolbar(user: ReturnType<typeof userEvent.setup>) {
      // Find the outermost container div by searching for the relative container
      const container = document.querySelector(".z-\\[100\\]") as HTMLElement;
      if (container) return user.hover(container);
      // Fallback: hover the slot content
      const slot = document.getElementById("assistant-toolbar-slot");
      if (slot) return user.hover(slot);
      throw new Error("Cannot find toolbar container to hover");
    }

    function unhoverToolbar(user: ReturnType<typeof userEvent.setup>) {
      return user.hover(document.body);
    }

    it("does NOT show the dropdown when there are no active jobs", () => {
      useJobStore.setState({ jobs: {} });
      renderAssistantToolbar();
      expect(screen.queryByText(/Active Jobs/i)).not.toBeInTheDocument();
    });

    it("shows the dropdown when there are active jobs and toolbar is hovered", async () => {
      useJobStore.setState({
        jobs: {
          "job-1": createMockJob({
            id: "job-abc-123",
            type: "GENERATE_SCENE_VIDEO",
            state: "RUNNING",
          }),
        },
      });
      const { user } = renderAssistantToolbar();
      await hoverToolbar(user);

      await waitFor(() => {
        expect(screen.getByText(/Active Jobs/i)).toBeInTheDocument();
      });
    });

    it("shows the correct job count in the dropdown header", async () => {
      useJobStore.setState({
        jobs: {
          "job-1": createMockJob({ id: "job-1", state: "RUNNING" }),
          "job-2": createMockJob({ id: "job-2", state: "PENDING" }),
        },
      });
      const { user } = renderAssistantToolbar();
      await hoverToolbar(user);

      await waitFor(() => {
        expect(screen.getByText(/Active Jobs \(2\)/i)).toBeInTheDocument();
      });
    });

    it("shows job type name, truncated id, and state for each job", async () => {
      useJobStore.setState({
        jobs: {
          "job-abc-123": createMockJob({
            id: "job-abc-123",
            type: "GENERATE_CHARACTER_IMAGE",
            state: "RUNNING",
          }),
        },
      });
      const { user } = renderAssistantToolbar();
      await hoverToolbar(user);

      await waitFor(() => {
        expect(screen.getByText("Character Image")).toBeInTheDocument();
        expect(screen.getByText(/job-abc/i)).toBeInTheDocument();
        expect(screen.getByText("RUNNING")).toBeInTheDocument();
      });
    });

    it("shows the correct job type name for each job type", async () => {
      const testCases: Array<{ type: string; expectedLabel: string }> = [
        { type: "GENERATE_SCENE_VIDEO", expectedLabel: "Scene Video" },
        { type: "GENERATE_SCENE_FRAMES", expectedLabel: "Scene Frames" },
        { type: "GENERATE_CHARACTER_IMAGE", expectedLabel: "Character Image" },
        { type: "GENERATE_LOCATION_IMAGE", expectedLabel: "Location Image" },
        { type: "ANALYZE_AUDIO", expectedLabel: "Audio Analysis" },
      ];

      for (const { type, expectedLabel } of testCases) {
        useJobStore.setState({
          jobs: {
            "job-1": createMockJob({
              id: `job-${type}`,
              type: type as any,
              state: "RUNNING",
            }),
          },
        });
        const { user, unmount } = renderAssistantToolbar();
        await hoverToolbar(user);

        await waitFor(() => {
          expect(screen.getByText(expectedLabel)).toBeInTheDocument();
        });

        unmount();
      }
    });

    it("does not show dropdown when toolbar is NOT hovered", () => {
      useJobStore.setState({
        jobs: { "job-1": createMockJob({ state: "RUNNING" }) },
      });
      renderAssistantToolbar();
      expect(screen.queryByText(/Active Jobs/i)).not.toBeInTheDocument();
    });

    it("hides dropdown when hovering away", async () => {
      useJobStore.setState({
        jobs: { "job-1": createMockJob({ state: "RUNNING" }) },
      });
      const { user } = renderAssistantToolbar();
      await hoverToolbar(user);

      await waitFor(() => {
        expect(screen.getByText(/Active Jobs/i)).toBeInTheDocument();
      });

      await unhoverToolbar(user);
      await waitFor(
        () => {
          expect(screen.queryByText(/Active Jobs/i)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });

  // ==========================================================================
  // JOB CANCEL
  // ==========================================================================

  describe("job cancellation", () => {
    function hoverToolbar(user: ReturnType<typeof userEvent.setup>) {
      const container = document.querySelector(".z-\\[100\\]") as HTMLElement;
      if (container) return user.hover(container);
      const slot = document.getElementById("assistant-toolbar-slot");
      if (slot) return user.hover(slot);
      throw new Error("Cannot find toolbar container to hover");
    }

    it("shows a cancel button for each active job", async () => {
      useJobStore.setState({
        jobs: { "job-1": createMockJob({ state: "RUNNING" }) },
      });
      const { user } = renderAssistantToolbar();
      await hoverToolbar(user);

      await waitFor(() => {
        expect(screen.getByTitle("Cancel Job")).toBeInTheDocument();
      });
    });

    it("shows inline confirmation when cancel button is clicked first time", async () => {
      useJobStore.setState({
        jobs: { "job-1": createMockJob({ state: "RUNNING" }) },
      });
      const { user } = renderAssistantToolbar();
      await hoverToolbar(user);

      await waitFor(() => {
        expect(screen.getByTitle("Cancel Job")).toBeInTheDocument();
      });

      await user.click(screen.getByTitle("Cancel Job"));

      await waitFor(() => {
        expect(screen.getByText("Cancel?")).toBeInTheDocument();
        expect(screen.getByText("Yes")).toBeInTheDocument();
        expect(screen.getByText("No")).toBeInTheDocument();
      });
    });

    it("calls api.jobs.cancel.mutate when confirmed with Yes", async () => {
      const apiModule = await import("#client/lib/api.js");
      (apiModule.api.jobs.cancel.mutate as ReturnType<typeof vi.fn>).mockReset();

      useJobStore.setState({
        jobs: {
          "job-abc-123": createMockJob({ id: "job-abc-123", state: "RUNNING" }),
        },
      });
      const { user } = renderAssistantToolbar();
      await hoverToolbar(user);

      await waitFor(() => {
        expect(screen.getByTitle("Cancel Job")).toBeInTheDocument();
      });

      // First click: enter confirmation state
      await user.click(screen.getByTitle("Cancel Job"));

      // Second click: confirm via "Yes"
      await waitFor(() => {
        expect(screen.getByText("Yes")).toBeInTheDocument();
      });
      await user.click(screen.getByText("Yes"));

      expect(apiModule.api.jobs.cancel.mutate).toHaveBeenCalledWith({
        projectId: "test-project",
        jobId: "job-abc-123",
      });
    });

    it("does NOT call cancel when dismissed with No", async () => {
      const apiModule = await import("#client/lib/api.js");
      (apiModule.api.jobs.cancel.mutate as ReturnType<typeof vi.fn>).mockReset();

      useJobStore.setState({
        jobs: { "job-1": createMockJob({ state: "RUNNING" }) },
      });
      const { user } = renderAssistantToolbar();
      await hoverToolbar(user);

      await waitFor(() => {
        expect(screen.getByTitle("Cancel Job")).toBeInTheDocument();
      });

      // First click: enter confirmation state
      await user.click(screen.getByTitle("Cancel Job"));

      // Dismiss with "No"
      await waitFor(() => {
        expect(screen.getByText("No")).toBeInTheDocument();
      });
      await user.click(screen.getByText("No"));

      // Button should revert to X
      await waitFor(() => {
        expect(screen.getByTitle("Cancel Job")).toBeInTheDocument();
      });

      expect(apiModule.api.jobs.cancel.mutate).not.toHaveBeenCalled();
    });

    it("cancel button has the correct title attribute", async () => {
      useJobStore.setState({
        jobs: { "job-1": createMockJob({ state: "RUNNING" }) },
      });
      const { user } = renderAssistantToolbar();
      await hoverToolbar(user);

      await waitFor(() => {
        const cancelBtn = screen.getByTitle("Cancel Job");
        expect(cancelBtn).toHaveAttribute("data-no-header-track", "true");
      });
    });

    it("handles cancel API failure gracefully", async () => {
      const apiModule = await import("#client/lib/api.js");
      (apiModule.api.jobs.cancel.mutate as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error"),
      );
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      useJobStore.setState({
        jobs: { "job-1": createMockJob({ state: "RUNNING" }) },
      });
      const { user } = renderAssistantToolbar();
      await hoverToolbar(user);

      await waitFor(() => {
        expect(screen.getByTitle("Cancel Job")).toBeInTheDocument();
      });

      await user.click(screen.getByTitle("Cancel Job"));
      await waitFor(() => {
        expect(screen.getByText("Yes")).toBeInTheDocument();
      });
      await user.click(screen.getByText("Yes"));

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          "Failed to cancel job:",
          expect.any(Error),
        );
      });

      consoleSpy.mockRestore();
    });

    it("does not call cancel API when projectId is missing", async () => {
      const apiModule = await import("#client/lib/api.js");
      (apiModule.api.jobs.cancel.mutate as ReturnType<typeof vi.fn>).mockReset();

      useJobStore.setState({
        jobs: { "job-1": createMockJob({ state: "RUNNING" }) },
      });
      const { user } = renderAssistantToolbar({ projectId: undefined });

      const container = document.querySelector(".z-\\[100\\]") as HTMLElement;
      if (container) await user.hover(container);

      await waitFor(() => {
        expect(screen.getByTitle("Cancel Job")).toBeInTheDocument();
      });

      await user.click(screen.getByTitle("Cancel Job"));
      await waitFor(() => {
        expect(screen.getByText("Yes")).toBeInTheDocument();
      });
      await user.click(screen.getByText("Yes"));

      expect(apiModule.api.jobs.cancel.mutate).not.toHaveBeenCalled();
    });

    it("clears confirming state when dropdown hides", async () => {
      useJobStore.setState({
        jobs: { "job-1": createMockJob({ state: "RUNNING" }) },
      });
      const { user } = renderAssistantToolbar();
      await hoverToolbar(user);

      await waitFor(() => {
        expect(screen.getByTitle("Cancel Job")).toBeInTheDocument();
      });

      // Enter confirming state
      await user.click(screen.getByTitle("Cancel Job"));

      await waitFor(() => {
        expect(screen.getByText("Cancel?")).toBeInTheDocument();
      });

      // Fire mouseLeave directly for reliable DOM event dispatch
      const container = document.querySelector(".z-\\[100\\]") as HTMLElement;
      fireEvent.mouseLeave(container);

      // Dropdown and confirming state should be gone (AnimatePresence exit
      // animation completed)
      await waitFor(
        () => {
          expect(screen.queryByText(/Active Jobs/i)).not.toBeInTheDocument();
          expect(screen.queryByText("Cancel?")).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it("reverts confirming state when dropdown reappears after hide", async () => {
      useJobStore.setState({
        jobs: { "job-1": createMockJob({ state: "RUNNING" }) },
      });
      const { user } = renderAssistantToolbar();
      await hoverToolbar(user);

      await waitFor(() => {
        expect(screen.getByTitle("Cancel Job")).toBeInTheDocument();
      });

      // Enter confirming state
      await user.click(screen.getByTitle("Cancel Job"));
      await waitFor(() => {
        expect(screen.getByText("Cancel?")).toBeInTheDocument();
      });

      // Hide dropdown via mouseLeave — show prop becomes false
      const container = document.querySelector(".z-\\[100\\]") as HTMLElement;
      fireEvent.mouseLeave(container);

      await waitFor(() => {
        expect(screen.queryByText(/Active Jobs/i)).not.toBeInTheDocument();
      });

      // Re-hover to show again — confirming state must be cleared
      await user.hover(container);

      await waitFor(() => {
        expect(screen.getByTitle("Cancel Job")).toBeInTheDocument();
        expect(screen.queryByText("Cancel?")).not.toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // ICON SWITCHING
  // ==========================================================================

  describe("icon switching", () => {
    it("shows Play icon when idle with no scenes", () => {
      usePipelineStore.setState({ status: "idle" });
      useProjectStore.setState({ scenes: new Map() });
      renderAssistantToolbar();
      expect(screen.getByTestId("icon-play")).toBeInTheDocument();
    });

    it("shows Play icon when idle with scenes", () => {
      const scenes = new Map();
      scenes.set("scene-1", { id: "scene-1" });
      useProjectStore.setState({ scenes });
      usePipelineStore.setState({ status: "idle" });
      renderAssistantToolbar();
      expect(screen.getByTestId("icon-play")).toBeInTheDocument();
    });

    it("shows Loader icon when pipeline is active", () => {
      usePipelineStore.setState({ status: "generating" });
      renderAssistantToolbar();
      expect(screen.getByTestId("icon-loader")).toBeInTheDocument();
    });

    it("shows Loader icon when there are active jobs (even if pipeline idle)", () => {
      usePipelineStore.setState({ status: "idle" });
      useJobStore.setState({
        jobs: { "job-1": createMockJob({ state: "RUNNING" }) },
      });
      renderAssistantToolbar();
      expect(screen.getByTestId("icon-loader")).toBeInTheDocument();
    });
  });
});
