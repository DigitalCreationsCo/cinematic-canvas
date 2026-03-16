import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StartModal } from "./StartModal.js";
import '@testing-library/jest-dom'

vi.mock("lucide-react", () => ({
    Plus: () => <div>Plus Icon</div>,
    FolderOpen: () => <div>FolderOpen Icon</div>,
    Film: () => <div>Film Icon</div>,
}));

describe("StartModal", () => {
  it("should render when isOpen is true", () => {
    render(<StartModal isOpen={true} onSelectAction={vi.fn()} />);
    expect(screen.getByText("Welcome to Cinematic Canvas")).toBeInTheDocument();
  });

  it("should not render content when isOpen is false", () => {
    render(<StartModal isOpen={false} onSelectAction={vi.fn()} />);
    expect(screen.queryByText("Welcome to Cinematic Canvas")).not.toBeInTheDocument();
  });

  it("should call onSelectAction with correct values when buttons are clicked", () => {
    const onSelectAction = vi.fn();
    render(<StartModal isOpen={true} onSelectAction={onSelectAction} />);
    
    fireEvent.click(screen.getByText("New World"));
    expect(onSelectAction).toHaveBeenCalledWith("new-world");

    fireEvent.click(screen.getByText("Load World"));
    expect(onSelectAction).toHaveBeenCalledWith("load-world");

    fireEvent.click(screen.getByText("Projects"));
    expect(onSelectAction).toHaveBeenCalledWith("project");
  });
});