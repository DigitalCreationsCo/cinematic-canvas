import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChatSidebar } from "#client/components/canvas/panels/ChatSidebar.js";

// Basic ChatSidebar test
describe("ChatSidebar", () => {
  it("renders when open", () => {
    // Need to mock useUIMenuStore and useChatStore
    render(<ChatSidebar />);
    expect(screen.getByText(/Chat/i)).toBeInTheDocument();
  });
});
