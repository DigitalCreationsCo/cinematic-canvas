// src/client/src/components/editor/mention/MentionPopover.tsx
// Suggestion dropdown UI for entity mentions

'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { MentionSuggestion } from './MentionExtension.js';
import { useMentionStore } from '../../../store/useMentionStore.js';

interface MentionPopoverProps {
  position: { top: number; left: number };
  onSelect: (suggestion: MentionSuggestion) => void;
  onClose: () => void;
}

export function MentionPopover({ position, onSelect, onClose }: MentionPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { suggestions, suggestionIndex, selectSuggestion } = useMentionStore();

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectSuggestion(Math.min(suggestionIndex + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectSuggestion(Math.max(suggestionIndex - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        if (suggestions[suggestionIndex]) {
          onSelect(suggestions[suggestionIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        onClose();
        break;
    }
  }, [suggestions, suggestionIndex, selectSuggestion, onSelect, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (suggestions.length === 0) {
    return (
      <div
        ref={containerRef}
        className="mention-popover mention-popover-empty"
        style={{ top: position.top, left: position.left }}
      >
        <div className="mention-popover-empty-text">No matches found</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mention-popover"
      style={{ top: position.top, left: position.left }}
    >
      {suggestions.map((suggestion, index) => (
        <div
          key={suggestion.handle}
          className={`mention-popover-item ${index === suggestionIndex ? 'is-selected' : ''}`}
          onClick={() => onSelect(suggestion)}
          onMouseEnter={() => selectSuggestion(index)}
        >
          <div className="mention-popover-item-avatar">
            {suggestion.avatarUrl ? (
              <img src={suggestion.avatarUrl} alt={suggestion.displayName} />
            ) : (
              <span className="mention-popover-item-avatar-placeholder">
                {suggestion.displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="mention-popover-item-content">
            <div className="mention-popover-item-handle">{suggestion.handle}</div>
            <div className="mention-popover-item-name">{suggestion.displayName}</div>
          </div>
          <div className="mention-popover-item-badge">
            <span className={`badge badge-${suggestion.entityType}`}>
              {suggestion.entityType}
            </span>
            {suggestion.scope === 'world' && (
              <span className="badge badge-world">World</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
