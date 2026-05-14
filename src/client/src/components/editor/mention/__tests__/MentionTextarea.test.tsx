// src/client/src/components/editor/mention/__tests__/MentionTextarea.test.tsx
// Integration tests for MentionTextarea (the public component).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { MentionTextarea } from "#client/components/editor/mention/MentionTextArea.js";
import { useMentionStore } from "#client/store/useMentionStore.js";

// ─── Mock API ─────────────────────────────────────────────────────────────────

vi.mock("#client/lib/api.js", () => ({
  getMentionSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROJECT_ID = "test-project-abc";

// ─── Shared query helpers ─────────────────────────────────────────────────────

/** Returns the inner contentEditable div (the actual editor surface). */
const getEditor = (container: HTMLElement): HTMLElement =>
  container.querySelector("[contenteditable]") as HTMLElement;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MentionTextarea", () => {
  beforeEach(() => {
    useMentionStore.setState({ handleCache: {} });
  });

  // ── Existing suites (unchanged) ─────────────────────────────────────────────

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
        const editor = document.querySelector("[contenteditable]");
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

      const editor = container.querySelector("[contenteditable]");
      expect(editor).toHaveAttribute("contenteditable", "false");
    });

    it("defaults to contenteditable=true", () => {
      const { container } = render(
        <MentionTextarea
          projectId={PROJECT_ID}
        />,
      );

      const editor = container.querySelector("[contenteditable]");
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

      const editor = container.querySelector("[contenteditable]") as HTMLElement;
      expect(editor.style.minHeight).toBe("4.5rem");
    });

    it("defaults to 5 rows when not specified", () => {
      const { container } = render(
        <MentionTextarea
          projectId={PROJECT_ID}
        />,
      );

      const editor = container.querySelector("[contenteditable]") as HTMLElement;
      expect(editor.style.minHeight).toBe("7.5rem");
    });
  });

  // ── NEW: Event handler composition ─────────────────────────────────────────
  //
  // The internal mention handler (popover dismiss, chip insertion) always runs
  // first.  External handlers follow via composeHandlers().  Tests here verify
  // that the external handler fires, receives the correct event, and that
  // composition never breaks internal behaviour.

  describe("event handler composition", () => {
    describe("onKeyDown", () => {
      it("is called when a key is pressed", () => {
        const onKeyDown = vi.fn();
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onKeyDown={onKeyDown} />,
        );

        fireEvent.keyDown(getEditor(container), { key: "a" });

        expect(onKeyDown).toHaveBeenCalledOnce();
      });

      it("receives the correct synthetic event", () => {
        const onKeyDown = vi.fn();
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onKeyDown={onKeyDown} />,
        );

        fireEvent.keyDown(getEditor(container), { key: "Enter", shiftKey: true });

        expect(onKeyDown).toHaveBeenCalledWith(
          expect.objectContaining({ key: "Enter", shiftKey: true }),
        );
      });

      it("external onKeyDown fires even when internal mention handler is present", () => {
        // Escape is handled internally (closes the popover). The external
        // handler must still be invoked afterward.
        const onKeyDown = vi.fn();
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onKeyDown={onKeyDown} />,
        );

        fireEvent.keyDown(getEditor(container), { key: "Escape" });

        expect(onKeyDown).toHaveBeenCalledOnce();
      });

      it("calling preventDefault() inside external handler does not throw", () => {
        const onKeyDown = vi.fn((e: React.KeyboardEvent) => e.preventDefault());
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onKeyDown={onKeyDown} />,
        );

        expect(() =>
          fireEvent.keyDown(getEditor(container), { key: "Enter" }),
        ).not.toThrow();
        expect(onKeyDown).toHaveBeenCalledOnce();
      });

      it("is called once per keydown even when multiple rerenders have occurred", () => {
        // Guards against duplicate handler registration from stale closures.
        const onKeyDown = vi.fn();
        const { container, rerender } = render(
          <MentionTextarea projectId={PROJECT_ID} onKeyDown={onKeyDown} />,
        );
        rerender(<MentionTextarea projectId={PROJECT_ID} onKeyDown={onKeyDown} />);
        rerender(<MentionTextarea projectId={PROJECT_ID} onKeyDown={onKeyDown} />);

        fireEvent.keyDown(getEditor(container), { key: "a" });

        expect(onKeyDown).toHaveBeenCalledOnce();
      });
    });

    describe("onKeyUp", () => {
      it("is called when a key is released", () => {
        const onKeyUp = vi.fn();
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onKeyUp={onKeyUp} />,
        );

        fireEvent.keyUp(getEditor(container), { key: "a" });

        expect(onKeyUp).toHaveBeenCalledOnce();
      });

      it("receives the correct key in the event", () => {
        const onKeyUp = vi.fn();
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onKeyUp={onKeyUp} />,
        );

        fireEvent.keyUp(getEditor(container), { key: "Tab" });

        expect(onKeyUp).toHaveBeenCalledWith(
          expect.objectContaining({ key: "Tab" }),
        );
      });
    });

    describe("onFocus / onBlur", () => {
      it("onFocus fires when the editor gains focus", () => {
        const onFocus = vi.fn();
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onFocus={onFocus} />,
        );

        fireEvent.focus(getEditor(container));

        expect(onFocus).toHaveBeenCalledOnce();
      });

      it("onBlur fires when the editor loses focus", () => {
        const onBlur = vi.fn();
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onBlur={onBlur} />,
        );
        const editor = getEditor(container);

        fireEvent.focus(editor);
        fireEvent.blur(editor);

        expect(onBlur).toHaveBeenCalledOnce();
      });

      it("onFocus and onBlur can be independent handlers", () => {
        const onFocus = vi.fn();
        const onBlur = vi.fn();
        const { container } = render(
          <MentionTextarea
            projectId={PROJECT_ID}
            onFocus={onFocus}
            onBlur={onBlur}
          />,
        );
        const editor = getEditor(container);

        fireEvent.focus(editor);
        fireEvent.blur(editor);

        expect(onFocus).toHaveBeenCalledOnce();
        expect(onBlur).toHaveBeenCalledOnce();
      });
    });

    describe("onPaste", () => {
      it("is called when content is pasted into the editor", () => {
        const onPaste = vi.fn();
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onPaste={onPaste} />,
        );

        fireEvent.paste(getEditor(container));

        expect(onPaste).toHaveBeenCalledOnce();
      });

      it("receives the clipboard event", () => {
        const onPaste = vi.fn();
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onPaste={onPaste} />,
        );

        fireEvent.paste(getEditor(container));

        expect(onPaste).toHaveBeenCalledWith(
          expect.objectContaining({ type: "paste" }),
        );
      });
    });

    describe("onCopy / onCut", () => {
      it("onCopy fires on copy", () => {
        const onCopy = vi.fn();
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onCopy={onCopy} />,
        );

        fireEvent.copy(getEditor(container));

        expect(onCopy).toHaveBeenCalledOnce();
      });

      it("onCut fires on cut", () => {
        const onCut = vi.fn();
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onCut={onCut} />,
        );

        fireEvent.cut(getEditor(container));

        expect(onCut).toHaveBeenCalledOnce();
      });
    });

    describe("onClick / onDoubleClick", () => {
      it("onClick fires when the editor surface is clicked", () => {
        const onClick = vi.fn();
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onClick={onClick} />,
        );

        fireEvent.click(getEditor(container));

        expect(onClick).toHaveBeenCalledOnce();
      });

      it("onDoubleClick fires on a double-click", () => {
        const onDoubleClick = vi.fn();
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onDoubleClick={onDoubleClick} />,
        );

        fireEvent.dblClick(getEditor(container));

        expect(onDoubleClick).toHaveBeenCalledOnce();
      });
    });

    describe("composition / IME", () => {
      it("onCompositionStart fires at the start of IME composition", () => {
        const onCompositionStart = vi.fn();
        const { container } = render(
          <MentionTextarea
            projectId={PROJECT_ID}
            onCompositionStart={onCompositionStart}
          />,
        );

        fireEvent.compositionStart(getEditor(container));

        expect(onCompositionStart).toHaveBeenCalledOnce();
      });

      it("onCompositionEnd fires at the end of IME composition", () => {
        const onCompositionEnd = vi.fn();
        const { container } = render(
          <MentionTextarea
            projectId={PROJECT_ID}
            onCompositionEnd={onCompositionEnd}
          />,
        );

        fireEvent.compositionEnd(getEditor(container));

        expect(onCompositionEnd).toHaveBeenCalledOnce();
      });

      it("onCompositionUpdate fires during IME composition", () => {
        const onCompositionUpdate = vi.fn();
        const { container } = render(
          <MentionTextarea
            projectId={PROJECT_ID}
            onCompositionUpdate={onCompositionUpdate}
          />,
        );

        fireEvent.compositionUpdate(getEditor(container));

        expect(onCompositionUpdate).toHaveBeenCalledOnce();
      });
    });

    describe("handler independence", () => {
      it("omitting onKeyDown does not prevent onKeyUp from firing", () => {
        // Ensures composeHandlers() short-circuits cleanly when one side is absent.
        const onKeyUp = vi.fn();
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} onKeyUp={onKeyUp} />,
        );

        // No onKeyDown — this should not throw or interfere.
        fireEvent.keyDown(getEditor(container), { key: "a" });
        fireEvent.keyUp(getEditor(container), { key: "a" });

        expect(onKeyUp).toHaveBeenCalledOnce();
      });

      it("all handlers can coexist without interfering", () => {
        const handlers = {
          onKeyDown: vi.fn(),
          onKeyUp: vi.fn(),
          onFocus: vi.fn(),
          onBlur: vi.fn(),
          onClick: vi.fn(),
        };
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} {...handlers} />,
        );
        const editor = getEditor(container);

        fireEvent.focus(editor);
        fireEvent.keyDown(editor, { key: "a" });
        fireEvent.keyUp(editor, { key: "a" });
        fireEvent.click(editor);
        fireEvent.blur(editor);

        expect(handlers.onFocus).toHaveBeenCalledOnce();
        expect(handlers.onKeyDown).toHaveBeenCalledOnce();
        expect(handlers.onKeyUp).toHaveBeenCalledOnce();
        expect(handlers.onClick).toHaveBeenCalledOnce();
        expect(handlers.onBlur).toHaveBeenCalledOnce();
      });
    });
  });

  // ── NEW: HTML attribute inheritance ────────────────────────────────────────
  //
  // Standard HTML attrs, ARIA attrs, and data-* attrs must all land on the
  // inner contentEditable div — not on the wrapper div.

  describe("HTML attribute inheritance", () => {
    describe("standard attributes", () => {
      it("sets id on the editor div", () => {
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} id="scene-editor" />,
        );
        expect(getEditor(container)).toHaveAttribute("id", "scene-editor");
      });

      it("sets tabIndex on the editor div", () => {
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} tabIndex={3} />,
        );
        // jsdom lowercases attribute names
        expect(getEditor(container)).toHaveAttribute("tabindex", "3");
      });

      it("tabIndex={-1} makes the editor programmatically focusable but not tab-reachable", () => {
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} tabIndex={-1} />,
        );
        expect(getEditor(container)).toHaveAttribute("tabindex", "-1");
      });

      it("sets spellCheck=false on the editor div", () => {
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} spellCheck={false} />,
        );
        expect(getEditor(container)).toHaveAttribute("spellcheck", "false");
      });

      it("sets spellCheck=true on the editor div", () => {
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} spellCheck={true} />,
        );
        expect(getEditor(container)).toHaveAttribute("spellcheck", "true");
      });

      it("sets dir=rtl on the editor div", () => {
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} dir="rtl" />,
        );
        expect(getEditor(container)).toHaveAttribute("dir", "rtl");
      });

      it("sets lang on the editor div", () => {
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} lang="ja" />,
        );
        expect(getEditor(container)).toHaveAttribute("lang", "ja");
      });
    });

    describe("ARIA attributes", () => {
      it("always exposes role=textbox and aria-multiline=true", () => {
        // These are fixed by the component and must not be overridden by consumer.
        const { container } = render(<MentionTextarea projectId={PROJECT_ID} />);
        const editor = getEditor(container);
        expect(editor).toHaveAttribute("role", "textbox");
        expect(editor).toHaveAttribute("aria-multiline", "true");
      });

      it("sets aria-label on the editor div", () => {
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} aria-label="Scene description" />,
        );
        expect(getEditor(container)).toHaveAttribute(
          "aria-label",
          "Scene description",
        );
      });

      it("sets aria-labelledby on the editor div", () => {
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} aria-labelledby="label-id" />,
        );
        expect(getEditor(container)).toHaveAttribute(
          "aria-labelledby",
          "label-id",
        );
      });

      it("sets aria-describedby on the editor div", () => {
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} aria-describedby="hint-text" />,
        );
        expect(getEditor(container)).toHaveAttribute(
          "aria-describedby",
          "hint-text",
        );
      });

      it("sets aria-required=true on the editor div", () => {
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} aria-required="true" />,
        );
        expect(getEditor(container)).toHaveAttribute("aria-required", "true");
      });

      it("sets aria-invalid=true on the editor div", () => {
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} aria-invalid="true" />,
        );
        expect(getEditor(container)).toHaveAttribute("aria-invalid", "true");
      });

      it("sets aria-invalid=grammar on the editor div", () => {
        const { container } = render(
          <MentionTextarea projectId={PROJECT_ID} aria-invalid="grammar" />,
        );
        expect(getEditor(container)).toHaveAttribute("aria-invalid", "grammar");
      });

      it("sets aria-placeholder matching the placeholder prop", () => {
        const { container } = render(
          <MentionTextarea
            projectId={PROJECT_ID}
            placeholder="Write a scene..."
          />,
        );
        expect(getEditor(container)).toHaveAttribute(
          "aria-placeholder",
          "Write a scene...",
        );
      });

      it("does not set aria-placeholder when placeholder is absent", () => {
        const { container } = render(<MentionTextarea projectId={PROJECT_ID} />);
        // aria-placeholder should be undefined / absent
        expect(getEditor(container)).not.toHaveAttribute("aria-placeholder");
      });
    });

    describe("data-* attribute passthrough", () => {
      it("forwards data-testid to the editor div", () => {
        const { container } = render(
          <MentionTextarea
            projectId={PROJECT_ID}
            data-testid="scene-description-editor"
          />,
        );
        expect(getEditor(container)).toHaveAttribute(
          "data-testid",
          "scene-description-editor",
        );
      });

      it("forwards arbitrary data-* attributes", () => {
        const { container } = render(
          <MentionTextarea
            projectId={PROJECT_ID}
            data-scene-id="scene-42"
            data-field="description"
          />,
        );
        const editor = getEditor(container);
        expect(editor).toHaveAttribute("data-scene-id", "scene-42");
        expect(editor).toHaveAttribute("data-field", "description");
      });

      it("forwards multiple data-* attributes simultaneously", () => {
        const { container } = render(
          <MentionTextarea
            projectId={PROJECT_ID}
            data-track="true"
            data-context="chat"
            data-version="2"
          />,
        );
        const editor = getEditor(container);
        expect(editor).toHaveAttribute("data-track", "true");
        expect(editor).toHaveAttribute("data-context", "chat");
        expect(editor).toHaveAttribute("data-version", "2");
      });

      it("data-* attrs do not bleed onto the wrapper div", () => {
        // Only the inner editor div should carry the attribute; the outer
        // wrapper should stay clean.
        const { container } = render(
          <MentionTextarea
            projectId={PROJECT_ID}
            data-testid="my-editor"
          />,
        );
        // The first child of the rendered output is the wrapper div
        const wrapper = container.firstElementChild as HTMLElement;
        expect(wrapper).not.toHaveAttribute("data-testid");
      });
    });
  });

  // ── NEW: Controlled value prop ─────────────────────────────────────────────
  //
  // When `value` is provided the component acts as a controlled input.
  // The editor content must stay in sync with the prop without causing
  // cursor jumps or spurious onUpdate calls.

  describe("controlled value prop", () => {
    it("initialises editor content from value prop on mount", () => {
      const ref = { current: null };
      render(
        <MentionTextarea
          ref={ref}
          projectId={PROJECT_ID}
          value="Hello controlled"
        />,
      );

      expect(ref.current?.getValue()).toContain("Hello controlled");
    });

    it("updates editor content when value prop changes", () => {
      const ref = { current: null };
      const { rerender } = render(
        <MentionTextarea ref={ref} projectId={PROJECT_ID} value="first value" />,
      );
      expect(ref.current?.getValue()).toContain("first value");

      rerender(
        <MentionTextarea ref={ref} projectId={PROJECT_ID} value="second value" />,
      );

      expect(ref.current?.getValue()).toContain("second value");
    });

    it("clears the editor when value prop changes to empty string", () => {
      const ref = { current: null };
      const { rerender } = render(
        <MentionTextarea ref={ref} projectId={PROJECT_ID} value="Some text" />,
      );

      rerender(<MentionTextarea ref={ref} projectId={PROJECT_ID} value="" />);

      expect(ref.current?.getValue()).toBe("");
    });

    it("shows the placeholder when controlled value becomes empty", () => {
      const { rerender } = render(
        <MentionTextarea
          projectId={PROJECT_ID}
          placeholder="Type here..."
          value="Some text"
        />,
      );
      expect(screen.queryByText("Type here...")).not.toBeInTheDocument();

      rerender(
        <MentionTextarea
          projectId={PROJECT_ID}
          placeholder="Type here..."
          value=""
        />,
      );

      expect(screen.getByText("Type here...")).toBeInTheDocument();
    });

    it("hides the placeholder when controlled value becomes non-empty", () => {
      const { rerender } = render(
        <MentionTextarea
          projectId={PROJECT_ID}
          placeholder="Type here..."
          value=""
        />,
      );
      expect(screen.getByText("Type here...")).toBeInTheDocument();

      rerender(
        <MentionTextarea
          projectId={PROJECT_ID}
          placeholder="Type here..."
          value="Now I have content"
        />,
      );

      expect(screen.queryByText("Type here...")).not.toBeInTheDocument();
    });

    it("does not call onUpdate when value prop changes (sync is not user input)", () => {
      const onUpdate = vi.fn();
      const { rerender } = render(
        <MentionTextarea
          projectId={PROJECT_ID}
          value="initial"
          onUpdate={onUpdate}
        />,
      );

      rerender(
        <MentionTextarea
          projectId={PROJECT_ID}
          value="updated externally"
          onUpdate={onUpdate}
        />,
      );

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("does not corrupt editor content when the same value prop is re-provided", () => {
      // Verifies the prevValueRef diff-check prevents unnecessary resets.
      const ref = { current: null };
      const { rerender } = render(
        <MentionTextarea ref={ref} projectId={PROJECT_ID} value="stable" />,
      );

      rerender(<MentionTextarea ref={ref} projectId={PROJECT_ID} value="stable" />);
      rerender(<MentionTextarea ref={ref} projectId={PROJECT_ID} value="stable" />);

      expect(ref.current?.getValue()).toContain("stable");
    });

    it("value prop and imperative setValue do not interfere when used together", () => {
      // Controlled mode (value prop) takes priority on the next render cycle;
      // imperative setValue is synchronous and fires immediately.
      const ref = { current: null };
      const { rerender } = render(
        <MentionTextarea ref={ref} projectId={PROJECT_ID} value="from prop" />,
      );

      act(() => {
        ref.current?.setValue("imperative override");
      });
      // Immediately after the imperative call the editor reflects the override
      expect(ref.current?.getValue()).toContain("imperative override");

      // After a rerender with the same value prop the controlled value wins
      rerender(<MentionTextarea ref={ref} projectId={PROJECT_ID} value="from prop" />);
      expect(ref.current?.getValue()).toContain("from prop");
    });

    it("treats value=undefined as uncontrolled (editor content not reset)", () => {
      // When value is undefined the useEffect short-circuits; the editor is
      // left in its current state.
      const ref = { current: null };
      render(<MentionTextarea ref={ref} projectId={PROJECT_ID} />);

      act(() => {
        ref.current?.setValue("user typed this");
      });

      // No value prop → no sync → content preserved
      expect(ref.current?.getValue()).toContain("user typed this");
    });
  });
});