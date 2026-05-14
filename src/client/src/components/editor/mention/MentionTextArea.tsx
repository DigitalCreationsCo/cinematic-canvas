// components/editor/mention/MentionTextarea.tsx
// Drop-in replacement for <Textarea> that supports @mention chips.
// Styled using the same base classes as Textarea for visual consistency.
// Use the imperative ref handle to read/write content programmatically.

"use client";

import "./mention.css";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn } from "#client/lib/utils.js";
import { textareaBaseClasses } from "#client/components/ui/textarea.js";
import {
  useMentionInput,
  type UseMentionInputOptions,
} from "../../../hooks/useMentionInput.js";
import { MentionPopover } from "./MentionPopover.js";

// ─── Public handle exposed via ref ────────────────────────────────────────────

export interface MentionTextareaHandle {
  /** Serialized HTML — mention chips preserved for KBHydrator on the server. */
  getValue: () => string;
  /** Replace editor content with raw HTML or plain text. */
  setValue: (html: string) => void;
  focus: () => void;
}

// ─── Textarea-compatible event/attr surface re-mapped to div ─────────────────
//
// HTMLTextAreaElement events reference HTMLTextAreaElement as their target.
// Since the editor is a contentEditable div we remap each handler to
// HTMLDivElement so callers get the correct event target type without needing
// a cast.  Non-event textarea attrs that make sense on a div are forwarded
// as-is (tabIndex, id, autoFocus, aria-*, data-*).

type DivKeyboardHandler = React.KeyboardEventHandler<HTMLDivElement>;
type DivFocusHandler = React.FocusEventHandler<HTMLDivElement>;
type DivClipboardHandler = React.ClipboardEventHandler<HTMLDivElement>;
type DivCompositionHandler = React.CompositionEventHandler<HTMLDivElement>;
type DivMouseHandler = React.MouseEventHandler<HTMLDivElement>;
type DivPointerHandler = React.PointerEventHandler<HTMLDivElement>;

/** Subset of textarea HTML attributes re-typed for a div host element. */
export interface TextareaCompatAttrs {
  // ── Keyboard ──────────────────────────────────────────────────────────────
  /**
   * Called **after** the internal mention key handler runs.
   * Return value is ignored; call `e.preventDefault()` to suppress default
   * behaviour just as you would on a native textarea.
   */
  onKeyDown?: DivKeyboardHandler;
  onKeyUp?: DivKeyboardHandler;
  onKeyPress?: DivKeyboardHandler; // deprecated but still common in codebases

  // ── Focus ─────────────────────────────────────────────────────────────────
  onFocus?: DivFocusHandler;
  onBlur?: DivFocusHandler;

  // ── Clipboard ─────────────────────────────────────────────────────────────
  onPaste?: DivClipboardHandler;
  onCopy?: DivClipboardHandler;
  onCut?: DivClipboardHandler;

  // ── Composition (IME) ─────────────────────────────────────────────────────
  onCompositionStart?: DivCompositionHandler;
  onCompositionUpdate?: DivCompositionHandler;
  onCompositionEnd?: DivCompositionHandler;

  // ── Mouse / Pointer ───────────────────────────────────────────────────────
  onClick?: DivMouseHandler;
  onDoubleClick?: DivMouseHandler;
  onMouseDown?: DivMouseHandler;
  onMouseUp?: DivMouseHandler;
  onMouseEnter?: DivMouseHandler;
  onMouseLeave?: DivMouseHandler;
  onPointerDown?: DivPointerHandler;
  onPointerUp?: DivPointerHandler;

  // ── Standard HTML attrs ───────────────────────────────────────────────────
  id?: string;
  tabIndex?: number;
  autoFocus?: boolean;
  spellCheck?: boolean;
  lang?: string;
  dir?: "ltr" | "rtl" | "auto";

  // ── ARIA ──────────────────────────────────────────────────────────────────
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-required"?: boolean | "true" | "false";
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  "aria-autocomplete"?: "none" | "list" | "inline" | "both";
  "aria-expanded"?: boolean | "true" | "false";

