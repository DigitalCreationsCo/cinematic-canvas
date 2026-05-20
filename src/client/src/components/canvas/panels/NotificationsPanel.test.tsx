import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NotificationsPanel } from "#client/components/canvas/panels/NotificationsPanel.js";

const mockUseNotifications = vi.fn();

vi.mock("#client/hooks/useNotifications.js", () => ({
  useNotifications: (...args: any[]) => mockUseNotifications(...args),
}));

vi.mock("#client/store/usePipelineStore.js", () => ({
  usePipelineStore: (selector: (s: any) => any) => {
    const state = {
      events: [],
      pushEvent: vi.fn(),
      clearEvents: vi.fn(),
      status: "idle",
      interrupt: null,
    };
    return selector(state);
  },
}));

describe("NotificationsPanel", () => {
  beforeEach(() => {
    mockUseNotifications.mockReturnValue({
      notifications: [],
      interrupt: null,
      dismiss: vi.fn(),
    });
  });

  it("renders nothing when there are no notifications or interrupt", () => {
    const { container } = render(<NotificationsPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("renders toast notifications when present", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [
        {
          id: "1",
          type: "info",
          message: "Pipeline started",
          timestamp: new Date(),
        },
        {
          id: "2",
          type: "error",
          message: "Something went wrong",
          timestamp: new Date(),
        },
      ],
      interrupt: null,
      dismiss: vi.fn(),
    });

    render(<NotificationsPanel />);
    expect(screen.getByText(/Pipeline started/i)).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  });

  it("renders interrupt banner when interrupt is present", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [],
      interrupt: {
        commandId: "cmd-1",
        error: "Manual intervention needed",
        jobType: "generation",
        originalParams: {},
      },
      dismiss: vi.fn(),
    });

    render(<NotificationsPanel />);
    expect(screen.getByText(/INTERVENTION REQUIRED/i)).toBeInTheDocument();
    expect(screen.getByText(/Manual intervention needed/i)).toBeInTheDocument();
  });
});
