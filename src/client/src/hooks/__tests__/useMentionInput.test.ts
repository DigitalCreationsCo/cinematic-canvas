// src/client/src/hooks/__tests__/useMentionInput.test.ts
// Unit tests for useMentionInput — focuses on DOM helper functions
// and the hook's public interface behaviour.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useMentionInput,
  __testing,
} from "#client/hooks/useMentionInput.js";
import { useMentionStore } from "#client/store/useMentionStore.js";
import type { MentionSuggestion } from "#shared/types/mention.types.js";

// ─── Mock API ─────────────────────────────────────────────────────────────────

vi.mock("#client/lib/api.js", () => ({
  getMentionSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
}));

// ─── Test fixtures ────────────────────────────────────────────────────────────

const PROJECT_ID = "test-project-123";

const LUKE: MentionSuggestion = {
  handle: "@LukeSkywalker",
  displayName: "Luke Skywalker",
  entityType: "character",
  scope: "project",
};

const HAN: MentionSuggestion = {
  handle: "@HanSolo",
  displayName: "Han Solo",
  entityType: "character",
  scope: "project",
};

// ─── DOM helpers used across tests ────────────────────────────────────────────

/**
 * Recursively finds the first Text node in the container,
 * optionally skipping text nodes inside contentEditable="false" elements.
 */
function findFirstText(node: Node, skipEditableFalse = false): Text | null {
  if (node.nodeType === Node.TEXT_NODE) {
    // Skip text inside contentEditable=false elements (like mention chips)
    if (skipEditableFalse) {
      let parent = node.parentElement;
      while (parent) {
        if (parent.getAttribute?.("contenteditable") === "false") return null;
        parent = parent.parentElement;
      }
    }
    return node as Text;
  }
  for (let i = 0; i < node.childNodes.length; i++) {
    const found = findFirstText(node.childNodes[i], skipEditableFalse);
    if (found) return found;
  }
  return null;
}

/**
 * Finds a text node containing the given substring, skipping contentEditable=false
 * elements. Returns null if not found.
 */
function findTextContaining(container: Node, substr: string): Text | null {
  function walk(node: Node): Text | null {
    if (node.nodeType === Node.TEXT_NODE) {
      let parent = node.parentElement;
      let skip = false;
      while (parent) {
        if (parent.getAttribute?.("contenteditable") === "false") { skip = true; break; }
        parent = parent.parentElement;
      }
      if (!skip && (node as Text).textContent?.includes(substr)) return node as Text;
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      const found = walk(node.childNodes[i]);
      if (found) return found;
    }
    return null;
  }
  return walk(container);
}

/**
 * Sets the window selection to a specific offset within a text node.
 * If offset exceeds the text node length, the caret is placed at the end.
 */
function setSelection(container: Node, offset: number, skipEditableFalse = false): Text {
  const textNode = findFirstText(container, skipEditableFalse);
  if (!textNode) throw new Error("No text node found in container");

  const clamped = Math.min(offset, textNode.length);
  const range = document.createRange();
  range.setStart(textNode, clamped);
  range.collapse(true);

  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  return textNode;
}

/**
 * Creates a contentEditable div, appends it to the body, and returns it.
 */