  // ── Data attributes ───────────────────────────────────────────────────────
  // Index signature kept narrow — only data-* keys accepted.
  [key: `data-${string}`]: string | undefined;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MentionTextareaProps
  extends Omit<UseMentionInputOptions, "editable">,
  TextareaCompatAttrs {
  className?: string;
  /** Approximate row height (each row ≈ 1.5 rem). Default: 5. */
  rows?: number;
  disabled?: boolean;

  /**
   * Controlled plain-text value.  When provided the editor content is kept in
   * sync via a diff-checked effect (avoids cursor jumps on every keystroke).
   * Pass `undefined` to use the editor in uncontrolled mode.
   */
  value?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a composed handler that calls `internal` first, then `external`.
 * If either is undefined the other is returned directly (no wrapper overhead).
 */
function composeHandlers<E>(
  internal: ((e: E) => void) | undefined,
  external: ((e: E) => void) | undefined,
): ((e: E) => void) | undefined {
  if (!internal) return external;
  if (!external) return internal;
  return (e: E) => {
    internal(e);
    external(e);
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export const MentionTextarea = forwardRef<MentionTextareaHandle, MentionTextareaProps>(
  (
    {
      // ── UseMentionInput options ──────────────────────────────────────────
      projectId,
      initialContent,
      onUpdate,
      placeholder,

      // ── Own props ────────────────────────────────────────────────────────
      className,
      rows = 5,
      disabled = false,
      value,

      // ── Composed event handlers ──────────────────────────────────────────
      onKeyDown,
      onKeyUp,
      onKeyPress,
      onFocus,
      onBlur,
      onPaste,
      onCopy,
      onCut,
      onCompositionStart,
      onCompositionUpdate,
      onCompositionEnd,
      onClick,
      onDoubleClick,
      onMouseDown,
      onMouseUp,
      onMouseEnter,
      onMouseLeave,
      onPointerDown,
      onPointerUp,

      // ── Standard / ARIA / data-* attrs ───────────────────────────────────
      id,
      tabIndex,
      autoFocus,
      spellCheck,
      lang,
      dir,
      ...dataAndAriaProps
    },
    ref,
  ) => {
    // Track emptiness locally so we can show/hide the placeholder overlay
    const [isEmpty, setIsEmpty] = useState(!initialContent?.trim());

    const handleUpdate = useCallback(
      (html: string) => {
        // Strip mention chip HTML to detect true empty state
        const text = html
          .replace(/<[^>]*>/g, "")
          .replace(/\u200B/g, "")
          .trim();
        setIsEmpty(!text);
        onUpdate?.(html);
      },
      [onUpdate],
    );

    const {
      editorRef,
      triggerState,
      suggestions,
      handleKeyDown: internalKeyDown,
      handleInput: internalInput,
      selectSuggestion,
      closeSuggestions,
      getValue,
      setValue,
    } = useMentionInput({
      projectId,
      initialContent,
      onUpdate: handleUpdate,
      editable: !disabled,
    });

    // ── Controlled value sync ────────────────────────────────────────────────
    // Only update when the incoming value differs from the editor's current
    // serialised content so we don't interfere with cursor position on every
    // render.
    const prevValueRef = useRef<string | undefined>(undefined);
    useEffect(() => {
      if (value === undefined) return;
      if (value === prevValueRef.current) return;
      prevValueRef.current = value;

      const current = getValue();
      if (current !== value) {
        setValue(value);
        const stripped = value.replace(/<[^>]*>/g, "").trim();
        setIsEmpty(!stripped);
      }
    }, [value, getValue, setValue]);

    // ── autoFocus ────────────────────────────────────────────────────────────
    useEffect(() => {
      if (autoFocus) editorRef.current?.focus();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Expose imperative handle to parent ───────────────────────────────────
    useImperativeHandle(ref, () => ({
      getValue,
      setValue: (html) => {
        setValue(html);
        prevValueRef.current = html;
        const text = html.replace(/<[^>]*>/g, "").trim();
        setIsEmpty(!text);
      },
      focus: () => editorRef.current?.focus(),
    }));

    // ── Composed handlers ────────────────────────────────────────────────────
    // Internal mention logic always runs first; the caller's handler follows.
    // This preserves all internal behaviour (popover dismiss, chip insertion,
    // etc.) while giving the consumer full access to every event.
    const composedKeyDown = composeHandlers(internalKeyDown, onKeyDown);
    const composedInput = composeHandlers(internalInput, undefined); // onInput not exposed; use onUpdate

    return (
      <div className="relative w-full">
        {/* Placeholder overlay — visible only when editor has no content */}
        {isEmpty && placeholder && (
          <div
            aria-hidden
            className="absolute top-2 left-3 text-muted-foreground pointer-events-none text-sm select-none"
          >
            {placeholder}
          </div>
        )}

        {/*
          contentEditable div styled to match <Textarea>.
          Uses the exported textareaBaseClasses constant so both components
          stay pixel-identical without duplicating style strings.
        */}
        <div
          // ── Core editor wiring ─────────────────────────────────────────
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={composedInput}
          // ── Composed handlers (internal ＋ external) ───────────────────
          onKeyDown={composedKeyDown}
          onKeyUp={onKeyUp}
          onKeyPress={onKeyPress}
          onFocus={onFocus}
          onBlur={onBlur}
          onPaste={onPaste}
          onCopy={onCopy}
          onCut={onCut}
          onCompositionStart={onCompositionStart}
          onCompositionUpdate={onCompositionUpdate}
          onCompositionEnd={onCompositionEnd}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          // ── Standard HTML attrs ────────────────────────────────────────
          id={id}
          tabIndex={tabIndex}
          spellCheck={spellCheck}
          lang={lang}
          dir={dir}
          // ── Styling ────────────────────────────────────────────────────
          className={cn(
            textareaBaseClasses,
            "overflow-y-auto whitespace-pre-wrap break-words",
            disabled && "cursor-not-allowed opacity-50",
            className,
          )}
          style={{ minHeight: `${rows * 1.5}rem` }}
          // ── Accessibility ──────────────────────────────────────────────
          role="textbox"
          aria-multiline="true"
          aria-placeholder={placeholder}
          // ── data-* / aria-* passthrough ────────────────────────────────
          {...dataAndAriaProps}
        />

        {/* Suggestion popover — renders into document.body via portal */}
        <MentionPopover
          triggerState={triggerState}
          suggestions={suggestions}
          onSelect={selectSuggestion}
          onClose={closeSuggestions}
        />
      </div>
    );
  },
);

MentionTextarea.displayName = "MentionTextarea";