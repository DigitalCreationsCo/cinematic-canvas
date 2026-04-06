// hooks/useMentionInput.ts
// Core hook for mention-aware contentEditable fields.
// Handles: @ trigger detection, suggestion state, chip insertion, DOM serialization.
// No Tiptap. No global UI state. Safe for multiple concurrent instances.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMentionStore } from '../store/useMentionStore.js';
import { getMentionSuggestions } from '../lib/api.js';
import type { MentionSuggestion } from '../../../shared/types/mention.types.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface MentionTriggerState {
  isOpen: boolean;
  query: string;
  /** Viewport-relative rect of the caret — used to position the popover. */
  anchorRect: DOMRect | null;
  selectedIndex: number;
}

export interface UseMentionInputOptions {
  projectId: string;
  initialContent?: string;
  onUpdate?: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
}

export interface UseMentionInputResult {
  editorRef: React.RefObject<HTMLDivElement>;
  triggerState: MentionTriggerState;
  suggestions: MentionSuggestion[];
  isLoading: boolean;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleInput: () => void;
  selectSuggestion: (suggestion: MentionSuggestion) => void;
  closeSuggestions: () => void;
  getValue: () => string;
  setValue: (html: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLOSED: MentionTriggerState = {
  isOpen: false,
  query: '',
  anchorRect: null,
  selectedIndex: 0,
};

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Walks the contentEditable DOM and produces clean HTML:
 * - Text nodes → plain text
 * - Mention chip spans (data-type="mention") → outerHTML preserved for KBHydrator
 * - <br> → newline
 * - Block <div> wrappers (Chrome line wrapping) → newline + inner content
 * - All other elements → recursed, tags stripped
 */
function serializeNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // Strip zero-width spaces inserted after chips
    return (node.textContent ?? '').replace(/\u200B/g, '');
  }
  if (!(node instanceof HTMLElement)) return '';
  if (node.getAttribute('data-type') === 'mention') return node.outerHTML;
  if (node.tagName === 'BR') return '\n';
  const inner = Array.from(node.childNodes).map(serializeNode).join('');
  return node.tagName === 'DIV' ? '\n' + inner : inner;
}

function serialize(el: HTMLElement): string {
  return Array.from(el.childNodes)
    .map(serializeNode)
    .join('')
    .replace(/^\n/, ''); // trim leading newline from first div wrapper
}

/**
 * If the caret is inside an active @mention trigger (no space after @),
 * returns the query string. Otherwise returns null.
 */
function getActiveTrigger(): { query: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const { startContainer, startOffset } = sel.getRangeAt(0);
  if (startContainer.nodeType !== Node.TEXT_NODE) return null;

  const textBefore = (startContainer.textContent ?? '').slice(0, startOffset);
  const atIdx = textBefore.lastIndexOf('@');
  if (atIdx === -1) return null;

  const query = textBefore.slice(atIdx + 1);
  // A space or newline after @ closes the trigger
  if (/\s/.test(query)) return null;

  return { query };
}

function getCaretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return sel.getRangeAt(0).cloneRange().getBoundingClientRect();
}

/**
 * Deletes the @query text from the caret position and inserts a mention chip
 * followed by a zero-width space to anchor the cursor in a text node.
 */
