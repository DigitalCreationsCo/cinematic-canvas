import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NotificationsPanel } from "#client/components/canvas/panels/NotificationsPanel.js";

// Mock stores
vi.mock("#client/store/useUIMenuStore.js", () => {
  const selectAuxiliarySidebarWidth = () => 0;
  return {
    selectAuxiliarySidebarWidth,
    useUIMenuStore: (selector: (s: any) => any) => {
      const state = {
        notificationsPanelOpen: true,
        closeNotificationsPanel: vi.fn(),
        auxiliarySidebarWidth: 0,
      };
      return selector(state);
    },
  };
});

vi.mock("#client/store/usePipelineStore.js", () => ({
  usePipelineStore: (selector: (s: any) => any) => {
    const state = {
      events: [],
    };
    return selector(state);
  },
}));

vi.mock("#client/store/useCanvasUIStore.js", () => ({
  useCanvasUIStore: (selector: (s: any) => any) => {
    const state = {
      rightSidebarOpen: false,
    };
    return selector(state);
  },
  RIGHT_SIDEBAR_DEFAULT_WIDTH: 384,
  SIDEBAR_GAP: 12,
}));

vi.mock("#client/hooks/useNotifications.js", () => ({
  useNotifications: () => ({
    notifications: [],
    dismiss: vi.fn(),
  }),
}));

describe("NotificationsPanel", () => {
  it("renders the panel header when open", () => {
    render(<NotificationsPanel />);
    expect(screen.getByText(/Notifications/i)).toBeInTheDocument();
  });
});
