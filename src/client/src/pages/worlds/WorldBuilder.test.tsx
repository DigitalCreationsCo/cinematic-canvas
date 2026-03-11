import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorldBuilder } from "./WorldBuilder.js";

describe("WorldBuilder", () => {
  it("should render the World Builder interface", () => {
    render(<WorldBuilder onBack={vi.fn()} />);
    expect(screen.getByText("Exit Builder")).toBeInTheDocument();
  });

  it("should call onBack when Exit Builder is clicked", () => {
    const onBack = vi.fn();
    render(<WorldBuilder onBack={onBack} />);
    
    fireEvent.click(screen.getByText("Exit Builder"));
    expect(onBack).toHaveBeenCalled();
  });
});