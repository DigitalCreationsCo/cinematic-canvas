// src/client/src/components/editor/mention/__tests__/MentionTextarea.test.tsx
// Integration tests for MentionTextarea (the public component).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MentionTextarea } from "#client/components/editor/mention/MentionTextArea.js";
import { useMentionStore } from "#client/store/useMentionStore.js";

// ─── Mock API ─────────────────────────────────────────────────────────────────

vi.mock("#client/lib/api.js", () => ({
  getMentionSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROJECT_ID = "test-project-abc";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MentionTextarea", () => {
  beforeEach(() => {
    useMentionStore.setState({ handleCache: {} });
  });

  describe("imperative handle", () => {
    it("exposes getValue, setValue, and focus via ref", () => {
      const ref = { current: null };
      render(
        <MentionTextarea
          ref={ref}
          projectId={PROJECT_ID}
        />,
      );

      expect(ref.current).not.toBeNull();
      expect(ref.current?.getValue).toBeInstanceOf(Function);
      expect(ref.current?.setValue).toBeInstanceOf(Function);
      expect(ref.current?.focus).toBeInstanceOf(Function);
    });

    it("getValue returns empty string initially", () => {
      const ref = { current: null };
      render(
        <MentionTextarea
          ref={ref}
          projectId={PROJECT_ID}
        />,
      );

      expect(ref.current?.getValue()).toBe("");
    });

    it("setValue/getValue roundtrip preserves mention chips", () => {
      const ref = { current: null };
      render(
        <MentionTextarea
          ref={ref}
          projectId={PROJECT_ID}
        />,
      );

      act(() => {
        ref.current?.setValue(
          '<span data-type="mention" data-handle="@LukeSkywalker">@Luke Skywalker</span>',
        );
      });

      const value = ref.current?.getValue();
      expect(value).toContain('data-type="mention"');
      expect(value).toContain('data-handle="@LukeSkywalker"');
      expect(value).not.toContain("\u200B");
    });

    it("setValue/getValue roundtrip strips HTML tags from plain text", () => {
      const ref = { current: null };
      render(
        <MentionTextarea
          ref={ref}
          projectId={PROJECT_ID}
        />,
      );

      act(() => {
        ref.current?.setValue("<b>Hello</b> <i>World</i>");
      });

      expect(ref.current?.getValue()).toBe("Hello World");
    });
  });

  describe("placeholder", () => {
    it("shows placeholder when editor is empty", () => {
      render(
        <MentionTextarea
          projectId={PROJECT_ID}
          placeholder="Type your story..."
        />,
      );

      expect(screen.getByText("Type your story...")).toBeInTheDocument();
    });

    it("hides placeholder when editor has content", () => {
      const ref = { current: null };
      render(
        <MentionTextarea
          ref={ref}
          projectId={PROJECT_ID}
          placeholder="Type your story..."
        />,
      );

      act(() => {
        ref.current?.setValue("Some content");
      });

      expect(screen.queryByText("Type your story...")).not.toBeInTheDocument();
    });

    it("does not render placeholder div when placeholder prop is not provided", () => {
      const { container } = render(
        <MentionTextarea
          projectId={PROJECT_ID}
        />,
      );

      const placeholders = container.querySelectorAll('[aria-hidden="true"]');
      expect(placeholders.length).toBe(0);
    });
  });

  describe("onUpdate callback", () => {
    it("is not called when content is set via imperative setValue", () => {
      const onUpdate = vi.fn();
      const ref = { current: null };
      render(
        <MentionTextarea
          ref={ref}
          projectId={PROJECT_ID}
          onUpdate={onUpdate}
        />,
      );

      act(() => {
        ref.current?.setValue("Hello World");
      });

      // The imperative setValue is for programmatic restore, not user input,
      // so it does NOT fire onUpdate.
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("is called when the hook's handleInput fires", () => {
      const onUpdate = vi.fn();
      render(
        <MentionTextarea
          projectId={PROJECT_ID}
          onUpdate={onUpdate}
        />,
      );

      act(() => {
        // Simulate a user-input event by firing input on the editor
        const editor = document.querySelector('[contenteditable]');
        if (editor) {
          editor.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });

      // The input event triggers handleInput which calls onUpdate
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  describe("initialContent", () => {
    it("renders with initial content", () => {
      const ref = { current: null };
      render(
        <MentionTextarea
          ref={ref}
          projectId={PROJECT_ID}
          initialContent="Starting text"
        />,
      );

      expect(ref.current?.getValue()).toContain("Starting text");
    });

    it("hides placeholder when initial content is provided", () => {
      render(
        <MentionTextarea
          projectId={PROJECT_ID}
          initialContent="Already has text"
          placeholder="Placeholder text"
        />,
      );

      expect(screen.queryByText("Placeholder text")).not.toBeInTheDocument();
    });

    it("renders initial content with mention chips preserved", () => {
      const ref = { current: null };
      render(
        <MentionTextarea
          ref={ref}
          projectId={PROJECT_ID}
          initialContent={
            '<span data-type="mention" data-handle="@LukeSkywalker">@Luke Skywalker</span>'
          }
        />,
      );

      const value = ref.current?.getValue();
      expect(value).toContain('data-type="mention"');
      expect(value).toContain('data-handle="@LukeSkywalker"');
    });
  });

  describe("disabled state", () => {
    it("sets contenteditable=false when disabled prop is true", () => {
      const { container } = render(
        <MentionTextarea
          projectId={PROJECT_ID}
          disabled={true}
        />,
      );

      const editor = container.querySelector('[contenteditable]');
      expect(editor).toHaveAttribute("contenteditable", "false");
    });

    it("defaults to contenteditable=true", () => {
      const { container } = render(
        <MentionTextarea
          projectId={PROJECT_ID}
        />,
      );

      const editor = container.querySelector('[contenteditable]');
      expect(editor).toHaveAttribute("contenteditable", "true");
    });
  });

  describe("rows prop", () => {
    it("sets min-height based on rows prop", () => {
      const { container } = render(
        <MentionTextarea
          projectId={PROJECT_ID}
          rows={3}
        />,
      );

      const editor = container.querySelector('[contenteditable]') as HTMLElement;
      expect(editor.style.minHeight).toBe("4.5rem");
    });

    it("defaults to 5 rows when not specified", () => {
      const { container } = render(
        <MentionTextarea
          projectId={PROJECT_ID}
        />,
      );

      const editor = container.querySelector('[contenteditable]') as HTMLElement;
      expect(editor.style.minHeight).toBe("7.5rem");
    });
  });
});
