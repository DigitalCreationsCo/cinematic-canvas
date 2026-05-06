/** @vitest-environment happy-dom */
import { createMockWorld } from "#shared/mocks/mock-world.js";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { WorldRoot } from "#client/pages/worlds/WorldRoot.js";
import userEvent, { UserEvent } from "@testing-library/user-event";

vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
}));

// vi.mock("#shared/client/hooks/useWorlds.ts", () => ({
//   useWorlds: vi.fn().mockResolvedValue({
//     worlds: [createMockWorld()],
//     isLoading: false,
//     error: null,
//   }),
// }));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: vi.fn(),
  useQuery: vi.fn().mockReturnValue({
    data: {
      worlds: [createMockWorld(), createMockWorld()],
    },
    error: null,
    isLoading: false,
  }),
}));

vi.mock("#client/components/Header.tsx", () => ({
  default: vi.fn(),
}));

describe("WorldRoot", () => {
  const mockOnOpenProjectModal = vi.fn();
  let user: UserEvent;

  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders StartModal initially", () => {
    render(
      <WorldRoot
        onOpenProjectModal={mockOnOpenProjectModal}
        isEnteringWorldSpace={false}
        setIsEnteringWorldSpace={vi.fn()}
      />,
    );

    expect(screen.getByTestId("start-modal")).toBeInTheDocument();
    expect(screen.queryByTestId("select-world-modal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("world-builder")).not.toBeInTheDocument();
  });

  it("transitions to WorldBuilder when New World is selected", () => {
    render(
      <WorldRoot
        onOpenProjectModal={mockOnOpenProjectModal}
        isEnteringWorldSpace={false}
        setIsEnteringWorldSpace={vi.fn()}
      />,
    );

    // Click New World
    fireEvent.click(screen.getByTestId("button-new-world"));

    expect(screen.queryByTestId("start-modal")).not.toBeInTheDocument();
    expect(screen.getByTestId("world-builder")).toBeInTheDocument();
  });

  it("transitions to SelectWorldModal when Load World is selected", () => {
    render(
      <WorldRoot
        onOpenProjectModal={mockOnOpenProjectModal}
        isEnteringWorldSpace={false}
        setIsEnteringWorldSpace={vi.fn()}
      />,
    );

    // Click Load World
    fireEvent.click(screen.getByTestId("button-load-world"));

    expect(screen.queryByTestId("start-modal")).not.toBeInTheDocument();
    expect(screen.getByTestId("select-world-modal")).toBeInTheDocument();
  });

  it("calls onOpenProjectModal when Project is selected", () => {
    render(
      <WorldRoot
        onOpenProjectModal={mockOnOpenProjectModal}
        isEnteringWorldSpace={false}
        setIsEnteringWorldSpace={vi.fn()}
      />,
    );

    // Click Project
    fireEvent.click(screen.getByTestId("button-select-project"));

    expect(mockOnOpenProjectModal).toHaveBeenCalledTimes(1);
    // Should still show StartModal behind it
    expect(screen.getByTestId("start-modal")).toBeInTheDocument();
  });

  it("handles back navigation from WorldBuilder", () => {
    render(
      <WorldRoot
        onOpenProjectModal={mockOnOpenProjectModal}
        isEnteringWorldSpace={false}
        setIsEnteringWorldSpace={vi.fn()}
      />,
    );

    // Go to WorldBuilder
    fireEvent.click(screen.getByTestId("button-new-world"));
    expect(screen.getByTestId("world-builder")).toBeInTheDocument();

    // Click Back
    fireEvent.click(screen.getByTestId("button-back"));

    expect(screen.queryByTestId("world-builder")).not.toBeInTheDocument();
    expect(screen.getByTestId("start-modal")).toBeInTheDocument();
  });

  it("handles back navigation from SelectWorldModal", async () => {
    render(
      <WorldRoot
        onOpenProjectModal={mockOnOpenProjectModal}
        isEnteringWorldSpace={false}
        setIsEnteringWorldSpace={vi.fn()}
      />,
    );

    const welcomeModalStart = screen.queryByTestId("button-welcome-start");
    if (welcomeModalStart) fireEvent.click(welcomeModalStart);

    fireEvent.click(screen.getByTestId("button-load-world"));
    const selectWorldModal = screen.getByTestId("select-world-modal");
    expect(selectWorldModal).toBeInTheDocument();

    // Click Close
    await user.click(within(selectWorldModal).getByTestId("dialog-close"));

    expect(selectWorldModal).not.toBeInTheDocument();
    expect(screen.getByTestId("start-modal")).toBeInTheDocument();
  });

  it("handles select world action for the second world in the list", async () => {
    render(
      <WorldRoot
        onOpenProjectModal={mockOnOpenProjectModal}
        isEnteringWorldSpace={false}
        setIsEnteringWorldSpace={vi.fn()}
      />,
    );

    const welcomeModalStart = screen.queryByTestId("button-welcome-start");
    if (welcomeModalStart) fireEvent.click(welcomeModalStart);

    await user.click(screen.getByTestId("button-load-world"));

    const worldCards = screen.getAllByTestId("world-card");
    const secondWorldCard = worldCards[1];

    // Verify we are actually on the world we think we are
    expect(secondWorldCard).toBeInTheDocument();

    // Then click the button inside that specific card
    await user.click(within(secondWorldCard).getByTestId("button-enter-world"));

    // // 1. Trigger the modal/view to load
    // await user.click(screen.getByTestId("button-load-world"));

    // // 2. Get all "Enter World" buttons
    // const enterButtons = screen.getAllByTestId("button-enter-world");

    // // 3. Use array indexing to click the second world (index 1)
    // // This assumes your mock data has at least two worlds.
    // await user.click(enterButtons[1]);

    // // 4. Assertions
    // expect(screen.queryByTestId("select-world-modal")).not.toBeInTheDocument();
    // expect(screen.getByTestId("world-builder")).toBeInTheDocument();
  });

  it("handles show projects action from SelectWorldModal", async () => {
    render(
      <WorldRoot
        onOpenProjectModal={mockOnOpenProjectModal}
        isEnteringWorldSpace={false}
        setIsEnteringWorldSpace={vi.fn()}
      />,
    );

    // clear welcome modal if it opens
    const welcomeModalStart = screen.queryByTestId("button-welcome-start");
    if (welcomeModalStart) fireEvent.click(welcomeModalStart);

    // 1. Open the modal
    await user.click(screen.getByTestId("button-load-world"));

    // 2. Use findAllBy to wait for the cards to finish loading and render
    // This replaces screen.getAllByTestId
    const worldCards = await screen.findAllByTestId("world-card");

    const secondWorldCard = worldCards[1];
    expect(worldCards[0]).toBeInTheDocument();
    expect(secondWorldCard).toBeInTheDocument();

    // 3. Click the projects button specifically inside the second card
    const projectsButton = within(secondWorldCard).getByTestId("button-world-projects");
    await user.click(projectsButton);

    // 4. Assertions
    expect(mockOnOpenProjectModal).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("select-world-modal")).toBeInTheDocument();
  });
});
