// components/editor/mention/MentionPopover.tsx
// Suggestion dropdown rendered as a React portal, positioned at the caret.
// Receives all state from useMentionInput — owns no state of its own.

'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '#client/lib/utils.js';
import type { MentionSuggestion } from '../../../../../shared/types/mention.types.js';
import type { MentionTriggerState } from '../../../hooks/useMentionInput.js';

// ─── Entity type badge colours ────────────────────────────────────────────────

const ENTITY_BADGE: Record<string, string> = {
  character: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  location: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  prop: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface MentionPopoverProps {
  triggerState: MentionTriggerState;
  suggestions: MentionSuggestion[];
  onSelect: (suggestion: MentionSuggestion) => void;
  onClose: () => void;
}

export function MentionPopover({
  triggerState,
  suggestions,
  onSelect,
  onClose,
}: MentionPopoverProps) {
  const { isOpen, anchorRect, selectedIndex } = triggerState;
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside the popover
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  if (!isOpen || !anchorRect) return null;

  return createPortal(
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Mention suggestions"
      style={{
        position: 'fixed',
        top: anchorRect.bottom + 6,
        left: anchorRect.left,
        zIndex: 9999,
      }}
      className="min-w-[240px] max-w-sm rounded-none border bg-popover text-popover-foreground shadow-lg overflow-hidden"
    >
      {suggestions.length === 0 ? (
        <div className="px-3 py-2.5 text-sm text-muted-foreground select-none">
          No matches found
        </div>
      ) : (
        suggestions.map((s, i) => (
          <div
            key={s.handle}
            role="option"
            aria-selected={i === selectedIndex}
            className={cn(
              'flex items-center justify-between gap-3 px-3 py-2 cursor-pointer text-sm transition-colors select-none',
              i === selectedIndex
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/50'
            )}
            // onMouseDown instead of onClick: preventDefault keeps focus inside
            // the contentEditable editor so typing can resume immediately.
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(s);
            }}
          >
            {/* Handle + display name */}
            <div className="flex flex-col min-w-0">
              <span className="font-mono text-[11px] text-muted-foreground truncate">
                {s.handle}
              </span>
              <span className="font-medium truncate">{s.displayName}</span>
            </div>

            {/* Badges */}
            <div className="flex gap-1 shrink-0 items-center">
              <span
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-none border font-mono leading-none',
                  ENTITY_BADGE[s.entityType] ?? 'bg-muted text-muted-foreground border-border'
                )}
              >
                {s.entityType}
              </span>
              {s.scope === 'world' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-none border bg-muted text-muted-foreground border-border font-mono leading-none">
                  world
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>,
    document.body
  );
}