function insertMentionChip(suggestion: MentionSuggestion, queryLength: number): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);

  // 1. Delete '@' + query characters before caret
  const deleteRange = range.cloneRange();
  deleteRange.setStart(range.startContainer, range.startOffset - queryLength - 1);
  deleteRange.deleteContents();

  // 2. Build the chip element
  const chip = document.createElement('span');
  chip.setAttribute('data-type', 'mention');
  chip.setAttribute('data-handle', suggestion.handle);
  chip.setAttribute('data-entity-type', suggestion.entityType);
  chip.contentEditable = 'false';
  chip.className = 'mention-chip';
  chip.textContent = `@${suggestion.displayName || suggestion.handle}`;

  // 3. Insert chip at collapsed caret
  const insertRange = sel.getRangeAt(0);
  insertRange.insertNode(chip);

  // 4. Position caret immediately after chip
  const afterChip = document.createRange();
  afterChip.setStartAfter(chip);
  afterChip.collapse(true);
  sel.removeAllRanges();
  sel.addRange(afterChip);

  // 5. Insert zero-width space so caret lands in a text node (not inside the chip)
  const zwsp = document.createTextNode('\u200B');
  const zwspRange = sel.getRangeAt(0);
  zwspRange.insertNode(zwsp);

  const finalRange = document.createRange();
  finalRange.setStart(zwsp, 1);
  finalRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(finalRange);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMentionInput({
  projectId,
  initialContent = '',
  onUpdate,
  editable = true,
}: UseMentionInputOptions): UseMentionInputResult {
  const editorRef = useRef<HTMLDivElement>(null);
  const [triggerState, setTriggerState] = useState<MentionTriggerState>(CLOSED);
  const [isLoading, setIsLoading] = useState(false);

  // Prevents the synthetic input event fired after chip insertion from
  // immediately re-opening the suggestion popover.
  const suppressNextInputRef = useRef(false);

  const { setHandles, getFiltered, hasLoaded } = useMentionStore();

  // ── Preload handles once per project ────────────────────────────────────────
  useEffect(() => {
    if (hasLoaded(projectId)) return;
    setIsLoading(true);
    getMentionSuggestions(projectId, '')
      .then((r) => setHandles(projectId, r.suggestions))
      .catch((err) => console.error('[useMentionInput] Failed to load handles:', err))
      .finally(() => setIsLoading(false));
  }, [projectId]);

  // ── Populate initial content on mount only ───────────────────────────────
  useEffect(() => {
    if (editorRef.current && initialContent) {
      editorRef.current.innerHTML = initialContent;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = getFiltered(projectId, triggerState.query);

  // ── Hybrid re-fetch: server call when local cache returns nothing ────────
  useEffect(() => {
    if (!triggerState.isOpen || !triggerState.query || suggestions.length > 0) return;
    getMentionSuggestions(projectId, triggerState.query)
      .then((r) => setHandles(projectId, r.suggestions))
      .catch(() => { });
  }, [triggerState.query, triggerState.isOpen, suggestions.length]);

  // ── Serialization ────────────────────────────────────────────────────────
  const getValue = useCallback((): string => {
    if (!editorRef.current) return '';
    return serialize(editorRef.current);
  }, []);

  const setValue = useCallback((html: string) => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = html;
  }, []);

  const closeSuggestions = useCallback(() => setTriggerState(CLOSED), []);

  // ── Insert chip and close popover ────────────────────────────────────────
  const selectSuggestion = useCallback(
    (suggestion: MentionSuggestion) => {
      suppressNextInputRef.current = true;
      insertMentionChip(suggestion, triggerState.query.length);
      closeSuggestions();
      if (editorRef.current) {
        onUpdate?.(serialize(editorRef.current));
        editorRef.current.focus();
      }
    },
    [triggerState.query.length, closeSuggestions, onUpdate]
  );

  // ── Input handler ────────────────────────────────────────────────────────
  const handleInput = useCallback(() => {
    // Swallow the event generated by our own chip insertion
    if (suppressNextInputRef.current) {
      suppressNextInputRef.current = false;
      onUpdate?.(editorRef.current ? serialize(editorRef.current) : '');
      return;
    }

    onUpdate?.(editorRef.current ? serialize(editorRef.current) : '');

    const trigger = getActiveTrigger();
    if (trigger) {
      const rect = getCaretRect();
      setTriggerState((prev) => ({
        isOpen: true,
        query: trigger.query,
        anchorRect: rect,
        // Reset index only when the query actually changes
        selectedIndex: trigger.query !== prev.query ? 0 : prev.selectedIndex,
      }));
    } else {
      closeSuggestions();
    }
  }, [onUpdate, closeSuggestions]);

  // ── Keyboard handler ─────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!triggerState.isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setTriggerState((p) => ({
            ...p,
            selectedIndex: Math.min(p.selectedIndex + 1, suggestions.length - 1),
          }));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setTriggerState((p) => ({
            ...p,
            selectedIndex: Math.max(p.selectedIndex - 1, 0),
          }));
          break;
        case 'Enter':
          e.preventDefault();
          if (suggestions[triggerState.selectedIndex]) {
            selectSuggestion(suggestions[triggerState.selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          closeSuggestions();
          break;
      }
    },
    [triggerState, suggestions, selectSuggestion, closeSuggestions]
  );

  return {
    editorRef: editorRef as React.RefObject<HTMLDivElement>,
    triggerState,
    suggestions,
    isLoading,
    handleKeyDown,
    handleInput,
    selectSuggestion,
    closeSuggestions,
    getValue,
    setValue,
  };
}