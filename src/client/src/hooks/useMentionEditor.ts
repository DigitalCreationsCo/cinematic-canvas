// src/client/src/hooks/useMentionEditor.ts
// Hook for integrating mentions into any Tiptap editor

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import { useMentionStore } from '../store/useMentionStore.js';
import { getMentionSuggestions, resolveMentions } from '../lib/api.js';
import type { MentionSuggestion } from '../lib/api.js';

interface UseMentionEditorOptions {
  projectId: string;
  initialContent?: string;
  onUpdate?: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
}

interface UseMentionEditorResult {
  editor: Editor | null;
  isLoading: boolean;
  error: string | null;
  hydrateContent: () => Promise<string>;
}

export function useMentionEditor({
  projectId,
  initialContent = '',
  onUpdate,
  placeholder = 'Start typing...',
  editable = true,
}: UseMentionEditorOptions): UseMentionEditorResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });

  const {
    accessibleHandles,
    setAccessibleHandles,
    isSuggestionOpen,
    openSuggestions,
    closeSuggestions,
    updateSuggestions,
    suggestionIndex,
    selectSuggestion,
    getFilteredSuggestions,
  } = useMentionStore();

  const loadSuggestions = useCallback(async () => {
    try {
      const response = await getMentionSuggestions(projectId, '');
      setAccessibleHandles(response.suggestions);
    } catch (err) {
      console.error('Failed to load mention suggestions:', err);
    }
  }, [projectId, setAccessibleHandles]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: {
          'data-type': 'mention',
        },
        renderLabel: ({ node }) => {
          return `@${node.attrs.label ?? node.attrs.id}`;
        },
        suggestion: {
          items: ({ query }) => {
            const filtered = getFilteredSuggestions(query);
            return filtered.map((s) => ({
              handle: s.handle,
              label: s.displayName,
              entityType: s.entityType,
              avatarUrl: s.avatarUrl,
              scope: s.scope,
            }));
          },
          onStart: ({ editor, clientRect }) => {
            const query = getQueryFromEditor(editor);
            const filtered = getFilteredSuggestions(query);
            updateSuggestions(filtered);
            openSuggestions(query);

            if (clientRect) {
              const rect = clientRect();
              setPopoverPosition({
                top: rect.top + rect.height + 4,
                left: rect.left,
              });
            }
          },
          onUpdate: ({ editor, clientRect }) => {
            const query = getQueryFromEditor(editor);
            const filtered = getFilteredSuggestions(query);
            updateSuggestions(filtered);
            openSuggestions(query);

            if (clientRect) {
              const rect = clientRect();
              setPopoverPosition({
                top: rect.top + rect.height + 4,
                left: rect.left,
              });
            }
          },
          onExit: () => {
            closeSuggestions();
          },
          onKeyDown: ({ event }) => {
            if (event.key === 'ArrowDown') {
              selectSuggestion(Math.min(suggestionIndex + 1, useMentionStore.getState().suggestions.length - 1));
              return true;
            }
            if (event.key === 'ArrowUp') {
              selectSuggestion(Math.max(suggestionIndex - 1, 0));
              return true;
            }
            if (event.key === 'Enter') {
              const suggestions = useMentionStore.getState().suggestions;
              if (suggestions[suggestionIndex]) {
                insertMention(editor, suggestions[suggestionIndex]);
                closeSuggestions();
                return true;
              }
            }
            if (event.key === 'Escape') {
              closeSuggestions();
              return true;
            }
            return false;
          },
        },
      }),
    ],
    content: initialContent,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onUpdate?.(html);
    },
    editorProps: {
      attributes: {
        'data-placeholder': placeholder,
        class: 'mention-editor',
      },
    },
  });

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const hydrateContent = useCallback(async () => {
    if (!editor) return '';

    setIsLoading(true);
    setError(null);

    try {
      const html = editor.getHTML();
      const result = await resolveMentions({
        htmlInput: html,
        projectId,
      });

      if (result.success && result.prompt) {
        editor.commands.setContent(result.prompt);
        return result.prompt;
      } else if (result.errors.length > 0) {
        setError(result.errors.join(', '));
      }

      return html;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Hydration failed';
      setError(errorMessage);
      return editor.getHTML();
    } finally {
      setIsLoading(false);
    }
  }, [editor, projectId]);

  return {
    editor,
    isLoading,
    error,
    hydrateContent,
  };
}

function getQueryFromEditor(editor: Editor): string {
  const { from } = editor.state.selection;
  const $from = editor.state.doc.resolve(from);
  const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
  const triggerIndex = textBefore.lastIndexOf('@');

  if (triggerIndex === -1) return '';
  return textBefore.slice(triggerIndex + 1);
}

function insertMention(editor: Editor, suggestion: MentionSuggestion) {
  const { from, to } = editor.state.selection;
  const $from = editor.state.doc.resolve(from);
  const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
  const triggerIndex = textBefore.lastIndexOf('@');

  if (triggerIndex !== -1) {
    const deleteFrom = from - ($from.parentOffset - triggerIndex);
    editor
      .chain()
      .focus()
      .deleteRange({ from: deleteFrom, to })
      .insertContent(suggestion.handle)
      .run();
  }
}

export { EditorContent };
