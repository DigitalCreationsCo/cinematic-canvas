import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NotificationsPanel } from "#client/components/canvas/panels/NotificationsPanel.js";

describe("NotificationsPanel", () => {
  it("renders when open", () => {
    // Need to mock useUIMenuStore and usePipelineStore
    render(<NotificationsPanel />);
    expect(screen.getByText(/Notifications/i)).toBeInTheDocument();
  });
});