function setupEditor(html: string): HTMLDivElement {
  const div = document.createElement("div");
  div.contentEditable = "true";
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

function teardownEditor(div: HTMLDivElement): void {
  if (div.parentNode) document.body.removeChild(div);
}

// ─── __testing.insertMentionChip tests ────────────────────────────────────────

describe("__testing.insertMentionChip", () => {
  let editor: HTMLDivElement;

  beforeEach(() => {
    editor = setupEditor("Hello @Luke");
  });

  afterEach(() => {
    teardownEditor(editor);
  });

  it("inserts a chip element at the caret position and removes the @query text", () => {
    // "Hello @Luke" → text node length = 11, place caret at position 11 (end)
    setSelection(editor, 11);

    act(() => {
      __testing.insertMentionChip(LUKE, 4);
    });

    const chip = editor.querySelector('[data-type="mention"]');
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute("data-handle")).toBe("@LukeSkywalker");

    // "@Luke" is gone from text content; only the chip text "@Luke Skywalker" remains
    expect(editor.textContent).toBe("Hello @Luke Skywalker");

    // Chip text should be "@Luke Skywalker"
    expect(chip?.textContent).toBe("@Luke Skywalker");

    // There should be NO zero-width space after the chip
    expect(editor.innerHTML).not.toContain("\u200B");
  });

  it("does not insert any zero-width space after the chip", () => {
    setSelection(editor, 11);

    act(() => {
      __testing.insertMentionChip(LUKE, 4);
    });

    // The innerHTML should not contain \u200B anywhere
    expect(editor.innerHTML).not.toContain("\u200B");

    // The DOM should end with the chip element (or text after it, but no ZWSP)
    const chips = editor.querySelectorAll('[data-type="mention"]');
    expect(chips.length).toBe(1);
  });

  it("inserts chip when text follows the mention trigger", () => {
    editor.innerHTML = "Hello @Luke and friends";
    // "Hello @Luke and friends" → 24 chars, set caret at position 11
    // (after "Hello @Luke", right before " and friends")
    setSelection(editor, 11);

    act(() => {
      __testing.insertMentionChip(LUKE, 4);
    });

    const chip = editor.querySelector('[data-type="mention"]');
    expect(chip).not.toBeNull();

    // The text content should contain both "Hello", chip text, and "friends"
    expect(editor.textContent).toContain("Hello");
    expect(editor.textContent).toContain("@Luke Skywalker");
    expect(editor.textContent).toContain("friends");
    // "@Luke" (the raw trigger) should not appear as plain text
    expect(editor.textContent).not.toContain("@Luke and");
  });

  it("returns early when there is no selection", () => {
    const sel = window.getSelection();
    sel?.removeAllRanges();

    act(() => {
      __testing.insertMentionChip(LUKE, 4);
    });

    expect(editor.querySelector('[data-type="mention"]')).toBeNull();
  });

  it("restores a saved selection when current selection is empty", () => {
    // Create a saved selection
    setSelection(editor, 11);
    const savedRange = window.getSelection()?.getRangeAt(0).cloneRange();

    // Clear selection
    window.getSelection()?.removeAllRanges();
    expect(window.getSelection()?.rangeCount).toBe(0);

    act(() => {
      __testing.insertMentionChip(LUKE, 4, savedRange ?? null);
    });

    // The chip should be inserted because the saved selection was restored
    const chip = editor.querySelector('[data-type="mention"]');
    expect(chip).not.toBeNull();
  });
});

// ─── hasExistingMention tests ─────────────────────────────────────────────────

describe("__testing.hasExistingMention", () => {
  it("returns true when the handle exists in the editor", () => {
    const editor = setupEditor(
      '<span data-type="mention" data-handle="@LukeSkywalker">@Luke Skywalker</span>',
    );

    expect(__testing.hasExistingMention(editor, "@LukeSkywalker")).toBe(true);
    expect(__testing.hasExistingMention(editor, "@HanSolo")).toBe(false);

    teardownEditor(editor);
  });

  it("returns false for an empty editor", () => {
    const editor = setupEditor("");
    expect(__testing.hasExistingMention(editor, "@LukeSkywalker")).toBe(false);
    teardownEditor(editor);
  });

  it("returns false when the editor has text but no chips", () => {
    const editor = setupEditor("Just some plain text");
    expect(__testing.hasExistingMention(editor, "@LukeSkywalker")).toBe(false);
    teardownEditor(editor);
  });

  it("is case-sensitive for handles", () => {
    const editor = setupEditor(
      '<span data-type="mention" data-handle="@LukeSkywalker">@Luke Skywalker</span>',
    );

    expect(__testing.hasExistingMention(editor, "@lukeskywalker")).toBe(false);
    expect(__testing.hasExistingMention(editor, "@LukeSkywalker")).toBe(true);

    teardownEditor(editor);
  });

  it("detects multiple different handles in the same editor", () => {
    const editor = setupEditor(
      '<span data-type="mention" data-handle="@LukeSkywalker">@Luke Skywalker</span>' +
        " and " +
        '<span data-type="mention" data-handle="@HanSolo">@Han Solo</span>',
    );

    expect(__testing.hasExistingMention(editor, "@LukeSkywalker")).toBe(true);
    expect(__testing.hasExistingMention(editor, "@HanSolo")).toBe(true);
    expect(__testing.hasExistingMention(editor, "@Yoda")).toBe(false);

    teardownEditor(editor);
  });
});

// ─── getActiveTrigger tests ───────────────────────────────────────────────────

