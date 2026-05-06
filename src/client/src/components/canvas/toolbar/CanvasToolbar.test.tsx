import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { CanvasToolbar } from "#client/components/canvas/toolbar/CanvasToolbar.js";
import { TooltipProvider } from "#client/components/ui/tooltip.tsx";
import { useProjectStore } from "#client/store/useProjectStore.js";

vi.mock("#client/store/useWorldStore.js", () => ({
  useWorldStore: vi.fn((selector) => {
    if (selector === undefined) {
      return {
        worldName: "Test World",
      };
    }
    if (typeof selector === "function") {
      return selector({ worldName: "Test World" });
    }
    return "Test World";
  }),
}));

vi.mock("#client/components/ui/button.js", () => ({
  Button: ({ children, className, onClick, size, variant }: any) => (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

vi.mock("#client/components/AgentToolbar.js", () => ({
  AgentToolbar: vi.fn(() => null),
}));

vi.mock("#client/components/canvas/panels/NewEntityModal.js", () => ({
  NewEntityModal: vi.fn(() => null),
}));

beforeEach(() => {
  const slot = document.createElement("div");
  slot.id = "canvas-toolbar-slot";
  document.body.appendChild(slot);
});

afterEach(() => {
  const slot = document.getElementById("canvas-toolbar-slot");
  if (slot) {
    slot.remove();
  }
});

describe("CanvasToolbar", () => {
  const handleStart = vi.fn();
  const handleResume = vi.fn();
  const handleStop = vi.fn();

  beforeEach(() => {
    // 2. INJECT the specific state needed for these tests
    // This updates the global mock instance without breaking .getState()
    useProjectStore.setState({
      scenes: new Map(),
      metadata: { title: "Test Project" },
    });

    const slot = document.createElement("div");
    slot.id = "canvas-toolbar-slot";
    document.body.appendChild(slot);
  });

  afterEach(() => {
    const slot = document.getElementById("canvas-toolbar-slot");
    if (slot) slot.remove();
  });

  it("renders without crashing", () => {
    render(
      <CanvasToolbar
        handleStart={handleStart}
        handleStop={handleStop}
        handleResume={handleResume}
      />,
      { wrapper: ({ children }) => <TooltipProvider>{children}</TooltipProvider> },
    );
    expect(screen.getByText(/Test Project/i)).toBeInTheDocument();
  });

  it("renders project title", () => {
    render(
      <CanvasToolbar
        handleStart={handleStart}
        handleStop={handleStop}
        handleResume={handleResume}
      />,
      { wrapper: ({ children }) => <TooltipProvider>{children}</TooltipProvider> },
    );
    expect(screen.getByText(/Test Project/i)).toBeInTheDocument();
  });

  it("renders toolbar content", () => {
    render(
      <CanvasToolbar
        handleStart={handleStart}
        handleStop={handleStop}
        handleResume={handleResume}
      />,
      { wrapper: ({ children }) => <TooltipProvider>{children}</TooltipProvider> },
    );
    expect(screen.getByText(/Test World/i)).toBeInTheDocument();
  });
});
