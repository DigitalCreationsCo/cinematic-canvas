// components/editor/mention/MentionTextarea.tsx
// Drop-in replacement for <Textarea> that supports @mention chips.
// Styled using the same base classNamees as Textarea for visual consistency.
// Use the imperative ref handle to read/write content programmatically.

"use client";

import "./mention.css";

import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
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

// ─── Props ────────────────────────────────────────────────────────────────────

interface MentionTextareaProps extends Omit<UseMentionInputOptions, "editable"> {
  className?: string;
  /** Approximate row height (each row ≈ 1.5rem). Default: 5. */
  rows?: number;
  disabled?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const MentionTextarea = forwardRef<MentionTextareaHandle, MentionTextareaProps>(
  (
    {
      projectId,
      initialContent,
      onUpdate,
      placeholder,
      className,
      rows = 5,
      disabled = false,
      ...props
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
      handleKeyDown,
      handleInput,
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

    // Expose imperative handle to parent (e.g. for reading on submit)
    useImperativeHandle(ref, () => ({
      getValue,
      setValue: (html) => {
        setValue(html);
        const text = html.replace(/<[^>]*>/g, "").trim();
        setIsEmpty(!text);
      },
      focus: () => editorRef.current?.focus(),
    }));

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
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          className={cn(
            textareaBaseClasses,
            "overflow-y-auto whitespace-pre-wrap break-words",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            disabled && "cursor-not-allowed opacity-50",
            className,
          )}
          style={{ minHeight: `${rows * 1.5}rem` }}
          role="textbox"
          aria-multiline="true"
          aria-placeholder={placeholder}
          {...props}
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