describe("__testing.getActiveTrigger", () => {
  let editor: HTMLDivElement;

  beforeEach(() => {
    editor = setupEditor("");
  });

  afterEach(() => {
    teardownEditor(editor);
  });

  it("returns null when there is no selection", () => {
    window.getSelection()?.removeAllRanges();
    expect(__testing.getActiveTrigger()).toBeNull();
  });

  it("returns null when selection is not in a text node", () => {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    expect(__testing.getActiveTrigger()).toBeNull();
  });

  it("returns a query when caret is after @ with no space", () => {
    editor.innerHTML = "Write about @Luke";
    // Find the @ and place the caret after "Luke"
    const textNode = findFirstText(editor);
    const text = textNode?.textContent ?? "";
    const atIdx = text.indexOf("@");
    // Place caret after the last character of "Luke"
    setSelection(editor, atIdx + 5);

    const result = __testing.getActiveTrigger();
    expect(result).not.toBeNull();
    expect(result?.query).toBe("Luke");
  });

  it("returns null when there is a space after @", () => {
    editor.innerHTML = "Write about @ Luke";
    const textNode = findFirstText(editor);
    const text = textNode?.textContent ?? "";
    // Place caret at the end of the text
    setSelection(editor, text.length);

    const result = __testing.getActiveTrigger();
    expect(result).toBeNull();
  });

  it("returns null when there is no @ before caret", () => {
    editor.innerHTML = "Hello World";
    setSelection(editor, "Hello World".length);

    expect(__testing.getActiveTrigger()).toBeNull();
  });

  it("returns the correct query for partial input", () => {
    editor.innerHTML = "Mention @Lu";
    const textNode = findFirstText(editor);
    const text = textNode?.textContent ?? "";
    const atIdx = text.indexOf("@");
    setSelection(editor, atIdx + 3); // after "@Lu"

    const result = __testing.getActiveTrigger();
    expect(result?.query).toBe("Lu");
  });

  it("handles multiple @ by using the last one", () => {
    editor.innerHTML = "@ already used, now @Lu";
    const textNode = findFirstText(editor);
    const text = textNode?.textContent ?? "";
    const atIdx = text.lastIndexOf("@");
    setSelection(editor, atIdx + 3); // after "@Lu"

    const result = __testing.getActiveTrigger();
    expect(result?.query).toBe("Lu");
  });

  it("returns null when caret is before the @ in the text", () => {
    editor.innerHTML = "some @text here";
    setSelection(editor, 4); // before "@"

    expect(__testing.getActiveTrigger()).toBeNull();
  });

  it("returns empty string when caret is immediately after @", () => {
    editor.innerHTML = "Hello @";
    const textNode = findFirstText(editor);
    const text = textNode?.textContent ?? "";
    const atIdx = text.indexOf("@");
    setSelection(editor, atIdx + 1); // immediately after "@"

    const result = __testing.getActiveTrigger();
    expect(result).not.toBeNull();
    expect(result?.query).toBe("");
  });
});

// ─── serialize tests ──────────────────────────────────────────────────────────

describe("__testing.serialize", () => {
  it("serializes plain text", () => {
    const editor = setupEditor("Hello World");
    expect(__testing.serialize(editor)).toBe("Hello World");
    teardownEditor(editor);
  });

  it("preserves mention chip outerHTML", () => {
    const editor = setupEditor(
      'Hello <span data-type="mention" data-handle="@LukeSkywalker" data-entity-type="character">@Luke Skywalker</span>',
    );
    const result = __testing.serialize(editor);
    expect(result).toContain('data-type="mention"');
    expect(result).toContain('data-handle="@LukeSkywalker"');
    expect(result).not.toContain("\u200B");
    teardownEditor(editor);
  });

  it("strips non-mention HTML tags but preserves text", () => {
    const editor = setupEditor("Hello <b>World</b>");
    expect(__testing.serialize(editor)).toBe("Hello World");
    teardownEditor(editor);
  });

  it("strips zero-width spaces from serialized output (backward compat)", () => {
    const editor = setupEditor("Hello\u200B World");
    expect(__testing.serialize(editor)).toBe("Hello World");
    teardownEditor(editor);
  });

  it("serializes multiple chips with surrounding text", () => {
    const editor = setupEditor(
      'Characters: <span data-type="mention" data-handle="@LukeSkywalker">@Luke</span> and <span data-type="mention" data-handle="@HanSolo">@Han</span>',
    );
    const result = __testing.serialize(editor);
    expect(result).toContain('data-handle="@LukeSkywalker"');
    expect(result).toContain('data-handle="@HanSolo"');
    expect(result).toContain("Characters:");
    expect(result).toContain("and");
    teardownEditor(editor);
  });

  it("serializes a chip inserted by insertMentionChip without trailing ZWSP", () => {
    const editor = setupEditor("Hello @Luke");
    setSelection(editor, 11);

    act(() => {
      __testing.insertMentionChip(LUKE, 4);
    });

    const result = __testing.serialize(editor);
    expect(result).toContain('data-type="mention"');
    expect(result).toContain('data-handle="@LukeSkywalker"');
    // No ZWSP should appear in the serialized output
    expect(result).not.toContain("\u200B");
    // No trailing ZWSP
    expect(result).not.toMatch(/\u200B$/);

    teardownEditor(editor);
  });
});

