import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorldRoot } from "./WorldRoot.js";

vi.mock("#/hooks/use-swr-api.js", () => ({
  useWorlds: vi.fn(() => ({
    worlds: [
      { id: "world-1", name: "Cyberpunk City", description: "A neon-lit future" },
      { id: "world-2", name: "Fantasy Realm", description: "Dragons and magic" },
      { id: "world-3", name: "Deep Space Station", description: "Sci-fi adventure" }
    ],
    isLoading: false,
    isError: null
  }))
}));
vi.mock("../../hooks/use-swr-api.js", () => ({
  useWorlds: vi.fn(() => ({
    worlds: [
      { id: "world-1", name: "Cyberpunk City", description: "A neon-lit future" },
      { id: "world-2", name: "Fantasy Realm", description: "Dragons and magic" },
      { id: "world-3", name: "Deep Space Station", description: "Sci-fi adventure" }
    ],
    isLoading: false,
    isError: null
  }))
}));
// Mock wouter location hook
vi.mock("wouter", () => ({
  useLocation: vi.fn(() => ["/", vi.fn()])
}));

describe("WorldRoot", () => {
  const onOpenProjectModal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render StartModal initially", () => {
    render(<WorldRoot onOpenProjectModal={onOpenProjectModal} />);
    expect(screen.getByText("Welcome to Cinematic Canvas")).toBeInTheDocument();
    expect(screen.queryByText("World Builder")).not.toBeInTheDocument();
    expect(screen.queryByText("Your Worlds")).not.toBeInTheDocument();
  });

  it("should transition to WorldBuilder when 'New World' is clicked", () => {
    render(<WorldRoot onOpenProjectModal={onOpenProjectModal} />);
    
    fireEvent.click(screen.getByText("New World"));
    
    expect(screen.getByText("World Builder")).toBeInTheDocument();
    expect(screen.queryByText("Welcome to Cinematic Canvas")).not.toBeInTheDocument();
  });

  it("should transition to SelectWorldModal when 'Load World' is clicked", () => {
    render(<WorldRoot onOpenProjectModal={onOpenProjectModal} />);
    
    fireEvent.click(screen.getByText("Load World"));
    
    expect(screen.getByText("Your Worlds")).toBeInTheDocument();
  });

  it("should call onOpenProjectModal when 'Projects' is clicked from StartModal", () => {
    render(<WorldRoot onOpenProjectModal={onOpenProjectModal} />);
    
    fireEvent.click(screen.getByText("Projects"));
    
    expect(onOpenProjectModal).toHaveBeenCalled();
  });

  it("should transition back to start when onBack is called from WorldBuilder", () => {
    render(<WorldRoot onOpenProjectModal={onOpenProjectModal} />);
    
    // Go to builder
    fireEvent.click(screen.getByText("New World"));
    expect(screen.getByText("World Builder")).toBeInTheDocument();

    // Go back
    fireEvent.click(screen.getByText("Exit Builder"));
    expect(screen.getByText("Welcome to Cinematic Canvas")).toBeInTheDocument();
  });

  it("should transition back to start when onBack is called from SelectWorldModal", () => {
    render(<WorldRoot onOpenProjectModal={onOpenProjectModal} />);
    
    // Go to load world
    fireEvent.click(screen.getByText("Load World"));
    expect(screen.getByText("Your Worlds")).toBeInTheDocument();

    // Go back (the first button in SelectWorldModal is the back button)
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(screen.getByText("Welcome to Cinematic Canvas")).toBeInTheDocument();
  });
  
  it("should call onOpenProjectModal when 'Projects' is clicked from SelectWorldModal", () => {
    render(<WorldRoot onOpenProjectModal={onOpenProjectModal} />);
    
    // Go to load world
    fireEvent.click(screen.getByText("Load World"));
    // Click Projects on the first world
    const projectButtons = screen.getAllByRole("button", { name: /Projects/i });
    fireEvent.click(projectButtons[0]);
    
    expect(onOpenProjectModal).toHaveBeenCalled();
  });
  
  it("should transition to WorldBuilder when a world is selected from SelectWorldModal", () => {
    render(<WorldRoot onOpenProjectModal={onOpenProjectModal} />);
    
    // Go to load world
    fireEvent.click(screen.getByText("Load World"));
    
    // Click Enter World
    const enterButtons = screen.getAllByText(/Enter World/i);
    fireEvent.click(enterButtons[0]);
    
    expect(screen.getByText("World Builder")).toBeInTheDocument();
  });
});