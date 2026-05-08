// src/client/src/components/editor/mention/__tests__/MentionPopover.test.tsx
// Unit tests for the MentionPopover portal component.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MentionPopover } from "#client/components/editor/mention/MentionPopover.js";
import type { MentionSuggestion } from "#shared/types/mention.types.js";
import type { MentionTriggerState } from "#client/hooks/useMentionInput.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_SUGGESTIONS: MentionSuggestion[] = [
  {
    handle: "@LukeSkywalker",
    displayName: "Luke Skywalker",
    entityType: "character",
    scope: "project",
  },
  {
    handle: "@HanSolo",
    displayName: "Han Solo",
    entityType: "character",
    scope: "project",
  },
  {
    handle: "@Tatooine",
    displayName: "Tatooine",
    entityType: "location",
    scope: "world",
  },
  {
    handle: "@DeathStar",
    displayName: "Death Star",
    entityType: "location",
    scope: "project",
  },
  {
    handle: "@MillenniumFalcon",
    displayName: "Millennium Falcon",
    entityType: "prop",
    scope: "project",
  },
];

const CLOSED_STATE: MentionTriggerState = {
  isOpen: false,
  query: "",
  anchorRect: null,
  selectedIndex: 0,
};

const OPEN_STATE: MentionTriggerState = {
  isOpen: true,
  query: "Lu",
  anchorRect: new DOMRect(100, 200, 0, 0),
  selectedIndex: 0,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MentionPopover", () => {
  describe("rendering", () => {
    it("returns null when closed (isOpen=false)", () => {
      const { container } = render(
        <MentionPopover
          triggerState={CLOSED_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("returns null when open but no anchorRect", () => {
      const noRect = { ...OPEN_STATE, anchorRect: null };
      const { container } = render(
        <MentionPopover
          triggerState={noRect}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("renders suggestion items when open", () => {
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText("Luke Skywalker")).toBeInTheDocument();
      expect(screen.getByText("Han Solo")).toBeInTheDocument();
      expect(screen.getByText("Tatooine")).toBeInTheDocument();
    });

    it("renders handles for each suggestion", () => {
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText("@LukeSkywalker")).toBeInTheDocument();
      expect(screen.getByText("@HanSolo")).toBeInTheDocument();
    });

    it("renders entity type badges", () => {
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      // Should have 5 entity type badges (character, character, location, location, prop)
      const badges = screen.getAllByText(/character|location|prop/);
      expect(badges).toHaveLength(5);
    });

    it('renders "world" scope badge only for world-scoped entities', () => {
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const worldBadges = screen.getAllByText("world");
      expect(worldBadges).toHaveLength(1); // Only Tatooine is world-scoped
    });
  });

  describe("empty state", () => {
    it('shows "No matches found" when suggestions array is empty', () => {
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={[]}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText("No matches found")).toBeInTheDocument();
    });

    it("does not show suggestion list when empty", () => {
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={[]}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.queryByRole("option")).not.toBeInTheDocument();
    });
  });

  describe("click handling", () => {
    it("calls onSelect with the correct suggestion when a row is clicked", () => {
      const onSelect = vi.fn();
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={onSelect}
          onClose={vi.fn()}
        />,
      );

      fireEvent.mouseDown(screen.getByText("Luke Skywalker"));
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(MOCK_SUGGESTIONS[0]);
    });

    it("calls onSelect with the correct suggestion when a different row is clicked", () => {
      const onSelect = vi.fn();
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={onSelect}
          onClose={vi.fn()}
        />,
      );

      fireEvent.mouseDown(screen.getByText("Han Solo"));
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(MOCK_SUGGESTIONS[1]);
    });

    it("renders suggestion items with tabIndex={-1} for programmatic focus", () => {
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const options = screen.getAllByRole("option");
      options.forEach((opt) => {
        expect(opt).toHaveAttribute("tabindex", "-1");
      });
    });

    it("calls onSelect for the last suggestion when clicked", () => {
      const onSelect = vi.fn();
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={onSelect}
          onClose={vi.fn()}
        />,
      );

      fireEvent.mouseDown(screen.getByText("Millennium Falcon"));
      expect(onSelect).toHaveBeenCalledWith(
        MOCK_SUGGESTIONS[MOCK_SUGGESTIONS.length - 1],
      );
    });
  });

  describe("outside click", () => {
    it("calls onClose when clicking outside the popover container", () => {
      const onClose = vi.fn();
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={onClose}
        />,
      );

      // Click on document body (outside the popover)
      fireEvent.mouseDown(document.body);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not call onClose when clicking inside the popover", () => {
      const onClose = vi.fn();
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={onClose}
        />,
      );

      // Click on a suggestion inside the popover
      fireEvent.mouseDown(screen.getByText("Luke Skywalker"));
      expect(onClose).not.toHaveBeenCalled();
    });

    it("does not call onClose when clicking the empty state message", () => {
      const onClose = vi.fn();
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={[]}
          onSelect={vi.fn()}
          onClose={onClose}
        />,
      );

      fireEvent.mouseDown(screen.getByText("No matches found"));
      // onClose should NOT be called because the click is inside the container
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    it("has a listbox role", () => {
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("has aria-label on the listbox", () => {
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByRole("listbox")).toHaveAttribute(
        "aria-label",
        "Mention suggestions",
      );
    });

    it("each option has role=option and aria-selected", () => {
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(MOCK_SUGGESTIONS.length);
      options.forEach((opt) => {
        expect(opt).toHaveAttribute("aria-selected");
      });
    });

    it("marks the selected index as aria-selected=true", () => {
      const selectedState = { ...OPEN_STATE, selectedIndex: 2 };
      render(
        <MentionPopover
          triggerState={selectedState}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const options = screen.getAllByRole("option");
      expect(options[2]).toHaveAttribute("aria-selected", "true");
      expect(options[0]).toHaveAttribute("aria-selected", "false");
    });
  });

  describe("positioning", () => {
    it("is positioned fixed relative to the anchor rect", () => {
      render(
        <MentionPopover
          triggerState={OPEN_STATE}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      // Note: the popover is rendered as a portal to document.body
      const listbox = screen.getByRole("listbox");
      expect(listbox.style.position).toBe("fixed");
      expect(listbox.style.top).toBe("206px"); // anchorRect.bottom(200) + 6
      expect(listbox.style.left).toBe("100px");
      expect(listbox.style.zIndex).toBe("9999");
    });
  });

  describe("keyboard navigation visual state", () => {
    it("renders all suggestions even with a selectedIndex beyond array length", () => {
      const outOfRange = { ...OPEN_STATE, selectedIndex: 99 };
      render(
        <MentionPopover
          triggerState={outOfRange}
          suggestions={MOCK_SUGGESTIONS}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      // Should still render all suggestions
      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(MOCK_SUGGESTIONS.length);
    });
  });
});