// ─── Hook integration tests ───────────────────────────────────────────────────

describe("useMentionInput", () => {
  beforeEach(() => {
    useMentionStore.setState({ handleCache: {} });
  });

  it("returns closed trigger state by default", () => {
    const { result } = renderHook(() =>
      useMentionInput({ projectId: PROJECT_ID }),
    );

    expect(result.current.triggerState.isOpen).toBe(false);
    expect(result.current.triggerState.query).toBe("");
    expect(result.current.triggerState.anchorRect).toBeNull();
    expect(result.current.triggerState.selectedIndex).toBe(0);
  });

  it("exposes editorRef, getValue, and setValue", () => {
    const { result } = renderHook(() =>
      useMentionInput({ projectId: PROJECT_ID }),
    );

    expect(result.current.editorRef).toBeDefined();
    expect(result.current.getValue).toBeInstanceOf(Function);
    expect(result.current.setValue).toBeInstanceOf(Function);
    expect(result.current.getValue()).toBe("");
  });

  it("setValue/getValue roundtrip preserves mention chips", () => {
    const { result } = renderHook(() =>
      useMentionInput({ projectId: PROJECT_ID }),
    );

    // Wire up a real DOM element for the editorRef
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);
    (result.current.editorRef as React.MutableRefObject<HTMLDivElement>).current = editor;

    result.current.setValue(
      '<span data-type="mention" data-handle="@LukeSkywalker" data-entity-type="character">@Luke Skywalker</span>',
    );

    const value = result.current.getValue();
    expect(value).toContain('data-type="mention"');
    expect(value).toContain('data-handle="@LukeSkywalker"');

    document.body.removeChild(editor);
  });

  it("setValue/getValue roundtrip strips HTML tags from plain text", () => {
    const { result } = renderHook(() =>
      useMentionInput({ projectId: PROJECT_ID }),
    );

    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);
    (result.current.editorRef as React.MutableRefObject<HTMLDivElement>).current = editor;

    result.current.setValue("<b>Hello</b> <i>World</i>");
    expect(result.current.getValue()).toBe("Hello World");

    document.body.removeChild(editor);
  });

  it("selectSuggestion safely handles null/undefined suggestion", () => {
    const { result } = renderHook(() =>
      useMentionInput({ projectId: PROJECT_ID }),
    );

    act(() => {
      // @ts-expect-error — testing runtime resilience
      result.current.selectSuggestion(null);
    });

    act(() => {
      // @ts-expect-error — testing runtime resilience
      result.current.selectSuggestion(undefined);
    });

    // Should not throw; state should remain closed
    expect(result.current.triggerState.isOpen).toBe(false);
  });

  it("selectSuggestion closes the popover even without an editor", () => {
    const { result } = renderHook(() =>
      useMentionInput({ projectId: PROJECT_ID }),
    );

    act(() => {
      result.current.selectSuggestion(LUKE);
    });

    expect(result.current.triggerState.isOpen).toBe(false);
  });

  it("closeSuggestions sets trigger state to closed", () => {
    const { result } = renderHook(() =>
      useMentionInput({ projectId: PROJECT_ID }),
    );

    act(() => {
      result.current.closeSuggestions();
    });

    expect(result.current.triggerState.isOpen).toBe(false);
  });

  it("handleKeyDown does nothing when popover is closed", () => {
    const { result } = renderHook(() =>
      useMentionInput({ projectId: PROJECT_ID }),
    );

    const event = { key: "Enter", preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
    act(() => {
      // Should not throw or crash
      result.current.handleKeyDown(event);
    });
  });

  it("fires onUpdate when handleInput is called", () => {
    const onUpdate = vi.fn();
    const { result } = renderHook(() =>
      useMentionInput({ projectId: PROJECT_ID, onUpdate }),
    );

    act(() => {
      result.current.handleInput();
    });

    expect(onUpdate).toHaveBeenCalled();
  });

  it("calls onUpdate with serialized content after selectSuggestion", () => {
    const editor = setupEditor("Hello @Luke");
    const onUpdate = vi.fn();

    const { result } = renderHook(() =>
      useMentionInput({ projectId: PROJECT_ID, onUpdate }),
    );

    (result.current.editorRef as React.MutableRefObject<HTMLDivElement>).current = editor;
    setSelection(editor, 11);

    act(() => {
      result.current.selectSuggestion(LUKE);
    });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const serialized = onUpdate.mock.calls[0][0] as string;

    // Should contain the mention chip (no trailing ZWSP)
    expect(serialized).toContain('data-type="mention"');
    expect(serialized).toContain('data-handle="@LukeSkywalker"');
    expect(serialized).not.toContain("\u200B");

    teardownEditor(editor);
  });

  it("does not insert duplicate mentions when same handle already exists", () => {
    const editor = setupEditor(
      'Hello <span data-type="mention" data-handle="@LukeSkywalker" data-entity-type="character">@Luke Skywalker</span> and @Luke',
    );
    const onUpdate = vi.fn();

    const { result } = renderHook(() =>
      useMentionInput({ projectId: PROJECT_ID, onUpdate }),
    );

    (result.current.editorRef as React.MutableRefObject<HTMLDivElement>).current = editor;

    // Find the text node containing "@Luke" that's OUTSIDE the chip
    const textNode = findTextContaining(editor, "@Luke");
    if (textNode) {
      const idx = textNode.textContent!.indexOf("@Luke");
      const range = document.createRange();
      range.setStart(textNode, idx + 5); // after "@Luke"
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    act(() => {
      result.current.selectSuggestion(LUKE);
    });

    // Should NOT insert a second chip — duplicate guard prevents it
    const chips = editor.querySelectorAll('[data-type="mention"]');
    expect(chips.length).toBe(1);

    teardownEditor(editor);
  });

  it("allows adding a different handle even when one already exists", () => {
    const editor = setupEditor(
      'Hello <span data-type="mention" data-handle="@LukeSkywalker" data-entity-type="character">@Luke Skywalker</span> and @Han',
    );
    const onUpdate = vi.fn();

    const { result } = renderHook(() =>
      useMentionInput({ projectId: PROJECT_ID, onUpdate }),
    );

    (result.current.editorRef as React.MutableRefObject<HTMLDivElement>).current = editor;

    // Find the text node containing "@Han" (outside the chip)
    const textNode = findTextContaining(editor, "@Han");
    if (textNode) {
      const idx = textNode.textContent!.indexOf("@Han");
      const range = document.createRange();
      range.setStart(textNode, idx + 4); // after "@Han"
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    act(() => {
      result.current.selectSuggestion(HAN);
    });

    // Two different chips should exist
    const chips = editor.querySelectorAll('[data-type="mention"]');
    expect(chips.length).toBe(2);

    teardownEditor(editor);
  });

  it("handleInput does not suppress next @ after chip insertion", () => {
    // This test verifies that suppressNextInputRef has been removed:
    // typing @ immediately after inserting a mention should detect the trigger.
    const editor = setupEditor("Hello @Luke");
    const onUpdate = vi.fn();

    const { result } = renderHook(() =>
      useMentionInput({ projectId: PROJECT_ID, onUpdate }),
    );

    (result.current.editorRef as React.MutableRefObject<HTMLDivElement>).current = editor;
    setSelection(editor, 11);

    // Insert the chip
    act(() => {
      result.current.selectSuggestion(LUKE);
    });

    // Now simulate typing "@" immediately after the chip.
    // First, figure out where the caret is (should be after the chip).
    // We need to insert "@" text manually since we can't fire a real keyboard event.
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const r = sel.getRangeAt(0);
      // Insert "@" text at the caret position (which is after the chip)
      const atNode = document.createTextNode("@");
      r.insertNode(atNode);
      const newRange = document.createRange();
      newRange.setStart(atNode, 1);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    // Now simulate the input event
    act(() => {
      result.current.handleInput();
    });

    // The popover should be open because we just typed @
    expect(result.current.triggerState.isOpen).toBe(true);
    expect(result.current.triggerState.query).toBe("");

    teardownEditor(editor);
  });

  it("handleInput closes the popover when trigger is not active", () => {
    const editor = setupEditor("Just some plain text");
    const onUpdate = vi.fn();

    const { result } = renderHook(() =>
      useMentionInput({ projectId: PROJECT_ID, onUpdate }),
    );

    (result.current.editorRef as React.MutableRefObject<HTMLDivElement>).current = editor;
    setSelection(editor, 20);

    act(() => {
      result.current.handleInput();
    });

    // Popover should be closed since there's no @ trigger
    expect(result.current.triggerState.isOpen).toBe(false);
  });
});
