import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelectWorldModal } from "./SelectWorldModal.js";

describe("SelectWorldModal", () => {
  const defaultProps = {
    isOpen: true,
    onBack: vi.fn(),
    onSelectWorld: vi.fn(),
    onShowProjects: vi.fn()
  };

  it("should render list of worlds when isOpen is true", () => {
    render(<SelectWorldModal {...defaultProps} />);
    expect(screen.getByText("Your Worlds")).toBeInTheDocument();
    expect(screen.getByText("Cyberpunk City")).toBeInTheDocument();
    expect(screen.getByText("Fantasy Realm")).toBeInTheDocument();
    expect(screen.getByText("Deep Space Station")).toBeInTheDocument();
  });

  it("should not render when isOpen is false", () => {
    render(<SelectWorldModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText("Your Worlds")).not.toBeInTheDocument();
  });

  it("should call onBack when back button is clicked", () => {
    const onBack = vi.fn();
    render(<SelectWorldModal {...defaultProps} onBack={onBack} />);
    
    // The back button is a ghost button with the Globe icon inside
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]); // The back button is the first one in the header
    expect(onBack).toHaveBeenCalled();
  });

  it("should call onSelectWorld and onShowProjects when clicking corresponding buttons", () => {
    const onSelectWorld = vi.fn();
    const onShowProjects = vi.fn();
    render(<SelectWorldModal {...defaultProps} onSelectWorld={onSelectWorld} onShowProjects={onShowProjects} />);
    
    // Test Projects button
    const projectButtons = screen.getAllByRole("button", { name: /Projects/i });
    // Click the first one (Cyberpunk City: world-1)
    fireEvent.click(projectButtons[0]);
    expect(onShowProjects).toHaveBeenCalledWith("world-1");

    // Test Enter World button
    const enterButtons = screen.getAllByText(/Enter World/i);
    // Click the second one (Fantasy Realm: world-2)
    fireEvent.click(enterButtons[1]);
    expect(onSelectWorld).toHaveBeenCalledWith("world-2");
  });
});